/**
 * Module: EXP canonical JSON
 * Purpose: Produces one deterministic UTF-8 representation for signed EXP payloads.
 *
 * The implementation follows the JSON Canonicalization Scheme (RFC 8785):
 * object keys are ordered by UTF-16 code units and JSON values are emitted
 * without insignificant whitespace.
 */
import { EXP_RESOURCE_LIMITS, assertResourceLimits, ResourceLimitError } from "./resource-limits.js";

export const EXP_CANONICALIZATION = "RFC8785-JCS" as const;

export class CanonicalJsonError extends TypeError {
  public constructor(message: string) {
    super(message);
    this.name = "CanonicalJsonError";
  }
}

function assertWellFormedString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) {
        throw new CanonicalJsonError("Canonical JSON strings must contain well-formed Unicode.");
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new CanonicalJsonError("Canonical JSON strings must contain well-formed Unicode.");
    }
  }
}

function canonicalizeValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    assertWellFormedString(value);
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError("Canonical JSON does not support non-finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeValue(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJsonError("Canonical JSON only supports plain objects.");
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => {
      assertWellFormedString(key);
      return `${JSON.stringify(key)}:${canonicalizeValue(item)}`;
    }).join(",")}}`;
  }
  throw new CanonicalJsonError("Canonical JSON only supports JSON values.");
}

/** Returns the RFC 8785 canonical JSON representation of a JSON-compatible value. */
export function canonicalJson(value: unknown): string {
  assertResourceLimits(value);
  const result = canonicalizeValue(value);
  const byteLength = new TextEncoder().encode(result).byteLength;
  if (byteLength > EXP_RESOURCE_LIMITS.maxPayloadBytes) {
    throw new ResourceLimitError("RESOURCE_PAYLOAD_TOO_LARGE", "The canonical payload exceeds the EXP byte limit.");
  }
  return result;
}

/** Returns UTF-8 RFC 8785 canonical JSON bytes for signing or verification. */
export function canonicalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

/** Returns a shallow record with specified envelope fields removed before signing. */
export function withoutFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const excluded = new Set(fields);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.has(key)));
}

/** Returns canonical bytes after removing one or more signature envelope fields. */
export function signedPayloadBytes(
  value: Record<string, unknown>,
  excludedFields: readonly string[],
): Uint8Array {
  return canonicalJsonBytes(withoutFields(value, excludedFields));
}
