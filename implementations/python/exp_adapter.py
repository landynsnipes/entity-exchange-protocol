"""Independent EXP Trust/transport conformance adapter using published JSON Schemas."""
from __future__ import annotations

import argparse
import base64
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from jsonschema import Draft7Validator, FormatChecker


class ConformanceError(Exception):
    """Expected protocol rejection with a stable conformance error code."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def canonical(value: object) -> bytes:
    def sorted_value(entry: object) -> object:
        if isinstance(entry, list):
            return [sorted_value(item) for item in entry]
        if isinstance(entry, dict):
            # EXP's draft canonical JSON uses JavaScript localeCompare semantics. Case-folding
            # reproduces its ordering for protocol ASCII keys, including camel-case collisions.
            return {key: sorted_value(entry[key]) for key in sorted(entry, key=lambda item: item.casefold())}
        return entry

    return json.dumps(sorted_value(value), separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def without(value: dict[str, Any], keys: set[str]) -> dict[str, Any]:
    return {key: entry for key, entry in value.items() if key not in keys}


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def decode_signature(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + ("=" * (-len(value) % 4)))


def public_key(pem: str) -> Ed25519PublicKey:
    key = serialization.load_pem_public_key(pem.encode("utf-8"))
    if not isinstance(key, Ed25519PublicKey):
        raise ConformanceError("UNSUPPORTED_KEY")
    return key


def verify_signature(payload: bytes, pem: str, signature: str, error_code: str) -> None:
    try:
        public_key(pem).verify(decode_signature(signature), payload)
    except (InvalidSignature, ValueError, TypeError):
        raise ConformanceError(error_code) from None


class Adapter:
    """Stateful only for nonce replay detection; all trust input is explicit."""

    def __init__(self, schema_directory: Path) -> None:
        descriptor_schema = json.loads((schema_directory / "node-descriptor.schema.json").read_text(encoding="utf-8"))
        self.descriptor_validator = Draft7Validator(descriptor_schema, format_checker=FormatChecker())
        self.proposal_validator = self._validator(schema_directory, "connection-proposal.schema.json")
        self.decision_validator = self._validator(schema_directory, "connection-decision.schema.json")
        self.notification_validator = self._validator(schema_directory, "standing-match-notification.schema.json")
        self.release_validator = self._validator(schema_directory, "disclosure-release.schema.json")
        self.invalidation_validator = self._validator(schema_directory, "standing-match-invalidation.schema.json")
        self.nonces: set[str] = set()
        self.proposals: dict[str, dict[str, Any]] = {}
        self.decisions: dict[str, list[dict[str, Any]]] = {}
        self.notifications: dict[str, dict[str, Any]] = {}
        self.releases: dict[str, dict[str, Any]] = {}
        self.invalidations: dict[str, dict[str, Any]] = {}

    @staticmethod
    def _validator(schema_directory: Path, name: str) -> Draft7Validator:
        return Draft7Validator(
            json.loads((schema_directory / name).read_text(encoding="utf-8")),
            format_checker=FormatChecker(),
        )

    def execute(self, command: str, value: dict[str, Any]) -> dict[str, Any]:
        if command == "verify_descriptor_key":
            return self.verify_descriptor_key(value)
        if command == "verify_transport":
            return self.verify_transport(value)
        if command == "transport_policy":
            return self.transport_policy(value)
        if command == "receive_proposal":
            return self.receive_proposal(value)
        if command == "record_decision":
            return self.record_decision(value)
        if command == "receive_invalidation":
            return self.receive_invalidation(value)
        raise ConformanceError("UNKNOWN_COMMAND")

    def verify_descriptor_key(self, value: dict[str, Any]) -> dict[str, Any]:
        descriptor = value["descriptor"]
        anchor = value["anchor"]
        errors = sorted(self.descriptor_validator.iter_errors(descriptor), key=lambda error: list(error.path))
        if errors:
            raise ConformanceError("INVALID_DESCRIPTOR_SCHEMA")
        now = parse_time(value["now"])
        if descriptor["nodeId"] != anchor["nodeId"] or descriptor["operatorEntityId"] != anchor["operatorEntityId"]:
            raise ConformanceError("DESCRIPTOR_IDENTITY_MISMATCH")
        descriptor_origin = urlparse(descriptor["endpoint"])
        anchor_origin = urlparse(anchor["descriptorOrigin"])
        if (descriptor_origin.scheme, descriptor_origin.netloc) != (anchor_origin.scheme, anchor_origin.netloc):
            raise ConformanceError("DESCRIPTOR_ORIGIN_MISMATCH")
        if parse_time(descriptor["expiresAt"]) <= now:
            raise ConformanceError("DESCRIPTOR_EXPIRED")
        signing_key_id = descriptor["descriptorSignature"]["keyId"]
        signing_key_pem = anchor["rootPublicKeyPem"]
        if signing_key_id != anchor["rootKeyId"]:
            signing_key_pem = self.verify_root_transition(descriptor, anchor, now)
        verify_signature(
            canonical(without(descriptor, {"descriptorSignature"})),
            signing_key_pem,
            descriptor["descriptorSignature"]["signature"],
            "INVALID_DESCRIPTOR_SIGNATURE",
        )
        operation = value["operation"]
        if operation not in anchor["allowedOperations"]:
            raise ConformanceError("OPERATION_NOT_ALLOWED")
        grants = [grant for grant in descriptor["authorityGrants"] if grant["issuerEntityId"] == descriptor["operatorEntityId"]
                  and grant["subjectNodeId"] == descriptor["nodeId"] and operation in grant["operations"]
                  and grant["state"] == "active" and "revokedAt" not in grant
                  and parse_time(grant["validFrom"]) <= now < parse_time(grant["expiresAt"])]
        if not grants:
            raise ConformanceError("NO_ACTIVE_GRANT")
        keys = [key for key in descriptor["keys"] if key["keyId"] == value["keyId"]]
        if not keys:
            raise ConformanceError("KEY_NOT_FOUND")
        key = keys[0]
        if key["state"] != "active" or "revokedAt" in key or value["purpose"] not in key["purposes"]:
            raise ConformanceError("KEY_NOT_AUTHORIZED")
        if not (parse_time(key["validFrom"]) <= now < parse_time(key["expiresAt"])):
            raise ConformanceError("KEY_NOT_ACTIVE")
        return {"publicKeyPem": key["publicKeyPem"]}

    def verify_root_transition(self, descriptor: dict[str, Any], anchor: dict[str, Any], now: datetime) -> str:
        transition = descriptor.get("rootTransition")
        if not transition or transition["previousRootKeyId"] != anchor["rootKeyId"]:
            raise ConformanceError("INVALID_ROOT_TRANSITION")
        if transition["nextRootKeyId"] != descriptor["descriptorSignature"]["keyId"]:
            raise ConformanceError("INVALID_ROOT_TRANSITION")
        if not (parse_time(transition["effectiveAt"]) <= now < parse_time(transition["expiresAt"])):
            raise ConformanceError("INVALID_ROOT_TRANSITION")
        payload = canonical(without(transition, {"previousRootSignature", "nextRootSignature"}))
        verify_signature(payload, anchor["rootPublicKeyPem"], transition["previousRootSignature"]["signature"], "INVALID_ROOT_TRANSITION")
        verify_signature(payload, transition["nextRootPublicKeyPem"], transition["nextRootSignature"]["signature"], "INVALID_ROOT_TRANSITION")
        return transition["nextRootPublicKeyPem"]

    def verify_transport(self, value: dict[str, Any]) -> dict[str, Any]:
        headers = value["headers"]
        now = parse_time(value["now"])
        signed_at = parse_time(headers["signedAt"])
        if abs((now - signed_at).total_seconds()) > 300:
            raise ConformanceError("STALE_TRANSPORT_SIGNATURE")
        if headers["nonce"] in self.nonces:
            raise ConformanceError("NONCE_REPLAY")
        payload = canonical({
            "method": value["method"].upper(), "path": value["path"], "body": value["body"],
            "nodeId": headers["nodeId"], "nonce": headers["nonce"], "signedAt": headers["signedAt"],
        })
        verify_signature(payload, value["publicKeyPem"], headers["signature"], "INVALID_TRANSPORT_SIGNATURE")
        self.nonces.add(headers["nonce"])
        return {"verified": True}

    def transport_policy(self, value: dict[str, Any]) -> dict[str, Any]:
        parsed = urlparse(value["url"])
        loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        if parsed.scheme != "https" and not (value["allowInsecureLoopback"] and loopback):
            raise ConformanceError("INSECURE_TRANSPORT")
        return {"accepted": True}

    @staticmethod
    def _validate(validator: Draft7Validator, value: dict[str, Any], code: str) -> None:
        if next(validator.iter_errors(value), None) is not None:
            raise ConformanceError(code)

    def receive_proposal(self, value: dict[str, Any]) -> dict[str, Any]:
        proposal = value["proposal"]
        notification = value["notification"]
        self._validate(self.proposal_validator, proposal, "INVALID_PROPOSAL_SCHEMA")
        self._validate(self.notification_validator, notification, "INVALID_NOTIFICATION_SCHEMA")
        if notification["proposalId"] != proposal["id"] or notification["purpose"] != proposal["purpose"]:
            raise ConformanceError("PROPOSAL_BINDING_MISMATCH")
        if notification["recipientEntityId"] not in {proposal["initiatorEntityId"], proposal["counterpartyEntityId"]}:
            raise ConformanceError("PROPOSAL_BINDING_MISMATCH")
        existing = self.proposals.get(proposal["id"])
        if existing and existing != proposal:
            raise ConformanceError("PROPOSAL_CONFLICT")
        self.proposals[proposal["id"]] = proposal
        self.notifications[proposal["id"]] = notification
        self.decisions.setdefault(proposal["id"], [])
        return {"accepted": True, "duplicate": existing is not None}

    def record_decision(self, value: dict[str, Any]) -> dict[str, Any]:
        decision = value["decision"]
        self._validate(self.decision_validator, decision, "INVALID_DECISION_SCHEMA")
        proposal = self.proposals.get(decision["proposalId"])
        if proposal is None:
            raise ConformanceError("PROPOSAL_NOT_FOUND")
        if proposal["id"] in {item["proposalId"] for item in self.invalidations.values()}:
            raise ConformanceError("PROPOSAL_INVALIDATED")
        expected_actor = proposal["initiatorEntityId"] if decision["actorSide"] == "initiator" else proposal["counterpartyEntityId"]
        if decision["actorEntityId"] != expected_actor:
            raise ConformanceError("DECISION_ACTOR_MISMATCH")
        decisions = self.decisions[proposal["id"]]
        if any(item["actorEntityId"] == decision["actorEntityId"] for item in decisions):
            raise ConformanceError("DUPLICATE_ACTOR_DECISION")
        decisions.append(decision)
        approvals = [item for item in decisions if item["state"] == "approved"]
        if len(approvals) != 2:
            return {"accepted": True, "release": None}
        released_scopes = [scope for scope in proposal.get("requestedDisclosureScopes", [])
                           if all(scope in item.get("approvedDisclosureScopes", []) for item in approvals)]
        if not released_scopes:
            return {"accepted": True, "release": None}
        release = {
            "standingVersion": "0.1.0-draft.1",
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, proposal["id"] + ":release")),
            "proposalId": proposal["id"],
            "initiatorEntityId": proposal["initiatorEntityId"],
            "counterpartyEntityId": proposal["counterpartyEntityId"],
            "releasedScopes": released_scopes,
            "decisionIds": [approvals[0]["id"], approvals[1]["id"]],
            "releasedAt": value["now"],
        }
        self._validate(self.release_validator, release, "INVALID_RELEASE_SCHEMA")
        self.releases[proposal["id"]] = release
        return {"accepted": True, "release": release}

    def receive_invalidation(self, value: dict[str, Any]) -> dict[str, Any]:
        invalidation = value["invalidation"]
        self._validate(self.invalidation_validator, invalidation, "INVALID_INVALIDATION_SCHEMA")
        proposal = self.proposals.get(invalidation["proposalId"])
        if proposal is None:
            raise ConformanceError("PROPOSAL_NOT_FOUND")
        if proposal["id"] in self.releases:
            raise ConformanceError("RELEASE_ALREADY_EXISTS")
        notification = self.notifications[proposal["id"]]
        if invalidation["notificationId"] != notification["id"]:
            raise ConformanceError("INVALIDATION_BINDING_MISMATCH")
        existing = self.invalidations.get(invalidation["id"])
        if existing is not None:
            if existing != invalidation:
                raise ConformanceError("INVALIDATION_CONFLICT")
            return {"accepted": True, "duplicate": True}
        self.invalidations[invalidation["id"]] = invalidation
        notification["state"] = "invalidated"
        notification["invalidatedAt"] = invalidation["invalidatedAt"]
        return {"accepted": True, "duplicate": False}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--schemas", required=True, type=Path)
    arguments = parser.parse_args()
    adapter = Adapter(arguments.schemas)
    for line in sys.stdin:
        request: dict[str, Any] = json.loads(line)
        try:
            result = adapter.execute(request["command"], request["input"])
            response = {"id": request["id"], "ok": True, "result": result}
        except ConformanceError as error:
            response = {"id": request["id"], "ok": False, "errorCode": error.code}
        except Exception:
            response = {"id": request.get("id"), "ok": False, "errorCode": "INTERNAL_ERROR"}
        sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
