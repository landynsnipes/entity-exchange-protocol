"""Independent EXP wallet presentation builder using only published schemas and Python libraries."""
from __future__ import annotations

import argparse
import base64
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from jsonschema import Draft7Validator, FormatChecker

from canonical_json import signed_payload_bytes


class WalletError(Exception):
    """Expected wallet policy rejection."""


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def require_unique(values: list[str], code: str) -> None:
    if len(set(values)) != len(values):
        raise WalletError(code)


def validator(schema_directory: Path, name: str) -> Draft7Validator:
    schema = json.loads((schema_directory / name).read_text(encoding="utf-8"))
    return Draft7Validator(schema, format_checker=FormatChecker())


def validate(value: dict[str, Any], check: Draft7Validator, code: str) -> None:
    errors = sorted(check.iter_errors(value), key=lambda error: list(error.path))
    if errors:
        raise WalletError(code)


def build_presentation(config: dict[str, Any], schema_directory: Path) -> dict[str, Any]:
    request = config["request"]
    view = config["view"]
    validate(request, validator(schema_directory, "wallet-connect-request.schema.json"), "INVALID_REQUEST")
    now = parse_time(config["now"])
    if parse_time(request["issuedAt"]) >= parse_time(request["expiresAt"]) or parse_time(request["expiresAt"]) <= now:
        raise WalletError("INVALID_REQUEST_TIMESTAMP")
    require_unique(request["requestedScopes"], "DUPLICATE_SCOPE")
    require_unique(request["requestedOperations"], "DUPLICATE_OPERATION")
    requested_scopes = set(request["requestedScopes"])
    requested_operations = set(request["requestedOperations"])
    approved_scopes = config["approvedScopes"]
    approved_operations = config["approvedOperations"]
    require_unique(approved_scopes, "DUPLICATE_SCOPE")
    require_unique(approved_operations, "DUPLICATE_OPERATION")
    if not set(approved_scopes).issubset(requested_scopes):
        raise WalletError("APPROVAL_EXCEEDS_REQUEST")
    if not set(approved_operations).issubset(requested_operations):
        raise WalletError("APPROVAL_EXCEEDS_REQUEST")
    for attribute in view["attributes"]:
        namespace = attribute["namespace"]
        if not any(namespace == scope or namespace.startswith(scope + ".") for scope in approved_scopes):
            raise WalletError("VIEW_EXCEEDS_APPROVAL")
    if view["entityId"] != config["principalEntityId"] or view["purpose"] != request["purpose"]:
        raise WalletError("VIEW_BINDING_MISMATCH")
    if parse_time(view["createdAt"]) >= parse_time(view["expiresAt"]) or parse_time(view["expiresAt"]) > parse_time(request["expiresAt"]):
        raise WalletError("INVALID_PRESENTATION_TIMESTAMP")
    if parse_time(config["now"]) > parse_time(config["expiresAt"]) or parse_time(config["expiresAt"]) > parse_time(request["expiresAt"]):
        raise WalletError("INVALID_PRESENTATION_TIMESTAMP")
    presentation = {
        "profileVersion": "0.1.0-draft.1",
        "id": config["presentationId"],
        "requestId": request["id"],
        "audience": request["requesterOrigin"],
        "nonce": request["nonce"],
        "view": view,
        "consent": {
            "id": config["consentId"],
            "requestId": request["id"],
            "principalEntityId": config["principalEntityId"],
            "requesterEntityId": request["requesterEntityId"],
            "purpose": request["purpose"],
            "approvedScopes": approved_scopes,
            "approvedOperations": approved_operations,
            "requestNonce": request["nonce"],
            "decision": "approved",
            "containsRawContext": False,
            "approvedAt": config["now"],
            "expiresAt": config["expiresAt"],
        },
        "containsRawContext": False,
        "issuedAt": config["now"],
        "expiresAt": config["expiresAt"],
        "signature": {"algorithm": "Ed25519", "keyId": config["keyId"], "value": "x" * 43},
    }
    private_key = serialization.load_pem_private_key(config["privateKeyPem"].encode("utf-8"), password=None)
    if not isinstance(private_key, Ed25519PrivateKey):
        raise WalletError("UNSUPPORTED_KEY")
    signature = private_key.sign(signed_payload_bytes(presentation, {"signature"}))
    presentation["signature"]["value"] = base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")
    validate(presentation, validator(schema_directory, "wallet-presentation.schema.json"), "INVALID_PRESENTATION")
    return presentation


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--schemas", type=Path, required=True)
    arguments = parser.parse_args()
    try:
        config = json.load(sys.stdin)
        print(json.dumps(build_presentation(config, arguments.schemas), separators=(",", ":")))
        return 0
    except (WalletError, KeyError, TypeError, ValueError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
