import { describe, expect, it } from "vitest";
import { canonicalJsonBytes } from "./canonical-json.js";
import { assertResourceLimits } from "./resource-limits.js";

describe("EXP resource limits", () => {
  it("rejects oversized strings, arrays, objects, and nesting", () => {
    expect(() => assertResourceLimits("x".repeat(4_097))).toThrow(/string/i);
    expect(() => assertResourceLimits(Array.from({ length: 101 }, () => null))).toThrow(/array/i);
    expect(() => assertResourceLimits(Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`key-${index}`, null])))).toThrow(/object/i);

    let nested: unknown = null;
    for (let index = 0; index < 18; index += 1) nested = { nested };
    expect(() => assertResourceLimits(nested)).toThrow(/nesting/i);
  });

  it("applies resource limits before canonical signing", () => {
    expect(() => canonicalJsonBytes({ payload: "x".repeat(4_097) })).toThrow(/string/i);
  });
});
