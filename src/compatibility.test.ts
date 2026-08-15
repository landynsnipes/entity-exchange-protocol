import { describe, expect, it } from "vitest";
import {
  EXP_SUPPORTED_VERSIONS,
  assertSupportedVersion,
  negotiateVersion,
  supportsVersion,
  versionCapabilitiesSchema,
} from "./compatibility.js";

describe("EXP version compatibility", () => {
  it("publishes explicit supported versions for every protocol family", () => {
    expect(versionCapabilitiesSchema.parse(EXP_SUPPORTED_VERSIONS)).toEqual(EXP_SUPPORTED_VERSIONS);
    expect(supportsVersion("protocol", "0.1.0")).toBe(true);
    expect(supportsVersion("protocol", "0.2.0")).toBe(false);
    expect(supportsVersion("trust", "0.1.0-draft.2")).toBe(true);
  });

  it("rejects unsupported major and minor versions instead of inferring compatibility", () => {
    expect(() => assertSupportedVersion("protocol", "1.0.0")).toThrow(/Unsupported EXP protocol version/);
    expect(() => assertSupportedVersion("protocol", "0.1.1")).toThrow(/Unsupported EXP protocol version/);
  });

  it("negotiates only an exact shared supported version", () => {
    expect(negotiateVersion("protocol", ["0.1.0", "1.0.0"], ["1.0.0", "0.1.0"])).toBe("0.1.0");
    expect(negotiateVersion("protocol", ["0.2.0"], ["0.2.0"])).toBeUndefined();
    expect(negotiateVersion("trust", ["0.1.0-draft.2"], ["0.1.0-draft.2"])).toBe("0.1.0-draft.2");
  });

  it("rejects duplicate capability versions", () => {
    expect(() => versionCapabilitiesSchema.parse({
      ...EXP_SUPPORTED_VERSIONS,
      protocol: ["0.1.0", "0.1.0"],
    })).toThrow(/unique/);
  });
});
