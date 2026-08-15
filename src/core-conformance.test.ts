import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalJsonBytes } from "./canonical-json.js";
import {
  connectionProposalSchema,
  consentGrantSchema,
  nodeAuthorityGrantSchema,
  walletConnectRequestSchema,
} from "./index.js";

interface CoreVector {
  readonly name: string;
  readonly command: string;
  readonly input: { readonly schema?: string; readonly value: unknown; readonly omittedFields?: readonly string[] };
  readonly expected: { readonly ok: boolean; readonly errorCode?: string; readonly canonicalJson?: string; readonly canonicalUtf8Base64?: string };
}

const vectors = JSON.parse(readFileSync(new URL("../test-vectors/core-conformance.json", import.meta.url), "utf8")) as {
  readonly vectors: readonly CoreVector[];
};

const schemas = {
  consent: consentGrantSchema,
  "wallet-connect-request": walletConnectRequestSchema,
  "node-authority-grant": nodeAuthorityGrantSchema,
  "connection-proposal": connectionProposalSchema,
} as const;

describe("transport-neutral core conformance vectors", () => {
  for (const vector of vectors.vectors) {
    it(vector.name, () => {
      if (vector.command === "canonical_json") {
        const value = vector.input.value;
        expect(canonicalJson(value)).toBe(vector.expected.canonicalJson);
        expect(Buffer.from(canonicalJsonBytes(value)).toString("base64")).toBe(vector.expected.canonicalUtf8Base64);
        return;
      }

      const schemaName = vector.input.schema;
      if (schemaName === undefined || !(schemaName in schemas)) {
        throw new Error(`Unknown core vector schema: ${schemaName}`);
      }
      expect(() => schemas[schemaName as keyof typeof schemas].parse(vector.input.value)).toThrow();
    });
  }
});
