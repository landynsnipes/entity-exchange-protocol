/**
 * Module: EXP runtime errors
 * Purpose: Provides stable, transport-neutral error metadata without changing wire records.
 */
import { z } from "zod";

export const expErrorCodeSchema = z.enum([
  "REQUEST_CANCELLED",
  "REQUEST_TIMEOUT",
  "DEADLINE_EXCEEDED",
  "TRANSPORT_FAILURE",
  "INVALID_RESPONSE",
  "REQUEST_REJECTED",
  "INVALID_REQUEST_URL",
  "INSECURE_TRANSPORT",
  "INVALID_REQUEST_SIGNATURE",
  "ORIGIN_MISMATCH",
  "CALLBACK_ORIGIN_MISMATCH",
  "APPROVAL_EXCEEDS_REQUEST",
  "INVALID_PRESENTATION",
  "INVALID_TIMEOUT",
  "INVALID_DEADLINE",
]);

export type ExpErrorCode = z.infer<typeof expErrorCodeSchema>;

export interface ExpErrorOptions {
  readonly retryable?: boolean | undefined;
  readonly status?: number | undefined;
  readonly requestId?: string | undefined;
  readonly retryAfterMs?: number | undefined;
  readonly cause?: unknown;
}

function defaultRetryable(code: ExpErrorCode, status?: number): boolean {
  if (code === "TRANSPORT_FAILURE" || code === "REQUEST_TIMEOUT" || code === "DEADLINE_EXCEEDED") return true;
  if (code !== "REQUEST_REJECTED" || status === undefined) return false;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** A stable local/runtime error; it is not a wire-level protocol record. */
export class ExpError extends Error {
  public readonly code: ExpErrorCode;
  public readonly retryable: boolean;
  public readonly status: number | undefined;
  public readonly requestId: string | undefined;
  public readonly retryAfterMs: number | undefined;

  public constructor(code: ExpErrorCode, message: string, options: ExpErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ExpError";
    this.code = code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.retryAfterMs = options.retryAfterMs;
    this.retryable = options.retryable ?? defaultRetryable(code, options.status);
  }
}

/** Parses a Retry-After header into milliseconds when it is safe to honor. */
export function parseRetryAfter(value: string | undefined, nowMs = Date.now()): number | undefined {
  if (value === undefined) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp) || timestamp <= nowMs) return undefined;
  return timestamp - nowMs;
}
