import { describe, expect, it } from "vitest";
import {
  PinnedWebCryptoRequestVerifier,
  WebCryptoEd25519Signer,
  generateBrowserWalletKey,
  importRequesterPublicKey,
  walletSigningBytes,
} from "./platform-browser.js";
import type { WalletConnectRequest } from "./wallet.js";

const requestBase = {
  profileVersion: "0.1.0-draft.1" as const,
  id: "97000000-0000-4000-8000-000000000001",
  requesterEntityId: "97000000-0000-4000-8000-000000000002",
  requesterName: "Browser proof application",
  requesterOrigin: "https://browser.example",
  callbackUri: "https://browser.example/v1/exp/presentations",
  purpose: "commerce.personalization",
  requestedScopes: ["commerce.apparel"],
  requestedOperations: ["evaluate" as const],
  prohibitedReuse: ["resale"],
  nonce: "browser-wallet-nonce-0001",
  issuedAt: "2026-08-09T17:00:00.000Z",
  expiresAt: "2026-08-09T17:10:00.000Z",
};

function encode(value: ArrayBuffer): string {
  return Buffer.from(value).toString("base64url");
}

describe("WebCrypto browser wallet adapter", () => {
  it("generates a non-extractable wallet key and signs canonical EXP payloads", async () => {
    const generated = await generateBrowserWalletKey("browser-wallet-key");
    const signature = await generated.signer.sign(new TextEncoder().encode("EXP"));
    const publicKey = await importRequesterPublicKey(generated.publicKeyRaw);
    expect(signature.length).toBeGreaterThan(80);
    expect(await crypto.subtle.verify("Ed25519", publicKey, new Uint8Array(Buffer.from(signature, "base64url")), new TextEncoder().encode("EXP"))).toBe(true);
  });

  it("verifies only the pinned request key and rejects tampering", async () => {
    const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const unsigned = { ...requestBase, signature: { algorithm: "Ed25519" as const, keyId: "app-key", value: "x".repeat(43) } };
    const value = encode(await crypto.subtle.sign("Ed25519", pair.privateKey, new Uint8Array(walletSigningBytes(unsigned))));
    const request: WalletConnectRequest = { ...unsigned, signature: { ...unsigned.signature, value } };
    const verifier = new PinnedWebCryptoRequestVerifier(new Map([["app-key", pair.publicKey]]));
    expect(await verifier.verify(request, walletSigningBytes(request))).toBe(true);
    const tampered: WalletConnectRequest = { ...request, purpose: "tampered" };
    expect(await verifier.verify(tampered, walletSigningBytes(tampered))).toBe(false);
    expect(() => new WebCryptoEd25519Signer("bad", pair.publicKey)).toThrow();
  });
});
