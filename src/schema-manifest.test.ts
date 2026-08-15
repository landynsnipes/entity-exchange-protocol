import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXP_SUPPORTED_VERSIONS } from "./compatibility.js";

interface SchemaManifest {
  readonly manifestVersion: string;
  readonly canonicalization: string;
  readonly supportedVersions: typeof EXP_SUPPORTED_VERSIONS;
  readonly files: Record<string, string>;
}

const schemaDirectory = new URL("../schemas/", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("manifest.json", schemaDirectory), "utf8"),
) as SchemaManifest;

describe("committed schema manifest", () => {
  it("binds every committed schema to its generated content hash", () => {
    expect(manifest.manifestVersion).toBe("0.1.0");
    expect(manifest.canonicalization).toBe("RFC8785-JCS");
    expect(manifest.supportedVersions).toEqual(EXP_SUPPORTED_VERSIONS);

    for (const [fileName, expectedHash] of Object.entries(manifest.files)) {
      const actualHash = createHash("sha256")
        .update(readFileSync(new URL(fileName, schemaDirectory)))
        .digest("hex");
      expect(actualHash, fileName).toBe(expectedHash);
    }
  });
});
