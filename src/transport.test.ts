import { describe, expect, it } from "vitest";
import { signedRecordBytes, signatureReferenceSchema } from "./signing.js";
import type {
  ExpTransportBinding,
  ExpTransportRequest,
  ExpTransportResponse,
} from "./transport.js";

describe("transport-neutral adapter contracts", () => {
  it("keeps carrier encoding separate from opaque EXP payload bytes", () => {
    const binding: ExpTransportBinding<{ body: Uint8Array }, { body: Uint8Array }> = {
      encode: (request) => ({ body: request.payload }),
      decode: (response): ExpTransportResponse => ({
        messageId: "message-1",
        accepted: true,
        receivedAt: "2026-08-10T00:00:00.000Z",
        payload: response.body,
      }),
    };
    const request: ExpTransportRequest = {
      messageId: "message-1",
      operation: "context:read",
      senderId: "wallet-1",
      recipientId: "service-1",
      nonce: "nonce-1",
      createdAt: "2026-08-10T00:00:00.000Z",
      payload: new Uint8Array([1, 2, 3]),
      carrierMetadata: { channel: "mcp" },
    };

    const carrier = binding.encode(request);
    const response = binding.decode(carrier);
    expect([...response.payload ?? []]).toEqual([1, 2, 3]);
    expect(request.carrierMetadata).toEqual({ channel: "mcp" });
  });

  it("retains existing signature metadata and omitted-field semantics", () => {
    const reference = signatureReferenceSchema.parse({
      algorithm: "Ed25519",
      keyId: "wallet-key",
      signature: "x".repeat(43),
      signedAt: "2026-08-10T00:00:00.000Z",
    });
    expect(reference.algorithm).toBe("Ed25519");
    const record = { payload: { value: "approved" }, signature: reference.signature };
    expect(Buffer.from(signedRecordBytes(record, ["signature"])).toString("utf8")).toBe(
      '{"payload":{"value":"approved"}}',
    );
  });
});
