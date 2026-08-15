import { readFileSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  canonicalJsonBytes,
  signedPayloadBytes,
} from "./canonical-json.js";

interface SigningVector {
  readonly name: string;
  readonly value: Record<string, unknown>;
  readonly omittedFields: readonly string[];
  readonly canonicalJson: string;
  readonly canonicalUtf8Base64: string;
  readonly signatureBase64url: string;
}

interface SigningVectors {
  readonly canonicalization: string;
  readonly algorithm: string;
  readonly publicKeyBase64url: string;
  readonly vectors: readonly SigningVector[];
}

const vectors = JSON.parse(
  readFileSync(new URL("../test-vectors/canonical-signing.json", import.meta.url), "utf8"),
) as SigningVectors;

describe("EXP canonical JSON", () => {
  it("matches every committed cross-language signing vector", () => {
    const publicKey = createPublicKey({
      key: {
        kty: "OKP",
        crv: "Ed25519",
        x: vectors.publicKeyBase64url,
      },
      format: "jwk",
    });

    for (const vector of vectors.vectors) {
      const bytes = signedPayloadBytes(vector.value, vector.omittedFields);
      expect(canonicalJson(Object.fromEntries(
        Object.entries(vector.value).filter(([key]) => !vector.omittedFields.includes(key)),
      ))).toBe(vector.canonicalJson);
      expect(Buffer.from(bytes).toString("base64")).toBe(vector.canonicalUtf8Base64);
      expect(verify(
        null,
        Buffer.from(bytes),
        publicKey,
        Buffer.from(vector.signatureBase64url, "base64url"),
      )).toBe(true);
    }
  });

  it("uses UTF-16 ordering and RFC 8785 number serialization", () => {
    expect(canonicalJson({
      "😀": true,
      "𐐷": "deseret",
      "a": null,
      "number": 1e-7,
      "large": 1e21,
      "negativeZero": -0,
    })).toBe("{\"a\":null,\"large\":1e+21,\"negativeZero\":0,\"number\":1e-7,\"𐐷\":\"deseret\",\"😀\":true}");
  });

  it("rejects values that cannot have portable canonical JSON bytes", () => {
    expect(() => canonicalJsonBytes(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalJsonBytes("\ud800")).toThrow(/well-formed Unicode/);
    expect(() => canonicalJsonBytes({ unsupported: undefined })).toThrow();
  });
});
