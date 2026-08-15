import { describe, expect, it } from "vitest";
import { createInMemoryTransportPair } from "./in-memory-transport.js";
import { walletPresentationSchema } from "./wallet.js";
import type { ExpTransportRequest } from "./transport.js";

const NOW = "2026-08-14T20:00:00.000Z";

function request(overrides: Partial<ExpTransportRequest> = {}): ExpTransportRequest {
  return {
    messageId: "99000000-0000-4000-8000-000000000101",
    operation: "context:read",
    senderId: "wallet",
    recipientId: "service",
    nonce: "in-memory-nonce-001",
    createdAt: NOW,
    expiresAt: "2026-08-14T20:05:00.000Z",
    payload: new TextEncoder().encode('{"scope":"hospitality.seating"}'),
    ...overrides,
  };
}

describe("in-memory transport", () => {
  it("delivers opaque payloads without a network carrier", async () => {
    const pair = createInMemoryTransportPair({
      leftId: "wallet",
      rightId: "service",
      rightOptions: { now: () => NOW },
    });
    const response = await pair.left.send(request());
    expect(response.accepted).toBe(true);
    expect(new TextDecoder().decode(response.payload)).toBe('{"scope":"hospitality.seating"}');
  });

  it("delivers a validated wallet presentation without HTTP or MCP", async () => {
    const presentation = {
      profileVersion: "0.1.0-draft.1",
      id: "99000000-0000-4000-8000-000000000103",
      requestId: "99000000-0000-4000-8000-000000000104",
      audience: "https://restaurant.example",
      nonce: "wallet-presentation-nonce-001",
      view: {
        id: "99000000-0000-4000-8000-000000000105",
        sourceModelId: "99000000-0000-4000-8000-000000000106",
        entityId: "99000000-0000-4000-8000-000000000107",
        definitionId: "99000000-0000-4000-8000-000000000108",
        profileId: "org.entity-exchange.profile.hospitality",
        purpose: "hospitality.menu_and_seating",
        attributes: [{
          sourceAttributeId: "99000000-0000-4000-8000-000000000109",
          namespace: "hospitality.seating.preference",
          name: "preference",
          disclosure: "consented",
          value: ["quiet"],
          evidenceReferences: [],
        }],
        omittedNamespaces: ["health.private"],
        createdAt: NOW,
        expiresAt: "2026-08-14T20:05:00.000Z",
      },
      consent: {
        id: "99000000-0000-4000-8000-000000000110",
        requestId: "99000000-0000-4000-8000-000000000104",
        principalEntityId: "99000000-0000-4000-8000-000000000107",
        requesterEntityId: "99000000-0000-4000-8000-000000000111",
        purpose: "hospitality.menu_and_seating",
        approvedScopes: ["hospitality.seating"],
        approvedOperations: ["personalize"],
        requestNonce: "wallet-presentation-nonce-001",
        decision: "approved",
        containsRawContext: false,
        approvedAt: NOW,
        expiresAt: "2026-08-14T20:05:00.000Z",
      },
      containsRawContext: false,
      issuedAt: NOW,
      expiresAt: "2026-08-14T20:05:00.000Z",
      signature: { algorithm: "Ed25519", keyId: "wallet-key", value: "x".repeat(43) },
    };
    const pair = createInMemoryTransportPair({
      leftId: "wallet",
      rightId: "service",
      rightHandler: async (incoming) => {
        const parsed = walletPresentationSchema.parse(JSON.parse(new TextDecoder().decode(incoming.payload)));
        return { messageId: incoming.messageId, accepted: true, receivedAt: NOW, payload: new TextEncoder().encode(JSON.stringify(parsed)) };
      },
      rightOptions: { now: () => NOW },
    });
    const response = await pair.left.send(request({
      messageId: "99000000-0000-4000-8000-000000000112",
      nonce: "wallet-presentation-delivery-nonce",
      payload: new TextEncoder().encode(JSON.stringify(presentation)),
    }));
    expect(response.accepted).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(response.payload)).containsRawContext).toBe(false);
  });

  it("rejects replay, expiry, recipient mismatch, and invalid signatures", async () => {
    const pair = createInMemoryTransportPair({
      leftId: "wallet",
      rightId: "service",
      rightOptions: {
        now: () => NOW,
        verifier: { verify: async () => false },
      },
    });
    const signed = request({ signature: { algorithm: "Ed25519", keyId: "wallet", signature: "x".repeat(43), signedAt: NOW } });
    expect((await pair.left.send(signed)).error?.code).toBe("INVALID_SIGNATURE");

    const noVerifierPair = createInMemoryTransportPair({
      leftId: "wallet",
      rightId: "service",
      rightOptions: { now: () => NOW },
    });
    expect((await noVerifierPair.left.send(request())).accepted).toBe(true);
    expect((await noVerifierPair.left.send(request())).error?.code).toBe("NONCE_REPLAY");
    expect((await noVerifierPair.left.send(request({ nonce: "in-memory-nonce-002", expiresAt: NOW }))).error?.code).toBe("REQUEST_EXPIRED");
    expect((await noVerifierPair.left.send(request({ nonce: "in-memory-nonce-003", recipientId: "other-service" }))).error?.code).toBe("RECIPIENT_MISMATCH");
  });

  it("claims concurrent nonces exactly once", async () => {
    const pair = createInMemoryTransportPair({
      leftId: "wallet",
      rightId: "service",
      rightOptions: { now: () => NOW },
    });
    const responses = await Promise.all([
      pair.left.send(request({ nonce: "concurrent-nonce" })),
      pair.left.send(request({ nonce: "concurrent-nonce", messageId: "99000000-0000-4000-8000-000000000102" })),
    ]);
    expect(responses.filter((response) => response.accepted)).toHaveLength(1);
    expect(responses.find((response) => !response.accepted)?.error?.code).toBe("NONCE_REPLAY");
  });

  it("maps caller cancellation and deadlines", async () => {
    const controller = new AbortController();
    const pair = createInMemoryTransportPair({
      leftId: "wallet",
      rightId: "service",
      rightHandler: async (value) => new Promise((resolve) => {
        setTimeout(() => resolve({
          messageId: value.messageId,
          accepted: true,
          receivedAt: NOW,
          payload: value.payload,
        }), 50);
      }),
      rightOptions: { now: () => NOW },
    });
    const pending = pair.left.send(request({ nonce: "cancel-nonce" }), { signal: controller.signal });
    controller.abort();
    expect((await pending).error?.code).toBe("REQUEST_CANCELLED");
    expect((await pair.left.send(request({ nonce: "deadline-nonce" }), { deadlineAt: NOW })).error?.code).toBe("DEADLINE_EXCEEDED");
  });
});
