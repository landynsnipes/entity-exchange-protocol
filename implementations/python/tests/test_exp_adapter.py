"""Dependency-light unit checks for the independently authored Python adapter."""
from __future__ import annotations

import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from exp_adapter import Adapter, ConformanceError, canonical  # noqa: E402
from exp_http_node import ExpHttpNode, JsonStore, NodeError  # noqa: E402


class AdapterUnitTests(unittest.TestCase):
    def test_canonical_json_sorts_nested_keys(self) -> None:
        self.assertEqual(canonical({"z": 1, "a": {"y": 2, "b": 3}}), b'{"a":{"b":3,"y":2},"z":1}')

    def test_canonical_json_matches_javascript_camel_case_order(self) -> None:
        self.assertEqual(
            canonical({"requestSignature": 1, "requesterEntityId": 2, "resultLimit": 3}),
            b'{"requesterEntityId":2,"requestSignature":1,"resultLimit":3}',
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
