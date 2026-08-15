"""Dependency-light unit checks for the independently authored Python adapter."""
from __future__ import annotations

import json
import base64
import sys
import tempfile
import threading
import unittest
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from jsonschema import Draft7Validator

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from canonical_json import CanonicalJsonError, canonical_json_bytes  # noqa: E402
from exp_adapter import Adapter, ConformanceError  # noqa: E402
from exp_http_node import ExpHttpNode, JsonStore, NodeError  # noqa: E402


class AdapterUnitTests(unittest.TestCase):
    def test_resource_limits_reject_oversized_values(self) -> None:
        with self.assertRaisesRegex(CanonicalJsonError, "RESOURCE_STRING_TOO_LARGE"):
            canonical_json_bytes("x" * 4_097)
        with self.assertRaisesRegex(CanonicalJsonError, "RESOURCE_ARRAY_TOO_LARGE"):
            canonical_json_bytes([None] * 101)

    def test_every_committed_schema_is_valid_json_schema(self) -> None:
        schema_directory = Path(__file__).resolve().parents[3] / "schemas"
        schema_files = sorted(schema_directory.glob("*.schema.json"))
        self.assertGreater(len(schema_files), 0)
        for schema_file in schema_files:
            Draft7Validator.check_schema(json.loads(schema_file.read_text(encoding="utf-8")))

    def test_canonical_json_sorts_nested_keys(self) -> None:
        self.assertEqual(canonical_json_bytes({"z": 1, "a": {"y": 2, "b": 3}}), b'{"a":{"b":3,"y":2},"z":1}')

    def test_canonical_json_matches_utf16_key_order(self) -> None:
        self.assertEqual(
            canonical_json_bytes({"😀": True, "𐐷": "deseret", "a": None}),
            '{"a":null,"𐐷":"deseret","😀":true}'.encode("utf-8"),
        )

    def test_canonical_json_matches_committed_signing_vectors(self) -> None:
        vectors = json.loads(
            (Path(__file__).resolve().parents[3] / "test-vectors" / "canonical-signing.json").read_text(encoding="utf-8"),
        )
        public_key = Ed25519PublicKey.from_public_bytes(
            base64.urlsafe_b64decode(vectors["publicKeyBase64url"] + "==="),
        )
        for vector in vectors["vectors"]:
            omitted = set(vector["omittedFields"])
            value = {key: item for key, item in vector["value"].items() if key not in omitted}
            payload = canonical_json_bytes(value)
            self.assertEqual(payload.decode("utf-8"), vector["canonicalJson"])
            self.assertEqual(
                base64.b64encode(payload).decode("ascii"),
                vector["canonicalUtf8Base64"],
            )
            public_key.verify(
                base64.urlsafe_b64decode(vector["signatureBase64url"] + "==="),
                payload,
            )

    def test_transport_policy_restricts_plain_http_to_loopback(self) -> None:
        adapter = Adapter.__new__(Adapter)
        self.assertEqual(adapter.transport_policy({"url": "https://peer.example", "allowInsecureLoopback": False}), {"accepted": True})
        self.assertEqual(adapter.transport_policy({"url": "http://127.0.0.1:4100", "allowInsecureLoopback": True}), {"accepted": True})
        with self.assertRaisesRegex(ConformanceError, "INSECURE_TRANSPORT"):
            adapter.transport_policy({"url": "http://peer.example", "allowInsecureLoopback": True})

    def test_rate_limit_is_bounded_by_request_and_identity(self) -> None:
        node = ExpHttpNode.__new__(ExpHttpNode)
        node.configuration = {"abuse": {"windowSeconds": 60, "maximumRequests": 1, "maximumTrackedPeers": 1}}
        node.rate_lock = threading.Lock()
        node.rate_windows = {}
        node.consume_rate_limit("peer-a")
        with self.assertRaisesRegex(NodeError, "federation request limit"):
            node.consume_rate_limit("peer-a")
        with self.assertRaisesRegex(NodeError, "peer tracking limit"):
            node.consume_rate_limit("peer-b")

    def test_notification_invalidation_persists_and_released_proposal_is_guarded(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            initial = {
                "notifications": [{"proposalId": "proposal-a", "state": "active"}],
                "releases": [], "audit": [],
            }
            node = ExpHttpNode.__new__(ExpHttpNode)
            node.store = JsonStore(path, initial)
            node.invalidate_proposal("proposal-a", {
                "invalidatedAt": "2026-08-09T21:00:00.000Z", "correlationId": "correlation-a",
            })
            reopened = JsonStore(path, {})
            self.assertEqual(reopened.read()["notifications"][0]["state"], "invalidated")
            self.assertEqual(reopened.read()["audit"][0]["kind"], "standing_match_invalidated")

            node.store.update(lambda state: state["releases"].append({"proposalId": "proposal-b"}))
            with self.assertRaisesRegex(NodeError, "released proposal"):
                node.invalidate_proposal("proposal-b", {
                    "invalidatedAt": "2026-08-09T21:01:00.000Z", "correlationId": "correlation-b",
                })


if __name__ == "__main__":
    unittest.main()
