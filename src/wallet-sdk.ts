/**
 * Module: EXP wallet SDK
 * Purpose: Provides runtime-neutral direct-connect helpers for browsers and mobile wrappers.
 */
import { z } from "zod";
import { entityViewSchema, type EntityView } from "./entity-model.js";
import { ExpError, parseRetryAfter } from "./errors.js";
import { signedRecordBytes } from "./signing.js";
import {
  EXP_WALLET_PROFILE_VERSION,
  validateWalletPresentation,
  walletConnectRequestSchema,
  walletPresentationSchema,
  type WalletConnectRequest,
  type WalletPresentation,
} from "./wallet.js";

export const walletSdkErrorCodeSchema = z.enum([
  "REQUEST_CANCELLED",
  "INVALID_REQUEST_URL",
  "INSECURE_TRANSPORT",
  "REQUEST_TIMEOUT",
  "DEADLINE_EXCEEDED",
  "TRANSPORT_FAILURE",
  "INVALID_RESPONSE",
  "REQUEST_REJECTED",
  "INVALID_REQUEST_SIGNATURE",
  "ORIGIN_MISMATCH",
  "CALLBACK_ORIGIN_MISMATCH",
  "APPROVAL_EXCEEDS_REQUEST",
  "INVALID_PRESENTATION",
  "INVALID_TIMEOUT",
  "INVALID_DEADLINE",
]);

export class WalletSdkError extends Error {
  public readonly retryable: boolean;
  public readonly status: number | undefined;
  public readonly requestId: string | undefined;
  public readonly retryAfterMs: number | undefined;

  public constructor(
    public readonly code: z.infer<typeof walletSdkErrorCodeSchema>,
    message: string,
    options: { readonly retryable?: boolean | undefined; readonly status?: number | undefined; readonly requestId?: string | undefined; readonly retryAfterMs?: number | undefined; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "WalletSdkError";
    this.retryable = options.retryable ?? new ExpError(code, message, options).retryable;
    this.status = options.status;
    this.requestId = options.requestId;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export interface WalletFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  json(): Promise<unknown>;
}

export type WalletFetch = (
  input: string,
  init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string; signal: AbortSignal },
) => Promise<WalletFetchResponse>;

export interface WalletRequestVerifier {
  verify(request: WalletConnectRequest, canonicalPayload: Uint8Array): Promise<boolean>;
}

export interface WalletPresentationSigner {
  readonly keyId: string;
  sign(canonicalPayload: Uint8Array): Promise<string>;
}

export interface MobileSecureKeyStore {
  hasKey(keyId: string): Promise<boolean>;
  createKey(keyId: string): Promise<void>;
  deleteKey(keyId: string): Promise<void>;
}

export interface MobileWalletPlatformAdapter {
  readonly runtime: "ios" | "android";
  readonly secureKeys: MobileSecureKeyStore;
  openExternal(uri: string): Promise<void>;
  registerDeepLink(handler: (requestUri: string) => Promise<void>): () => void;
  scheduleGatewayWakeup(authorizationId: string, notAfter: string): Promise<void>;
}

/** Returns UTF-8 RFC 8785 bytes for a signed EXP wallet record with its signature omitted. */
export function walletSigningBytes(record: { signature: unknown }): Uint8Array {
  try {
    return signedRecordBytes(record as Readonly<Record<string, unknown>>, ["signature"]);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new WalletSdkError("INVALID_PRESENTATION", error.message);
    }
    throw error;
  }
}

function loopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export interface ExpWalletSdkOptions {
  readonly fetch: WalletFetch;
  readonly verifier: WalletRequestVerifier;
  readonly signer: WalletPresentationSigner;
  readonly now: () => string;
  readonly createId: () => string;
  readonly timeoutMs?: number;
  readonly allowLoopbackHttpForProof?: boolean;
}

export interface WalletRequestOptions {
  readonly signal?: AbortSignal;
  readonly deadlineAt?: string;
  readonly requestId?: string;
}

export interface WalletApproval {
  readonly principalEntityId: string;
  readonly approvedScopes: readonly string[];
  readonly approvedOperations: readonly ("evaluate" | "personalize" | "draft_proposal")[];
  readonly expiresAt: string;
}

type AbortReason = "caller" | "timeout" | "deadline";

interface ManagedRequest {
  readonly signal: AbortSignal;
  readonly reason: () => AbortReason | undefined;
  readonly cleanup: () => void;
}

function headerValue(response: WalletFetchResponse, name: string): string | undefined {
  const target = name.toLowerCase();
  return Object.entries(response.headers ?? {}).find(([key]) => key.toLowerCase() === target)?.[1];
}

function managedRequest(
  options: WalletRequestOptions,
  defaultTimeoutMs: number,
  now: string,
): ManagedRequest {
  if (options.signal?.aborted) {
    throw new WalletSdkError("REQUEST_CANCELLED", "The wallet request was cancelled.", { requestId: options.requestId });
  }
  const timeoutMs = defaultTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new WalletSdkError("INVALID_TIMEOUT", "Wallet request timeout must be a positive finite number.", { requestId: options.requestId });
  }
  let deadlineMs: number | undefined;
  if (options.deadlineAt !== undefined) {
    deadlineMs = Date.parse(options.deadlineAt);
    if (Number.isNaN(deadlineMs)) {
      throw new WalletSdkError("INVALID_DEADLINE", "Wallet request deadline must be an ISO timestamp.", { requestId: options.requestId });
    }
    const nowMs = Date.parse(now);
    if (Number.isNaN(nowMs) || deadlineMs <= nowMs) {
      throw new WalletSdkError("DEADLINE_EXCEEDED", "The wallet request deadline has elapsed.", { requestId: options.requestId });
    }
    deadlineMs -= nowMs;
  }
  const deadlineTimerMs = deadlineMs === undefined ? timeoutMs : Math.min(timeoutMs, deadlineMs);
  const controller = new AbortController();
  let abortReason: AbortReason | undefined;
  const onCallerAbort = (): void => {
    abortReason = "caller";
    controller.abort(options.signal?.reason);
  };
  options.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    abortReason = deadlineMs !== undefined && deadlineMs <= timeoutMs ? "deadline" : "timeout";
    controller.abort();
  }, deadlineTimerMs);
  return {
    signal: controller.signal,
    reason: () => abortReason,
    cleanup: () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

/** Implements the outbound-only portion shared by browser wallets and native mobile wrappers. */
export class ExpWalletSdk {
  public constructor(private readonly options: ExpWalletSdkOptions) {}

  public async retrieveRequest(requestUri: string, requestOptions: WalletRequestOptions = {}): Promise<WalletConnectRequest> {
    let url: URL;
    try { url = new URL(requestUri); }
    catch { throw new WalletSdkError("INVALID_REQUEST_URL", "Connect request URI is invalid."); }
    if (url.protocol !== "https:" && !(this.options.allowLoopbackHttpForProof === true && loopback(url.hostname)))
      throw new WalletSdkError("INSECURE_TRANSPORT", "Connect requests require HTTPS outside explicit loopback proof mode.");
    const request = managedRequest(requestOptions, this.options.timeoutMs ?? 5_000, this.options.now());
    try {
      const response = await this.options.fetch(url.toString(), { method: "GET", signal: request.signal });
      if (!response.ok) throw new WalletSdkError("REQUEST_REJECTED", `Connect request failed with status ${response.status}.`, {
        status: response.status,
        requestId: requestOptions.requestId,
        retryAfterMs: parseRetryAfter(headerValue(response, "retry-after")),
      });
      let parsedRequest: WalletConnectRequest;
      try {
        parsedRequest = walletConnectRequestSchema.parse(await response.json());
      } catch (error) {
        throw new WalletSdkError("INVALID_RESPONSE", "Connect endpoint returned an invalid request.", { requestId: requestOptions.requestId, cause: error });
      }
      if (new URL(parsedRequest.requesterOrigin).origin !== url.origin)
        throw new WalletSdkError("ORIGIN_MISMATCH", "Signed requester origin differs from the request endpoint.");
      if (new URL(parsedRequest.callbackUri).origin !== parsedRequest.requesterOrigin)
        throw new WalletSdkError("CALLBACK_ORIGIN_MISMATCH", "Callback origin differs from the signed requester origin.");
      if (!(await this.options.verifier.verify(parsedRequest, walletSigningBytes(parsedRequest))))
        throw new WalletSdkError("INVALID_REQUEST_SIGNATURE", "Connect request signature is not trusted.");
      return parsedRequest;
    } catch (error) {
      const reason = request.reason();
      if (error instanceof WalletSdkError && reason === undefined) throw error;
      if (reason === "caller") throw new WalletSdkError("REQUEST_CANCELLED", "The wallet request was cancelled.", { requestId: requestOptions.requestId, cause: error });
      if (reason === "deadline") throw new WalletSdkError("DEADLINE_EXCEEDED", "The wallet request deadline elapsed.", { requestId: requestOptions.requestId, cause: error });
      if (reason === "timeout") throw new WalletSdkError("REQUEST_TIMEOUT", "Connect request timed out.", { requestId: requestOptions.requestId, cause: error });
      if (error instanceof WalletSdkError) throw error;
      throw new WalletSdkError("TRANSPORT_FAILURE", "The connect request could not be completed.", { requestId: requestOptions.requestId, cause: error });
    } finally {
      request.cleanup();
    }
  }

  public async createPresentation(requestInput: unknown, viewInput: unknown, approval: WalletApproval): Promise<WalletPresentation> {
    const request = walletConnectRequestSchema.parse(requestInput);
    const view = entityViewSchema.parse(viewInput);
    if (approval.approvedScopes.some((scope) => !request.requestedScopes.includes(scope)) ||
        approval.approvedOperations.some((operation) => !request.requestedOperations.includes(operation)))
      throw new WalletSdkError("APPROVAL_EXCEEDS_REQUEST", "Wallet approval cannot widen the application request.");
    const unsignedPresentation = {
      profileVersion: EXP_WALLET_PROFILE_VERSION,
      id: this.options.createId(), requestId: request.id, audience: request.requesterOrigin,
      nonce: request.nonce, view,
      consent: {
        id: this.options.createId(), requestId: request.id, principalEntityId: approval.principalEntityId,
        requesterEntityId: request.requesterEntityId, purpose: request.purpose,
        approvedScopes: [...approval.approvedScopes], approvedOperations: [...approval.approvedOperations],
        requestNonce: request.nonce, decision: "approved" as const, containsRawContext: false as const,
        approvedAt: this.options.now(), expiresAt: approval.expiresAt,
      },
      containsRawContext: false as const, issuedAt: this.options.now(), expiresAt: approval.expiresAt,
      signature: { algorithm: "Ed25519" as const, keyId: this.options.signer.keyId, value: "x".repeat(43) },
    };
    try { validateWalletPresentation(unsignedPresentation, request, this.options.now()); }
    catch (error) { throw new WalletSdkError("INVALID_PRESENTATION", error instanceof Error ? error.message : "Invalid presentation."); }
    const value = await this.options.signer.sign(walletSigningBytes(unsignedPresentation));
    return walletPresentationSchema.parse({ ...unsignedPresentation, signature: { ...unsignedPresentation.signature, value } });
  }

  public async submitPresentation(
    request: WalletConnectRequest,
    presentation: WalletPresentation,
    requestOptions: WalletRequestOptions = {},
  ): Promise<WalletFetchResponse> {
    const managed = managedRequest(requestOptions, this.options.timeoutMs ?? 5_000, this.options.now());
    let response: WalletFetchResponse;
    try {
      response = await this.options.fetch(request.callbackUri, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(presentation), signal: managed.signal,
      });
    } catch (error) {
      const reason = managed.reason();
      managed.cleanup();
      if (reason === "caller") throw new WalletSdkError("REQUEST_CANCELLED", "The wallet request was cancelled.", { requestId: requestOptions.requestId, cause: error });
      if (reason === "deadline") throw new WalletSdkError("DEADLINE_EXCEEDED", "The wallet request deadline elapsed.", { requestId: requestOptions.requestId, cause: error });
      if (reason === "timeout") throw new WalletSdkError("REQUEST_TIMEOUT", "Presentation submission timed out.", { requestId: requestOptions.requestId, cause: error });
      throw new WalletSdkError("TRANSPORT_FAILURE", "The presentation submission could not be completed.", { requestId: requestOptions.requestId, cause: error });
    }
    managed.cleanup();
    if (!response.ok) {
      throw new WalletSdkError("REQUEST_REJECTED", `Presentation submission failed with status ${response.status}.`, {
        status: response.status,
        requestId: requestOptions.requestId,
        retryAfterMs: parseRetryAfter(headerValue(response, "retry-after")),
      });
    }
    return response;
  }
}

export type { EntityView };
