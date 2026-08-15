/**
 * Module: EXP transport-neutral adapter contracts
 * Purpose: Define delivery seams without requiring HTTP, MCP, NFC, or a platform runtime.
 *
 * These interfaces are adapter contracts, not additional v0.1 wire records. A carrier binding
 * decides how a request is encoded and where carrier metadata is stored.
 */

import type { NodeDescriptor } from "./trust.js";

export interface ExpTransportSignature {
  readonly algorithm: string;
  readonly keyId: string;
  readonly signature: string;
  readonly signedAt: string;
}

export interface ExpTransportRequest {
  readonly messageId: string;
  readonly operation: string;
  readonly senderId: string;
  readonly recipientId?: string;
  readonly nonce: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly payload: Uint8Array;
  readonly signature?: ExpTransportSignature;
  /**
   * Carrier metadata is intentionally outside the protocol signing input. Bindings must
   * explicitly promote any security-sensitive carrier value into a signed protocol field.
   */
  readonly carrierMetadata?: Readonly<Record<string, string>>;
}

export interface ExpTransportError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
}

export interface ExpTransportResponse {
  readonly messageId: string;
  readonly accepted: boolean;
  readonly receivedAt: string;
  readonly payload?: Uint8Array;
  readonly error?: ExpTransportError;
  readonly carrierMetadata?: Readonly<Record<string, string>>;
}

export interface ExpTransportOptions {
  readonly signal?: AbortSignal;
  readonly deadlineAt?: string;
  readonly requestId?: string;
}

/** A delivery mechanism that can carry EXP requests without defining a specific carrier. */
export interface ExpTransport {
  send(request: ExpTransportRequest, options?: ExpTransportOptions): Promise<ExpTransportResponse>;
}

export interface ExpTransportSigner {
  readonly keyId: string;
  sign(payload: Uint8Array, context: {
    readonly messageId: string;
    readonly operation: string;
  }): Promise<ExpTransportSignature>;
}

export interface ExpTransportVerifier {
  verify(
    payload: Uint8Array,
    signature: ExpTransportSignature,
    context: {
      readonly messageId: string;
      readonly operation: string;
      readonly senderId: string;
      readonly recipientId?: string;
    },
  ): Promise<boolean>;
}

export interface ExpReplayClaim {
  readonly senderId: string;
  readonly nonce: string;
  readonly expiresAt?: string;
}

/** Claims a nonce exactly once within the adapter's configured retention policy. */
export interface ExpReplayStore {
  claim(claim: ExpReplayClaim): Promise<"accepted" | "replay">;
}

/** Resolves sender trust independently of how a request was delivered. */
export interface ExpDescriptorResolver {
  resolve(nodeId: string): Promise<NodeDescriptor | undefined>;
}

export interface ExpTransportBinding<CarrierRequest, CarrierResponse> {
  encode(request: ExpTransportRequest, options?: ExpTransportOptions): CarrierRequest;
  decode(response: CarrierResponse): ExpTransportResponse;
}
