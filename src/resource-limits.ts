/**
 * Module: EXP resource limits
 * Purpose: Bounds untrusted values before schema validation, signing, or recursion.
 */

export const EXP_RESOURCE_LIMITS = {
  maxPayloadBytes: 1_048_576,
  maxDepth: 16,
  maxArrayItems: 100,
  maxObjectProperties: 100,
  maxStringCodeUnits: 4_096,
} as const;

export type ResourceLimitCode =
  | "RESOURCE_PAYLOAD_TOO_LARGE"
  | "RESOURCE_NESTING_TOO_DEEP"
  | "RESOURCE_ARRAY_TOO_LARGE"
  | "RESOURCE_STRING_TOO_LARGE"
  | "RESOURCE_OBJECT_TOO_LARGE";

export class ResourceLimitError extends TypeError {
  public constructor(public readonly code: ResourceLimitCode, message: string) {
    super(message);
    this.name = "ResourceLimitError";
  }
}

function walk(value: unknown, depth: number, visited: WeakSet<object>): void {
  if (typeof value === "string") {
    if (value.length > EXP_RESOURCE_LIMITS.maxStringCodeUnits) {
      throw new ResourceLimitError("RESOURCE_STRING_TOO_LARGE", "A string exceeds the EXP resource limit.");
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (depth > EXP_RESOURCE_LIMITS.maxDepth) {
    throw new ResourceLimitError("RESOURCE_NESTING_TOO_DEEP", "The value exceeds the EXP nesting limit.");
  }
  if (visited.has(value)) {
    throw new ResourceLimitError("RESOURCE_NESTING_TOO_DEEP", "Cyclic values are not valid EXP payloads.");
  }
  visited.add(value);
  if (Array.isArray(value)) {
    if (value.length > EXP_RESOURCE_LIMITS.maxArrayItems) {
      throw new ResourceLimitError("RESOURCE_ARRAY_TOO_LARGE", "An array exceeds the EXP item limit.");
    }
    value.forEach((item) => walk(item, depth + 1, visited));
  } else {
    const entries = Object.entries(value);
    if (entries.length > EXP_RESOURCE_LIMITS.maxObjectProperties) {
      throw new ResourceLimitError("RESOURCE_OBJECT_TOO_LARGE", "An object exceeds the EXP property limit.");
    }
    entries.forEach(([key, item]) => {
      walk(key, depth + 1, visited);
      walk(item, depth + 1, visited);
    });
  }
  visited.delete(value);
}

/** Validates structural resource limits before deeper protocol processing. */
export function assertResourceLimits(value: unknown): void {
  walk(value, 0, new WeakSet<object>());
}
