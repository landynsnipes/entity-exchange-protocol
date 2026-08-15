"""Independent EXP HTTP node used for cross-language standing-mode interoperability.

The node intentionally depends only on the published EXP schemas and Python libraries. It does not
import the TypeScript reference gateway or any proprietary implementation package.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from jsonschema import Draft7Validator, FormatChecker

from canonical_json import canonical_json_bytes, signed_payload_bytes
from exp_adapter import ConformanceError, parse_time, verify_signature


FEDERATION_PATHS = {
    "/v1/catalog/discover": "catalog:discover",
    "/v1/federation/proposals": "proposal:deliver",
    "/v1/federation/releases": "release:deliver",
    "/v1/federation/invalidations": "invalidation:deliver",
}


def federation_operation(path: str) -> str | None:
    if path.startswith("/v1/records/") and path.endswith("/dereference"):
        return "record:dereference"
    return FEDERATION_PATHS.get(path)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class NodeError(Exception):
    """A safe protocol error suitable for a structured HTTP response."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class JsonStore:
    """Small atomic JSON store for the independently operated proof node."""

    def __init__(self, path: Path, initial: dict[str, Any]) -> None:
        self.path = path
        self.lock = threading.RLock()
        if path.exists():
            self.state = json.loads(path.read_text(encoding="utf-8"))
        else:
            self.state = initial
            self.save()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=self.path.parent, delete=False) as handle:
            json.dump(self.state, handle, separators=(",", ":"), sort_keys=True)
            temporary = Path(handle.name)
        os.replace(temporary, self.path)

    def update(self, mutate: Any) -> Any:
        with self.lock:
            result = mutate(self.state)
            self.save()
            return result

    def read(self) -> dict[str, Any]:
        with self.lock:
            return json.loads(json.dumps(self.state))


class ExpHttpNode:
    """Owns one EXP record and implements signed federation and local-control boundaries."""

    def __init__(self, configuration: dict[str, Any]) -> None:
        self.configuration = configuration
        self.private_key = serialization.load_pem_private_key(
            configuration["privateKeyPem"].encode("utf-8"), password=None
        )
        if not isinstance(self.private_key, Ed25519PrivateKey):
            raise ValueError("The node private key must be Ed25519.")
        schema_directory = Path(configuration["schemaDirectory"])
        self.validators = {
            name: Draft7Validator(
                json.loads((schema_directory / f"{name}.schema.json").read_text(encoding="utf-8")),
                format_checker=FormatChecker(),
            )
            for name in (
                "signed-catalog-discovery-query", "connection-proposal", "standing-match-notification",
                "reciprocal-evaluation", "connection-decision", "disclosure-release",
                "standing-match-invalidation",
            )
        }
        initial = {
            "record": configuration["initialRecord"], "authorization": configuration["authorization"],
            "discoveryGrants": {}, "consumedNonces": [], "proposals": [], "notifications": [],
            "evaluations": [], "decisions": [], "releases": [], "invalidations": [], "outbox": [], "audit": [],
        }
        self.store = JsonStore(Path(configuration["dataFile"]), initial)
        self.store.update(lambda state: [state.setdefault(key, value) for key, value in initial.items()])
        self.worker_stop = threading.Event()
        self.worker: threading.Thread | None = None
        self.delivery_lock = threading.Lock()
        self.rate_lock = threading.Lock()
        self.rate_windows: dict[str, list[float]] = {}

    def validate(self, name: str, value: dict[str, Any]) -> None:
        error = next(self.validators[name].iter_errors(value), None)
        if error is not None:
            raise NodeError(400, "INVALID_SCHEMA", f"The {name} payload is invalid.")

    def audit(self, kind: str, correlation_id: str) -> None:
        self.store.update(lambda state: state["audit"].append({
            "id": str(uuid.uuid4()), "kind": kind, "correlationId": correlation_id, "occurredAt": utc_now()
        }))

    def consume_rate_limit(self, identity: str) -> None:
        policy = self.configuration.get("abuse", {})
        window = float(policy.get("windowSeconds", 60))
        maximum = int(policy.get("maximumRequests", 120))
        maximum_peers = int(policy.get("maximumTrackedPeers", 10000))
        now = time.monotonic()
        with self.rate_lock:
            if identity not in self.rate_windows and len(self.rate_windows) >= maximum_peers:
                raise NodeError(429, "RATE_LIMIT_CARDINALITY", "The peer tracking limit was reached.")
            active = [entry for entry in self.rate_windows.get(identity, []) if entry > now - window]
            if len(active) >= maximum:
                raise NodeError(429, "RATE_LIMITED", "The federation request limit was reached.")
            active.append(now)
            self.rate_windows[identity] = active

    def verify_federation(self, method: str, path: str, body: dict[str, Any], headers: Any, client_ip: str) -> str:
        required = {
            "nodeId": headers.get("x-exp-node-id"), "keyId": headers.get("x-exp-key-id"),
            "nonce": headers.get("x-exp-nonce"), "signedAt": headers.get("x-exp-signed-at"),
            "signature": headers.get("x-exp-signature"),
        }
        if not all(required.values()):
            raise NodeError(401, "MISSING_SIGNATURE", "Federation signature headers are required.")
        self.consume_rate_limit(f"{client_ip}:{required['nodeId']}")
        anchor = self.configuration["trustedNodes"].get(required["nodeId"])
        operation = federation_operation(path)
        if anchor is None or operation is None or operation not in anchor["allowedOperations"]:
            raise NodeError(401, "UNTRUSTED_NODE", "The peer or operation is not trusted.")
        now = datetime.now(timezone.utc)
        if abs((now - parse_time(required["signedAt"])).total_seconds()) > 300:
            raise NodeError(401, "STALE_SIGNATURE", "The federation signature is stale.")
        state = self.store.read()
        if required["nonce"] in state["consumedNonces"]:
            raise NodeError(409, "NONCE_REPLAY", "The federation nonce was already consumed.")
        descriptor = self.fetch_descriptor(anchor["descriptorEndpoint"])
        try:
            key = self.verify_descriptor(descriptor, anchor, required["keyId"], operation, now)
            payload = canonical_json_bytes({
                "method": method.upper(), "path": path, "body": body, "nodeId": required["nodeId"],
                "nonce": required["nonce"], "signedAt": required["signedAt"],
            })
            verify_signature(payload, key, required["signature"], "INVALID_TRANSPORT_SIGNATURE")
        except ConformanceError as error:
            raise NodeError(401, error.code, "The federation signature was rejected.") from None
        self.store.update(lambda current: current["consumedNonces"].append(required["nonce"]))
        return required["nodeId"]

    @staticmethod
    def fetch_descriptor(endpoint: str) -> dict[str, Any]:
        try:
            with urllib.request.urlopen(endpoint, timeout=5) as response:
                if response.status != 200 or int(response.headers.get("content-length", "0") or 0) > 262144:
                    raise NodeError(401, "DESCRIPTOR_REJECTED", "The peer descriptor was rejected.")
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise NodeError(502, "DESCRIPTOR_UNAVAILABLE", "The peer descriptor is unavailable.") from error

    @staticmethod
    def verify_descriptor(
        descriptor: dict[str, Any], anchor: dict[str, Any], key_id: str, operation: str, now: datetime
    ) -> str:
        if descriptor["nodeId"] != anchor["nodeId"] or descriptor["operatorEntityId"] != anchor["operatorEntityId"]:
            raise ConformanceError("DESCRIPTOR_IDENTITY_MISMATCH")
        descriptor_origin = urlparse(descriptor["endpoint"])
        anchor_origin = urlparse(anchor["descriptorEndpoint"])
        if (descriptor_origin.scheme, descriptor_origin.netloc) != (anchor_origin.scheme, anchor_origin.netloc):
            raise ConformanceError("DESCRIPTOR_ORIGIN_MISMATCH")
        if descriptor_origin.scheme != "https" and descriptor_origin.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ConformanceError("INSECURE_TRANSPORT")
        if parse_time(descriptor["expiresAt"]) <= now:
            raise ConformanceError("DESCRIPTOR_EXPIRED")
        signature = descriptor["descriptorSignature"]
        signing_root = anchor["rootPublicKeyPem"]
        if signature["keyId"] != anchor["rootKeyId"]:
            transition = descriptor.get("rootTransition")
            if not transition or transition["previousRootKeyId"] != anchor["rootKeyId"] \
                    or transition["nextRootKeyId"] != signature["keyId"] \
                    or not (parse_time(transition["effectiveAt"]) <= now < parse_time(transition["expiresAt"])):
                raise ConformanceError("INVALID_ROOT_TRANSITION")
            transition_payload = signed_payload_bytes(
                transition,
                {"previousRootSignature", "nextRootSignature"},
            )
            verify_signature(transition_payload, anchor["rootPublicKeyPem"], transition["previousRootSignature"]["signature"], "INVALID_ROOT_TRANSITION")
            verify_signature(transition_payload, transition["nextRootPublicKeyPem"], transition["nextRootSignature"]["signature"], "INVALID_ROOT_TRANSITION")
            signing_root = transition["nextRootPublicKeyPem"]
        verify_signature(
            signed_payload_bytes(descriptor, {"descriptorSignature"}),
            signing_root,
            signature["signature"],
            "INVALID_DESCRIPTOR_SIGNATURE",
        )
        grants = [grant for grant in descriptor.get("authorityGrants", []) if grant["subjectNodeId"] == descriptor["nodeId"]
                  and grant["issuerEntityId"] == descriptor["operatorEntityId"] and operation in grant["operations"]
                  and grant["state"] == "active" and "revokedAt" not in grant
                  and parse_time(grant["validFrom"]) <= now < parse_time(grant["expiresAt"])]
        if not grants:
            raise ConformanceError("NO_ACTIVE_GRANT")
        keys = [entry for entry in descriptor["keys"] if entry["keyId"] == key_id and entry["state"] == "active"
                and "transport" in entry["purposes"] and "revokedAt" not in entry
                and parse_time(entry["validFrom"]) <= now < parse_time(entry["expiresAt"])]
        if not keys:
            raise ConformanceError("KEY_NOT_AUTHORIZED")
        return keys[0]["publicKeyPem"]

    def sign_headers(self, path: str, body: dict[str, Any]) -> dict[str, str]:
        nonce, signed_at = str(uuid.uuid4()), utc_now()
        payload = canonical_json_bytes({
            "method": "POST",
            "path": path,
            "body": body,
            "nodeId": self.configuration["nodeId"],
            "nonce": nonce,
            "signedAt": signed_at,
        })
        signature = self.private_key.sign(payload)
        import base64
        encoded = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
        return {
            "content-type": "application/json", "x-exp-node-id": self.configuration["nodeId"],
            "x-exp-key-id": self.configuration["keyId"], "x-exp-nonce": nonce,
            "x-exp-signed-at": signed_at, "x-exp-signature": encoded,
        }

    def signed_post(self, endpoint: str, path: str, body: dict[str, Any]) -> Any:
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(endpoint + path, data=data, method="POST", headers=self.sign_headers(path, body))
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            raise NodeError(502, "PEER_REJECTED", f"The peer returned HTTP {error.code}.") from error

    def enqueue(self, entry_id: str, endpoint: str, path: str, body: dict[str, Any], correlation_id: str) -> None:
        now = utc_now()
        def mutate(state: dict[str, Any]) -> None:
            existing = next((item for item in state["outbox"] if item["id"] == entry_id), None)
            if existing is not None:
                if existing["destination"] != endpoint or existing["path"] != path or existing["body"] != body:
                    raise NodeError(409, "OUTBOX_CONFLICT", "The outbox identifier is already bound.")
                return
            state["outbox"].append({"id": entry_id, "destination": endpoint, "path": path, "body": body,
                                    "correlationId": correlation_id, "attempts": 0, "nextAttemptAt": now})
            state["audit"].append({"id": str(uuid.uuid4()), "kind": "delivery_enqueued",
                                   "correlationId": correlation_id, "occurredAt": now})
        self.store.update(mutate)

    def drain_outbox(self, force: bool = False) -> int:
        if not self.delivery_lock.acquire(blocking=False):
            return 0
        try:
            return self._drain_outbox(force)
        finally:
            self.delivery_lock.release()

    def _drain_outbox(self, force: bool = False) -> int:
        delivered = 0
        policy = self.configuration.get("delivery", {})
        initial = int(policy.get("initialBackoffMs", 500))
        maximum = int(policy.get("maximumBackoffMs", 30000))
        maximum_attempts = int(policy.get("maximumAttempts", 8))
        jitter_ratio = float(policy.get("jitterRatio", 0.0))
        for candidate in self.store.read()["outbox"]:
            if candidate.get("deliveredAt") or candidate.get("deadLetteredAt"):
                continue
            if not force and parse_time(candidate["nextAttemptAt"]) > datetime.now(timezone.utc):
                continue
            try:
                self.signed_post(candidate["destination"], candidate["path"], candidate["body"])
                when = utc_now()
                def accepted(state: dict[str, Any]) -> None:
                    entry = next(item for item in state["outbox"] if item["id"] == candidate["id"])
                    entry["attempts"] += 1; entry["lastAttemptAt"] = when; entry["deliveredAt"] = when
                    entry.pop("nextAttemptAt", None); entry.pop("lastError", None)
                    state["audit"].append({"id": str(uuid.uuid4()), "kind": "delivery_succeeded",
                                           "correlationId": entry["correlationId"], "occurredAt": when})
                self.store.update(accepted); delivered += 1
            except (NodeError, urllib.error.URLError, TimeoutError) as error:
                when = utc_now()
                def rejected(state: dict[str, Any]) -> None:
                    entry = next(item for item in state["outbox"] if item["id"] == candidate["id"])
                    entry["attempts"] += 1; entry["lastAttemptAt"] = when; entry["lastError"] = type(error).__name__
                    if entry["attempts"] >= maximum_attempts:
                        entry["deadLetteredAt"] = when; entry.pop("nextAttemptAt", None); kind = "delivery_dead_lettered"
                    else:
                        delay = min(initial * (2 ** (entry["attempts"] - 1)), maximum)
                        delay += int(delay * jitter_ratio * random.uniform(-1, 1))
                        entry["nextAttemptAt"] = datetime.fromtimestamp(time.time() + max(0, delay) / 1000, timezone.utc).isoformat().replace("+00:00", "Z")
                        kind = "delivery_retry_scheduled"
                    state["audit"].append({"id": str(uuid.uuid4()), "kind": kind,
                                           "correlationId": entry["correlationId"], "occurredAt": when})
                self.store.update(rejected)
        return delivered

    def start_worker(self) -> None:
        if self.worker is not None: return
        interval = max(0.01, int(self.configuration.get("delivery", {}).get("workerIntervalMs", 1000)) / 1000)
        def run() -> None:
            while not self.worker_stop.wait(interval): self.drain_outbox()
        self.worker = threading.Thread(target=run, name="exp-python-delivery", daemon=True); self.worker.start()

    def stop_worker(self) -> None:
        self.worker_stop.set()
        if self.worker is not None: self.worker.join(timeout=5)

    def outbox_status(self) -> list[dict[str, Any]]:
        return [{key: value for key, value in entry.items() if key != "body"} for entry in self.store.read()["outbox"]]

    def status(self) -> dict[str, Any]:
        snapshot = self.store.read()
        snapshot["outbox"] = self.outbox_status()
        return snapshot

    def discover(self, query: dict[str, Any], peer_node_id: str) -> dict[str, Any]:
        self.validate("signed-catalog-discovery-query", query)
        anchor = self.configuration["trustedNodes"][peer_node_id]
        descriptor = self.fetch_descriptor(anchor["descriptorEndpoint"])
        key = self.verify_descriptor(descriptor, anchor, query["requestSignature"]["keyId"], "catalog:discover", datetime.now(timezone.utc))
        if parse_time(query["expiresAt"]) <= datetime.now(timezone.utc):
            raise NodeError(401, "QUERY_EXPIRED", "The discovery query is expired.")
        try:
            verify_signature(
                signed_payload_bytes(query, {"requestSignature"}),
                key,
                query["requestSignature"]["signature"],
                "INVALID_QUERY_SIGNATURE",
            )
        except ConformanceError as error:
            raise NodeError(401, error.code, "The discovery query signature was rejected.") from None
        snapshot = self.store.read(); registration = snapshot["record"]["registration"]
        authorization = snapshot["authorization"]
        authorization_active = "revokedAt" not in authorization and parse_time(authorization["expiresAt"]) > datetime.now(timezone.utc)
        matches = authorization_active and registration["state"] == "active" and registration["purpose"] == query["purpose"] \
            and registration["profileId"] in query["acceptedProfileIds"] \
            and any(kind in query["desiredEntityKinds"] for kind in registration["entityKinds"]) \
            and all(tag in registration["discoveryTags"] for tag in query["discoveryTags"])
        candidates = []
        if matches:
            candidates.append({key: registration[key] for key in (
                "recordKind", "recordId", "profileId", "purpose", "entityKinds", "discoveryTags",
                "dereferenceEndpoint", "provenanceReferences", "containsIdentity", "containsSealedValues", "expiresAt"
            )} | {"registrationId": registration["id"], "sourceCatalogId": self.configuration["nodeId"]})
            self.store.update(lambda state: state["discoveryGrants"].update({query["id"]: {
                "requesterEntityId": query["requesterEntityId"], "authorizationId": query["authorizationId"],
                "purpose": query["purpose"], "recordId": registration["recordId"],
            }}))
        return {"queryId": query["id"], "decisionTraceId": str(uuid.uuid4()), "servedByCatalogId": self.configuration["nodeId"],
                "candidates": candidates, "consultedCatalogIds": [self.configuration["nodeId"]], "partial": False,
                "errors": [], "createdAt": utc_now()}

    def dereference(self, record_id: str, request: dict[str, Any]) -> dict[str, Any]:
        grant = self.store.read()["discoveryGrants"].get(request.get("queryId"))
        if not grant or grant["recordId"] != record_id \
                or grant["requesterEntityId"] != request.get("requesterEntityId") \
                or grant["authorizationId"] != request.get("authorizationId") \
                or grant["purpose"] != request.get("purpose"):
            raise NodeError(401, "DEREFERENCE_NOT_AUTHORIZED", "No discovery grant authorizes this dereference.")
        return self.store.read()["record"]

    def receive_proposal(self, delivery: dict[str, Any]) -> None:
        for name, field in (("connection-proposal", "proposal"), ("standing-match-notification", "notification"), ("reciprocal-evaluation", "evaluation")):
            self.validate(name, delivery[field])
        proposal, notice = delivery["proposal"], delivery["notification"]
        local_entity = self.store.read()["record"]["model"]["entityId"]
        if notice["recipientEntityId"] != local_entity or notice["proposalId"] != proposal["id"] or notice.get("containsIdentity") is not False:
            raise NodeError(400, "PROPOSAL_BINDING_MISMATCH", "The proposal notification is not privacy-safe or correctly bound.")
        def mutate(state: dict[str, Any]) -> None:
            existing = next((item for item in state["proposals"] if item["id"] == proposal["id"]), None)
            if existing is not None and existing != proposal:
                raise NodeError(409, "PROPOSAL_CONFLICT", "The proposal identifier is already bound.")
            if existing is None:
                state["proposals"].append(proposal); state["notifications"].append(notice); state["evaluations"].append(delivery["evaluation"])
                state["coordinatorEndpoint"] = delivery["coordinatorEndpoint"]
                state["audit"].append({"id": str(uuid.uuid4()), "kind": "proposal_received", "correlationId": delivery["correlationId"], "occurredAt": utc_now()})
        self.store.update(mutate)

    def decide(self, proposal_id: str, body: dict[str, Any]) -> dict[str, Any]:
        state = self.store.read(); proposal = next((item for item in state["proposals"] if item["id"] == proposal_id), None)
        if proposal is None:
            raise NodeError(404, "PROPOSAL_NOT_FOUND", "The proposal does not exist.")
        if any(item["proposalId"] == proposal_id for item in state["invalidations"]):
            raise NodeError(409, "PROPOSAL_INVALIDATED", "An invalidated proposal cannot receive a decision.")
        entity_id = state["record"]["model"]["entityId"]
        if any(item["proposalId"] == proposal_id and item["actorEntityId"] == entity_id for item in state["decisions"]):
            raise NodeError(409, "DUPLICATE_DECISION", "The local principal already decided this proposal.")
        side = "initiator" if proposal["initiatorEntityId"] == entity_id else "counterparty"
        decision = {"id": str(uuid.uuid4()), "proposalId": proposal_id, "actorEntityId": entity_id, "actorSide": side,
                    "state": body["state"], "approvedDisclosureScopes": body.get("approvedDisclosureScopes", []), "decidedAt": utc_now()}
        self.validate("connection-decision", decision)
        self.store.update(lambda current: (current["decisions"].append(decision), current["audit"].append({
            "id": str(uuid.uuid4()), "kind": "local_decision_recorded", "correlationId": body["correlationId"], "occurredAt": decision["decidedAt"]
        })))
        delivery = {"decision": decision, "correlationId": body["correlationId"]}
        self.enqueue(decision["id"], state["coordinatorEndpoint"], "/v1/federation/decisions", delivery, body["correlationId"])
        self.drain_outbox(force=True)
        return decision

    def receive_release(self, delivery: dict[str, Any]) -> None:
        release = delivery["release"]; self.validate("disclosure-release", release)
        proposal_ids = {item["id"] for item in self.store.read()["proposals"]}
        if release["proposalId"] not in proposal_ids:
            raise NodeError(409, "PROPOSAL_NOT_FOUND", "The release proposal does not exist.")
        self.store.update(lambda state: state["releases"].append(release) if not any(item["id"] == release["id"] for item in state["releases"]) else None)
        self.audit("disclosure_release_received", delivery["correlationId"])

    def receive_invalidation(self, delivery: dict[str, Any]) -> None:
        invalidation = delivery["invalidation"]
        self.validate("standing-match-invalidation", invalidation)
        snapshot = self.store.read()
        proposal = next((item for item in snapshot["proposals"] if item["id"] == invalidation["proposalId"]), None)
        if proposal is None:
            raise NodeError(409, "PROPOSAL_NOT_FOUND", "The invalidation proposal does not exist.")
        if any(item["proposalId"] == proposal["id"] for item in snapshot["releases"]):
            raise NodeError(409, "RELEASE_ALREADY_EXISTS", "A released proposal cannot be invalidated.")
        notification = next((item for item in snapshot["notifications"]
                             if item["id"] == invalidation["notificationId"] and item["proposalId"] == proposal["id"]), None)
        if notification is None:
            raise NodeError(409, "INVALIDATION_BINDING_MISMATCH", "The invalidation notification is not bound.")
        existing = next((item for item in snapshot["invalidations"] if item["id"] == invalidation["id"]), None)
        if existing is not None:
            if existing != invalidation:
                raise NodeError(409, "INVALIDATION_CONFLICT", "The invalidation identifier is already bound.")
            return
        def mutate(state: dict[str, Any]) -> None:
            stored = next(item for item in state["notifications"] if item["id"] == notification["id"])
            stored["state"] = "invalidated"; stored["invalidatedAt"] = invalidation["invalidatedAt"]
            state["invalidations"].append(invalidation)
            state["audit"].append({"id": str(uuid.uuid4()), "kind": "standing_match_invalidated_remote",
                                   "correlationId": delivery["correlationId"], "occurredAt": invalidation["invalidatedAt"]})
        self.store.update(mutate)

    def revoke_authorization(self, body: dict[str, Any]) -> None:
        revoked_at = body["revokedAt"]
        parse_time(revoked_at)
        def mutate(state: dict[str, Any]) -> None:
            if "revokedAt" in state["authorization"]: return
            state["authorization"]["revokedAt"] = revoked_at
            state["audit"].append({"id": str(uuid.uuid4()), "kind": "standing_authorization_revoked",
                                   "correlationId": body["correlationId"], "occurredAt": revoked_at})
        self.store.update(mutate)

    def invalidate_proposal(self, proposal_id: str, body: dict[str, Any]) -> None:
        when = body["invalidatedAt"]; parse_time(when)
        def mutate(state: dict[str, Any]) -> None:
            if any(item["proposalId"] == proposal_id for item in state["releases"]):
                raise NodeError(409, "RELEASE_ALREADY_EXISTS", "A released proposal cannot be invalidated.")
            found = False
            for notice in state["notifications"]:
                if notice["proposalId"] == proposal_id and notice["state"] in {"active", "read"}:
                    notice["state"] = "invalidated"; notice["invalidatedAt"] = when; found = True
            if not found: raise NodeError(404, "ACTIVE_NOTIFICATION_NOT_FOUND", "No active proposal notification exists.")
            state["audit"].append({"id": str(uuid.uuid4()), "kind": "standing_match_invalidated",
                                   "correlationId": body["correlationId"], "occurredAt": when})
        self.store.update(mutate)


class Handler(BaseHTTPRequestHandler):
    node: ExpHttpNode

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def respond(self, status: int, body: Any = None) -> None:
        encoded = b"" if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(encoded))); self.end_headers()
        if encoded: self.wfile.write(encoded)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0"))
        if length <= 0 or length > 1024 * 1024: raise NodeError(400, "INVALID_BODY", "A bounded JSON body is required.")
        try: return json.loads(self.rfile.read(length))
        except json.JSONDecodeError as error: raise NodeError(400, "INVALID_JSON", "The request body is not valid JSON.") from error

    def require_admin(self) -> None:
        if self.headers.get("authorization") != f"Bearer {self.node.configuration['adminToken']}":
            raise NodeError(401, "ADMIN_UNAUTHORIZED", "The administration token was rejected.")

    def do_GET(self) -> None:
        try:
            if self.path == "/health": return self.respond(200, {"status": "ok", "nodeId": self.node.configuration["nodeId"]})
            if self.path == "/.well-known/exp-node": return self.respond(200, self.node.configuration["localNodeDescriptor"])
            if self.path == "/v1/local/status": self.require_admin(); return self.respond(200, self.node.status())
            if self.path == "/v1/local/outbox": self.require_admin(); return self.respond(200, {"entries": self.node.outbox_status()})
            raise NodeError(404, "NOT_FOUND", "The route does not exist.")
        except NodeError as error: self.respond(error.status, {"errorCode": error.code, "message": str(error)})

    def do_POST(self) -> None:
        request_id = str(uuid.uuid4())
        try:
            body = self.read_json()
            if self.path == "/v1/local/state-changes":
                self.require_admin()
                next_record = body["nextRecord"]
                announcement = body["announcement"]
                if next_record["registration"]["id"] != announcement["registration"]["id"]:
                    raise NodeError(409, "STATE_BINDING_MISMATCH", "The announcement and replacement record are not bound.")
                self.node.store.update(lambda state: state.update({"record": next_record}))
                self.node.enqueue(announcement["event"]["id"], body["peerEndpoint"], "/v1/federation/state-changes",
                                  announcement, announcement["correlationId"])
                self.node.audit("local_state_announced", announcement["correlationId"])
                self.node.drain_outbox(force=True)
                entry = next(item for item in self.node.outbox_status() if item["id"] == announcement["event"]["id"])
                return self.respond(202, {"eventId": announcement["event"]["id"], "delivered": "deliveredAt" in entry})
            if self.path == "/v1/local/outbox/drain":
                self.require_admin(); return self.respond(200, {"delivered": self.node.drain_outbox(force=True)})
            if self.path.startswith("/v1/local/outbox/") and self.path.endswith("/requeue"):
                self.require_admin(); entry_id = self.path.split("/")[4]
                def requeue(state: dict[str, Any]) -> None:
                    entry = next((item for item in state["outbox"] if item["id"] == entry_id), None)
                    if entry is None or "deadLetteredAt" not in entry: raise NodeError(409, "OUTBOX_NOT_REQUEUEABLE", "The outbox entry is not dead-lettered.")
                    entry["attempts"] = 0; entry["nextAttemptAt"] = utc_now(); entry.pop("deadLetteredAt", None); entry.pop("lastError", None)
                    state["audit"].append({"id": str(uuid.uuid4()), "kind": "delivery_requeued",
                                           "correlationId": body["correlationId"], "occurredAt": utc_now()})
                self.node.store.update(requeue); return self.respond(202, {"id": entry_id, "state": "pending"})
            if self.path == "/v1/local/authorization/revoke":
                self.require_admin(); self.node.revoke_authorization(body); return self.respond(204)
            if self.path.startswith("/v1/local/proposals/") and self.path.endswith("/invalidate"):
                self.require_admin(); self.node.invalidate_proposal(self.path.split("/")[4], body); return self.respond(204)
            if self.path.startswith("/v1/local/proposals/") and self.path.endswith("/decisions"):
                self.require_admin(); proposal_id = self.path.split("/")[4]; return self.respond(201, self.node.decide(proposal_id, body))
            if self.path in FEDERATION_PATHS:
                peer = self.node.verify_federation("POST", self.path, body, self.headers, self.client_address[0])
                if self.path == "/v1/catalog/discover": return self.respond(200, self.node.discover(body, peer))
                if self.path == "/v1/federation/proposals": self.node.receive_proposal(body); return self.respond(204)
                if self.path == "/v1/federation/invalidations": self.node.receive_invalidation(body); return self.respond(204)
                self.node.receive_release(body); return self.respond(204)
            if self.path.startswith("/v1/records/") and self.path.endswith("/dereference"):
                peer = self.node.verify_federation("POST", self.path, body, self.headers, self.client_address[0])
                if peer not in self.node.configuration["trustedNodes"]: raise NodeError(401, "UNTRUSTED_NODE", "The peer is not trusted.")
                return self.respond(200, self.node.dereference(self.path.split("/")[3], body))
            raise NodeError(404, "NOT_FOUND", "The route does not exist.")
        except NodeError as error:
            self.node.audit(f"request_rejected:{error.code}", request_id)
            self.respond(error.status, {"errorCode": error.code, "message": str(error), "requestId": request_id})
        except Exception: self.respond(500, {"errorCode": "INTERNAL_ERROR", "message": "The node could not complete the request.", "requestId": request_id})


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--config", required=True, type=Path); arguments = parser.parse_args()
    configuration = json.loads(arguments.config.read_text(encoding="utf-8")); Handler.node = ExpHttpNode(configuration)
    server = ThreadingHTTPServer((configuration["host"], configuration["port"]), Handler)
    Handler.node.start_worker()
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: Handler.node.stop_worker(); server.server_close()


if __name__ == "__main__":
    main()
