/**
 * Module: Federated catalog contract tests
 * Purpose: Proves catalog discovery metadata cannot carry identity or sealed plaintext.
 */
import { describe, expect, it } from "vitest";
import {
  EXP_CATALOG_VERSION,
  catalogDiscoveryQuerySchema,
  catalogRegistrationSchema,
} from "./catalog.js";

const registration = {
  catalogVersion: EXP_CATALOG_VERSION,
  id: "00000000-0000-4000-8000-000000000101",
  publisherEntityId: "00000000-0000-4000-8000-000000000102",
  recordKind: "entity_view",
  recordId: "00000000-0000-4000-8000-000000000103",
  profileId: "exp.relationship",
  purpose: "Find a mutually compatible relationship",
  entityKinds: ["person"],
  discoveryTags: ["relationship.romantic", "region.las-vegas"],
  dereferenceEndpoint: "https://example.test/exp/views/103",
  state: "active",
  provenanceReferences: ["urn:exp:attestation:relationship-intent"],
  containsIdentity: false,
  containsSealedValues: false,
  publishedAt: "2026-08-07T12:00:00.000Z",
  expiresAt: "2026-09-07T12:00:00.000Z",
  registrationSignature: {
    algorithm: "EdDSA",
    keyId: "did:web:example.test#catalog-key",
    signature: "signed-registration-value",
    signedAt: "2026-08-07T12:00:00.000Z",
  },
} as const;

describe("catalog registration", () => {
  it("accepts a privacy-safe discoverable reference", () => {
    expect(catalogRegistrationSchema.parse(registration)).toMatchObject({
      containsIdentity: false,
      containsSealedValues: false,
    });
  });

  it("rejects identity or sealed values in the discovery index", () => {
    expect(() => catalogRegistrationSchema.parse({ ...registration, containsIdentity: true })).toThrow();
    expect(() => catalogRegistrationSchema.parse({ ...registration, containsSealedValues: true })).toThrow();
  });
});

describe("federated discovery query", () => {
  it("bounds result size and federation depth", () => {
    const base = {
      id: "00000000-0000-4000-8000-000000000104",
      requesterEntityId: "00000000-0000-4000-8000-000000000105",
      authorizationId: "00000000-0000-4000-8000-000000000106",
      purpose: registration.purpose,
      acceptedProfileIds: [registration.profileId],
      desiredEntityKinds: ["person"],
      createdAt: "2026-08-07T12:01:00.000Z",
    };
    expect(() => catalogDiscoveryQuerySchema.parse({
      ...base,
      resultLimit: 101,
      federation: { allowed: true, remainingHops: 1, visitedCatalogIds: [] },
    })).toThrow();
    expect(() => catalogDiscoveryQuerySchema.parse({
      ...base,
      resultLimit: 20,
      federation: { allowed: true, remainingHops: 6, visitedCatalogIds: [] },
    })).toThrow();
  });
});
