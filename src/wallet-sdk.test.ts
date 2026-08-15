import { describe, expect, it } from "vitest";
import { ExpWalletSdk, WalletSdkError, walletSigningBytes, type WalletFetchResponse } from "./wallet-sdk.js";

const now = "2026-08-09T16:00:00.000Z";
const later = "2026-08-09T16:10:00.000Z";
const signature = { algorithm: "Ed25519" as const, keyId: "app-key", value: "x".repeat(43) };
const request = {
  profileVersion: "0.1.0-draft.1" as const, id: "94000000-0000-4000-8000-000000000001",
  requesterEntityId: "94000000-0000-4000-8000-000000000002", requesterName: "Shop",
  requesterOrigin: "https://shop.example", callbackUri: "https://shop.example/v1/exp/presentations",
  purpose: "commerce.personalization", requestedScopes: ["commerce.apparel", "identity.contact"],
  requestedOperations: ["evaluate" as const], prohibitedReuse: ["resale"], nonce: "wallet-sdk-nonce-0000001",
  issuedAt: now, expiresAt: later, signature,
};
const view = {
  id: "94000000-0000-4000-8000-000000000003", sourceModelId: "94000000-0000-4000-8000-000000000004",
  entityId: "94000000-0000-4000-8000-000000000005", definitionId: "94000000-0000-4000-8000-000000000006",
  profileId: "commerce", purpose: request.purpose,
  attributes: [{ sourceAttributeId: "94000000-0000-4000-8000-000000000007", namespace: "commerce.apparel.style", name: "style", disclosure: "consented" as const, value: ["minimal"], evidenceReferences: [] }],
  omittedNamespaces: ["identity.contact"], createdAt: now, expiresAt: later,
};

function response(value: unknown, status = 200): WalletFetchResponse {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(value) };
}

describe("runtime-neutral wallet SDK", () => {
  it("retrieves a trusted same-origin request and creates a narrowed signed presentation", async () => {
    const calls: string[] = [];
    const sdk = new ExpWalletSdk({
      fetch: (url): Promise<WalletFetchResponse> => { calls.push(url); return Promise.resolve(response(request)); },
      verifier: { verify: (_request, bytes): Promise<boolean> => Promise.resolve(bytes.length > 0) },
      signer: { keyId: "wallet-key", sign: (bytes): Promise<string> => Promise.resolve(bytes.length > 0 ? "s".repeat(86) : "") },
      now: (): string => now,
      createId: ((): (() => string) => { let id = 8; return (): string => `94000000-0000-4000-8000-${String(id++).padStart(12, "0")}`; })(),
    });
    const retrieved = await sdk.retrieveRequest("https://shop.example/v1/exp/connect/94000000-0000-4000-8000-000000000001");
    const presentation = await sdk.createPresentation(retrieved, view, {
      principalEntityId: view.entityId, approvedScopes: ["commerce.apparel"], approvedOperations: ["evaluate"], expiresAt: later,
    });
    expect(calls).toHaveLength(1);
    expect(presentation.view.omittedNamespaces).toContain("identity.contact");
    expect(presentation.consent.approvedScopes).toEqual(["commerce.apparel"]);
    expect(walletSigningBytes(presentation)).toEqual(walletSigningBytes({ ...presentation, signature: { ...presentation.signature, value: "different" } }));
  });

  it("rejects insecure transport, origin substitution, and widened approval", async () => {
    const sdk = new ExpWalletSdk({
      fetch: (): Promise<WalletFetchResponse> => Promise.resolve(response({ ...request, requesterOrigin: "https://attacker.example" })),
      verifier: { verify: (): Promise<boolean> => Promise.resolve(true) },
      signer: { keyId: "wallet-key", sign: (): Promise<string> => Promise.resolve("s".repeat(86)) },
      now: (): string => now, createId: (): string => "94000000-0000-4000-8000-000000000009",
    });
    await expect(sdk.retrieveRequest("http://shop.example/request")).rejects.toMatchObject({ code: "INSECURE_TRANSPORT" });
    await expect(sdk.retrieveRequest("https://shop.example/request")).rejects.toMatchObject({ code: "ORIGIN_MISMATCH" });
    await expect(sdk.createPresentation(request, view, {
      principalEntityId: view.entityId, approvedScopes: ["health.records"], approvedOperations: ["evaluate"], expiresAt: later,
    })).rejects.toBeInstanceOf(WalletSdkError);
  });

  it("distinguishes caller cancellation from the SDK timeout", async () => {
    const sdk = new ExpWalletSdk({
      fetch: (_url, init): Promise<WalletFetchResponse> => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
      verifier: { verify: (): Promise<boolean> => Promise.resolve(true) },
      signer: { keyId: "wallet-key", sign: (): Promise<string> => Promise.resolve("s".repeat(86)) },
      now: (): string => now,
      createId: (): string => "94000000-0000-4000-8000-000000000009",
      timeoutMs: 1_000,
    });
    const controller = new AbortController();
    const pending = sdk.retrieveRequest("https://shop.example/request", {
      signal: controller.signal,
      requestId: "request-cancelled",
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "REQUEST_CANCELLED",
      requestId: "request-cancelled",
      retryable: false,
    });
  });

  it("enforces a caller deadline and normalizes malformed responses", async () => {
    const sdk = new ExpWalletSdk({
      fetch: (url): Promise<WalletFetchResponse> => Promise.resolve(
        response(url.endsWith("/malformed") ? { invalid: true } : request),
      ),
      verifier: { verify: (): Promise<boolean> => Promise.resolve(true) },
      signer: { keyId: "wallet-key", sign: (): Promise<string> => Promise.resolve("s".repeat(86)) },
      now: (): string => now,
      createId: (): string => "94000000-0000-4000-8000-000000000009",
    });
    await expect(sdk.retrieveRequest("https://shop.example/request", {
      deadlineAt: "2026-08-09T15:59:00.000Z",
    })).rejects.toMatchObject({ code: "DEADLINE_EXCEEDED" });
    await expect(sdk.retrieveRequest("https://shop.example/malformed")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: false,
    });
  });

  it("classifies retryable HTTP rejection and Retry-After metadata", async () => {
    const sdk = new ExpWalletSdk({
      fetch: (): Promise<WalletFetchResponse> => Promise.resolve({
        ok: false,
        status: 429,
        headers: { "retry-after": "3" },
        json: () => Promise.resolve({}),
      }),
      verifier: { verify: (): Promise<boolean> => Promise.resolve(true) },
      signer: { keyId: "wallet-key", sign: (): Promise<string> => Promise.resolve("s".repeat(86)) },
      now: (): string => now,
      createId: (): string => "94000000-0000-4000-8000-000000000009",
    });
    await expect(sdk.retrieveRequest("https://shop.example/request")).rejects.toMatchObject({
      code: "REQUEST_REJECTED",
      status: 429,
      retryable: true,
      retryAfterMs: 3_000,
    });
  });

  it("keeps cancellation active while a response body is being decoded", async () => {
    const sdk = new ExpWalletSdk({
      fetch: (_url, init): Promise<WalletFetchResponse> => Promise.resolve({
        ok: true,
        status: 200,
        json: () => new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("body aborted")), { once: true });
        }),
      }),
      verifier: { verify: (): Promise<boolean> => Promise.resolve(true) },
      signer: { keyId: "wallet-key", sign: (): Promise<string> => Promise.resolve("s".repeat(86)) },
      now: (): string => now,
      createId: (): string => "94000000-0000-4000-8000-000000000009",
      timeoutMs: 1,
    });
    await expect(sdk.retrieveRequest("https://shop.example/request")).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
  });
});
