/**
 * Module: EXP wallet SDK
 * Purpose: Provides runtime-neutral direct-connect helpers for browsers and mobile wrappers.
 */
import { z } from "zod";
import { entityViewSchema, type EntityView } from "./entity-model.js";
import {
  EXP_WALLET_PROFILE_VERSION,
  validateWalletPresentation,
  walletConnectRequestSchema,
  walletPresentationSchema,
  type WalletConnectRequest,
  type WalletPresentation,
} from "./wallet.js";

export const walletSdkErrorCodeSchema = z.enum([
  "INVALID_REQUEST_URL",
  "INSECURE_TRANSPORT",
  "REQUEST_TIMEOUT",
  "REQUEST_REJECTED",
  "INVALID_REQUEST_SIGNATURE",
  "ORIGIN_MISMATCH",
  "CALLBACK_ORIGIN_MISMATCH",
  "APPROVAL_EXCEEDS_REQUEST",
  "INVALID_PRESENTATION",
]);

export class WalletSdkError extends Error {
  public constructor(public readonly code: z.infer<typeof walletSdkErrorCodeSchema>, message: string) {
    super(message);
    this.name = "WalletSdkError";
  }
}

export interface WalletFetchResponse {
  readonly ok: boolean;
  readonly status: number;
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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new WalletSdkError("INVALID_PRESENTATION", "Unsupported canonical signing value.");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

function withoutSignature(record: { signature: unknown }): Record<string, unknown> {
  const { signature, ...payload } = record;
  void signature;
  return payload;
}

/** Returns UTF-8 JCS bytes for a signed EXP wallet record with its signature omitted. */
export function walletSigningBytes(record: { signature: unknown }): Uint8Array {
  return new TextEncoder().encode(canonicalJson(withoutSignature(record)));
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

export interface WalletApproval {
  readonly principalEntityId: string;
  readonly approvedScopes: readonly string[];
  readonly approvedOperations: readonly ("evaluate" | "personalize" | "draft_proposal")[];
  readonly expiresAt: string;
}

/** Implements the outbound-only portion shared by browser wallets and native mobile wrappers. */
export class ExpWalletSdk {
  public constructor(private readonly options: ExpWalletSdkOptions) {}

  public async retrieveRequest(requestUri: string): Promise<WalletConnectRequest> {
    let url: URL;
    try { url = new URL(requestUri); }
    catch { throw new WalletSdkError("INVALID_REQUEST_URL", "Connect request URI is invalid."); }
    if (url.protocol !== "https:" && !(this.options.allowLoopbackHttpForProof === true && loopback(url.hostname)))
      throw new WalletSdkError("INSECURE_TRANSPORT", "Connect requests require HTTPS outside explicit loopback proof mode.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5_000);
    let response: WalletFetchResponse;
    try { response = await this.options.fetch(url.toString(), { method: "GET", signal: controller.signal }); }
    catch (error) {
      if (controller.signal.aborted) throw new WalletSdkError("REQUEST_TIMEOUT", "Connect request timed out.");
      throw error;
    } finally { clearTimeout(timeout); }
    if (!response.ok) throw new WalletSdkError("REQUEST_REJECTED", `Connect request failed with status ${response.status}.`);
    const request = walletConnectRequestSchema.parse(await response.json());
    if (new URL(request.requesterOrigin).origin !== url.origin)
      throw new WalletSdkError("ORIGIN_MISMATCH", "Signed requester origin differs from the request endpoint.");
    if (new URL(request.callbackUri).origin !== request.requesterOrigin)
      throw new WalletSdkError("CALLBACK_ORIGIN_MISMATCH", "Callback origin differs from the signed requester origin.");
    if (!(await this.options.verifier.verify(request, walletSigningBytes(request))))
      throw new WalletSdkError("INVALID_REQUEST_SIGNATURE", "Connect request signature is not trusted.");
    return request;
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

  public async submitPresentation(request: WalletConnectRequest, presentation: WalletPresentation): Promise<WalletFetchResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5_000);
    try {
      return await this.options.fetch(request.callbackUri, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(presentation), signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new WalletSdkError("REQUEST_TIMEOUT", "Presentation submission timed out.");
      throw error;
    } finally { clearTimeout(timeout); }
  }
}

export type { EntityView };
