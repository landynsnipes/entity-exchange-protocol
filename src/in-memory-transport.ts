/**
 * Module: EXP in-memory transport
 * Purpose: Provide a deterministic, non-persistent carrier for tests and local demonstrations.
 */

import type {
  ExpReplayClaim,
  ExpTransport,
  ExpTransportError,
  ExpTransportOptions,
  ExpTransportRequest,
  ExpTransportResponse,
  ExpTransportVerifier,
} from "./transport.js";

export type InMemoryTransportHandler = (
  request: ExpTransportRequest,
) => Promise<ExpTransportResponse>;

export interface InMemoryTransportOptions {
  readonly now?: () => string;
  readonly verifier?: ExpTransportVerifier;
  readonly payloadForVerification?: (request: ExpTransportRequest) => Uint8Array;
}

interface EndpointState {
  readonly id: string;
  readonly handler: InMemoryTransportHandler;
  readonly options: InMemoryTransportOptions;
}

function errorResponse(messageId: string, receivedAt: string, error: ExpTransportError): ExpTransportResponse {
  return { messageId, accepted: false, receivedAt, error };
}

function nowMs(now: () => string): number {
  return Date.parse(now());
}

function expired(at: string | undefined, currentMs: number): boolean {
  return at !== undefined && Date.parse(at) <= currentMs;
}

function budgetError(options: ExpTransportOptions, currentMs: number): ExpTransportError | undefined {
  if (options.signal?.aborted) {
    return { code: "REQUEST_CANCELLED", message: "The in-memory request was cancelled.", retryable: false };
  }
  if (expired(options.deadlineAt, currentMs)) {
    return { code: "DEADLINE_EXCEEDED", message: "The in-memory request deadline has elapsed.", retryable: true };
  }
  return undefined;
}

/**
 * A deterministic endpoint pair. Nonces are claimed synchronously before handlers run, so
 * concurrent sends of the same request cannot both be accepted.
 */
export class InMemoryTransportEndpoint implements ExpTransport {
  public constructor(
    private readonly hub: InMemoryTransportHub,
    public readonly id: string,
    private readonly peerId: string,
    private readonly handler: InMemoryTransportHandler,
    private readonly options: InMemoryTransportOptions = {},
  ) {}

  public send(request: ExpTransportRequest, requestOptions: ExpTransportOptions = {}): Promise<ExpTransportResponse> {
    return this.hub.deliver(this.id, this.peerId, this.handler, this.options, request, requestOptions);
  }
}

export class InMemoryTransportHub {
  private readonly replayed = new Map<string, number>();

  public claim(claim: ExpReplayClaim, currentMs: number): "accepted" | "replay" {
    for (const [key, expiresAt] of this.replayed) {
      if (expiresAt <= currentMs) this.replayed.delete(key);
    }
    const key = `${claim.senderId}:${claim.nonce}`;
    if (this.replayed.has(key)) return "replay";
    this.replayed.set(key, claim.expiresAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(claim.expiresAt));
    return "accepted";
  }

  public async deliver(
    senderId: string,
    recipientId: string,
    handler: InMemoryTransportHandler,
    endpointOptions: InMemoryTransportOptions,
    request: ExpTransportRequest,
    requestOptions: ExpTransportOptions,
  ): Promise<ExpTransportResponse> {
    const now = endpointOptions.now ?? (() => new Date().toISOString());
    const receivedAt = now();
    const currentMs = Date.parse(receivedAt);
    const budgetFailure = budgetError(requestOptions, currentMs);
    if (budgetFailure) return errorResponse(request.messageId, receivedAt, budgetFailure);
    if (request.senderId !== senderId) {
      return errorResponse(request.messageId, receivedAt, {
        code: "SENDER_MISMATCH",
        message: "The request sender does not match the transport endpoint.",
        retryable: false,
      });
    }
    if (request.recipientId !== undefined && request.recipientId !== recipientId) {
      return errorResponse(request.messageId, receivedAt, {
        code: "RECIPIENT_MISMATCH",
        message: "The request recipient does not match the linked endpoint.",
        retryable: false,
      });
    }
    if (expired(request.expiresAt, currentMs)) {
      return errorResponse(request.messageId, receivedAt, {
        code: "REQUEST_EXPIRED",
        message: "The request has expired.",
        retryable: false,
      });
    }
    if (endpointOptions.verifier !== undefined) {
      if (request.signature === undefined) {
        return errorResponse(request.messageId, receivedAt, {
          code: "SIGNATURE_REQUIRED",
          message: "The endpoint requires a transport signature.",
          retryable: false,
        });
      }
      const payload = endpointOptions.payloadForVerification?.(request) ?? request.payload;
      if (!(await endpointOptions.verifier.verify(payload, request.signature, {
        messageId: request.messageId,
        operation: request.operation,
        senderId,
        ...(request.recipientId === undefined ? {} : { recipientId: request.recipientId }),
      }))) {
        return errorResponse(request.messageId, receivedAt, {
          code: "INVALID_SIGNATURE",
          message: "The transport signature is invalid.",
          retryable: false,
        });
      }
    }
    const replay = this.claim({ senderId, nonce: request.nonce, ...(request.expiresAt === undefined ? {} : { expiresAt: request.expiresAt }) }, currentMs);
    if (replay === "replay") {
      return errorResponse(request.messageId, receivedAt, {
        code: "NONCE_REPLAY",
        message: "The transport nonce has already been used.",
        retryable: false,
      });
    }

    const handlerResult = handler(request);
    return this.withBudget(handlerResult, requestOptions, now, request.messageId, receivedAt);
  }

  private async withBudget(
    operation: Promise<ExpTransportResponse>,
    options: ExpTransportOptions,
    now: () => string,
    messageId: string,
    receivedAt: string,
  ): Promise<ExpTransportResponse> {
    if (options.signal === undefined && options.deadlineAt === undefined) return operation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let removeAbort: (() => void) | undefined;
    const budget = new Promise<ExpTransportResponse>((resolve) => {
      const resolveCancelled = () => resolve(errorResponse(messageId, now(), {
        code: "REQUEST_CANCELLED",
        message: "The in-memory request was cancelled.",
        retryable: false,
      }));
      if (options.signal !== undefined) {
        if (options.signal.aborted) {
          resolveCancelled();
        } else {
          options.signal.addEventListener("abort", resolveCancelled, { once: true });
          removeAbort = () => options.signal?.removeEventListener("abort", resolveCancelled);
        }
      }
      if (options.deadlineAt !== undefined) {
        const delay = Date.parse(options.deadlineAt) - Date.now();
        timer = setTimeout(() => resolve(errorResponse(messageId, now(), {
          code: "DEADLINE_EXCEEDED",
          message: "The in-memory request deadline has elapsed.",
          retryable: true,
        })), Math.max(0, delay));
      }
    });
    try {
      return await Promise.race([operation, budget]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      removeAbort?.();
    }
  }
}

export function createInMemoryTransportPair(
  options: {
    readonly leftId?: string;
    readonly rightId?: string;
    readonly leftHandler?: InMemoryTransportHandler;
    readonly rightHandler?: InMemoryTransportHandler;
    readonly leftOptions?: InMemoryTransportOptions;
    readonly rightOptions?: InMemoryTransportOptions;
  } = {},
): { readonly left: InMemoryTransportEndpoint; readonly right: InMemoryTransportEndpoint } {
  const leftId = options.leftId ?? "in-memory-left";
  const rightId = options.rightId ?? "in-memory-right";
  const hub = new InMemoryTransportHub();
  const defaultHandler: InMemoryTransportHandler = async (request) => ({
    messageId: request.messageId,
    accepted: true,
    receivedAt: new Date().toISOString(),
    payload: request.payload,
  });
  return {
    left: new InMemoryTransportEndpoint(hub, leftId, rightId, options.rightHandler ?? defaultHandler, options.rightOptions),
    right: new InMemoryTransportEndpoint(hub, rightId, leftId, options.leftHandler ?? defaultHandler, options.leftOptions),
  };
}
