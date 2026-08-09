/** Module: Node trust contract tests. Purpose: Proves lifecycle and privacy-safe descriptor validation. */
import { describe, expect, it } from "vitest";
import { EXP_TRUST_VERSION, nodeDescriptorSchema } from "./trust.js";

function descriptor(): Record<string, unknown> {
  return {
    trustVersion: EXP_TRUST_VERSION,
    nodeId: "example-node",
    operatorEntityId: "00000000-0000-4000-8000-000000005001",
    endpoint: "https://node.example",
    sequence: 1,
    keys: [{
      keyId: "did:web:node.example#operational-1",
      algorithm: "Ed25519",
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA000000000000000000000000000000000000000=\n-----END PUBLIC KEY-----",
      purposes: ["transport", "catalog", "state_event"],
      state: "active",
      validFrom: "2026-08-08T00:00:00.000Z",
      expiresAt: "2026-09-08T00:00:00.000Z",
    }],
    authorityGrants: [{
      grantId: "00000000-0000-4000-8000-000000005010",
      issuerEntityId: "00000000-0000-4000-8000-000000005001",
      subjectNodeId: "example-node",
      operations: ["state:announce", "catalog:discover"],
      state: "active",
      validFrom: "2026-08-08T00:00:00.000Z",
      expiresAt: "2026-09-08T00:00:00.000Z",
    }],
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    expiresAt: "2026-08-09T00:00:00.000Z",
    descriptorSignature: {
      algorithm: "EdDSA",
      keyId: "did:web:node.example#root",
      signature: "placeholder-signature",
      signedAt: "2026-08-08T00:00:00.000Z",
    },
  };
}

describe("nodeDescriptorSchema", () => {
  it("accepts bounded operational keys without private material", () => {
    const parsed = nodeDescriptorSchema.parse(descriptor());
    expect(JSON.stringify(parsed)).not.toContain("PRIVATE KEY");
  });

  it("rejects duplicate IDs, invalid lifetimes, and revoked keys without a revocation time", () => {
    const duplicate = descriptor();
    const original = (duplicate.keys as Array<Record<string, unknown>>)[0]!;
    duplicate.keys = [original, { ...original }];
    expect(() => nodeDescriptorSchema.parse(duplicate)).toThrow();

    const invalid = descriptor();
    const key = { ...((invalid.keys as Array<Record<string, unknown>>)[0]), state: "revoked", expiresAt: "2026-07-08T00:00:00.000Z" };
    invalid.keys = [key];
    expect(() => nodeDescriptorSchema.parse(invalid)).toThrow();
  });

  it("rejects authority that is not bound to the descriptor operator and node", () => {
    const invalid = descriptor();
    const grant = { ...((invalid.authorityGrants as Array<Record<string, unknown>>)[0]), subjectNodeId: "another-node" };
    invalid.authorityGrants = [grant];
    expect(() => nodeDescriptorSchema.parse(invalid)).toThrow();
  });
});
