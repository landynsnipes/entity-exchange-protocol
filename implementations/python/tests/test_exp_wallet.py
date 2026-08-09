"""Tests the independent Python EXP wallet against published schemas."""
from __future__ import annotations

import unittest
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from exp_wallet import WalletError, build_presentation


ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = ROOT / "schemas"
if not SCHEMAS.exists():
    SCHEMAS = ROOT.parent / "packages" / "protocol" / "generated"
NOW = "2026-08-09T16:00:00.000Z"
LATER = "2026-08-09T16:10:00.000Z"


def config() -> dict:
    key = Ed25519PrivateKey.generate()
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    request = {
        "profileVersion": "0.1.0-draft.1", "id": "95000000-0000-4000-8000-000000000001",
        "requesterEntityId": "95000000-0000-4000-8000-000000000002", "requesterName": "Shop",
        "requesterOrigin": "https://shop.example", "callbackUri": "https://shop.example/v1/exp/presentations",
        "purpose": "commerce.personalization", "requestedScopes": ["commerce.apparel", "identity.contact"],
        "requestedOperations": ["evaluate"], "prohibitedReuse": ["resale"], "nonce": "python-wallet-nonce-00001",
        "issuedAt": NOW, "expiresAt": LATER,
        "signature": {"algorithm": "Ed25519", "keyId": "app-key", "value": "x" * 43},
    }
    entity_id = "95000000-0000-4000-8000-000000000003"
    view = {
        "id": "95000000-0000-4000-8000-000000000004", "sourceModelId": "95000000-0000-4000-8000-000000000005",
        "entityId": entity_id, "definitionId": "95000000-0000-4000-8000-000000000006", "profileId": "commerce",
        "purpose": request["purpose"], "attributes": [{"sourceAttributeId": "95000000-0000-4000-8000-000000000007", "namespace": "commerce.apparel.style", "name": "style", "disclosure": "consented", "value": ["minimal"], "evidenceReferences": []}],
        "omittedNamespaces": ["identity.contact"], "createdAt": NOW, "expiresAt": LATER,
    }
    return {"request": request, "view": view, "principalEntityId": entity_id, "approvedScopes": ["commerce.apparel"], "approvedOperations": ["evaluate"], "presentationId": "95000000-0000-4000-8000-000000000008", "consentId": "95000000-0000-4000-8000-000000000009", "keyId": "python-wallet-key", "privateKeyPem": pem, "now": NOW, "expiresAt": LATER}


class PythonWalletTests(unittest.TestCase):
    def test_builds_minimized_signed_presentation(self) -> None:
        presentation = build_presentation(config(), SCHEMAS)
        self.assertEqual(presentation["consent"]["approvedScopes"], ["commerce.apparel"])
        self.assertNotIn("identity.contact", str(presentation["view"]["attributes"]))
        self.assertGreater(len(presentation["signature"]["value"]), 80)

    def test_rejects_scope_escalation(self) -> None:
        value = config()
        value["approvedScopes"] = ["health.records"]
        with self.assertRaisesRegex(WalletError, "APPROVAL_EXCEEDS_REQUEST"):
            build_presentation(value, SCHEMAS)


if __name__ == "__main__":
    unittest.main()
