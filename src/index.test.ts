/** Tests the public EXP contract and privacy defaults. */
import { describe, expect, it } from "vitest";
import { EXP_PROFILE_VERSION, EXP_PROTOCOL_VERSION, parseEntityCard } from "./index.js";

const now = "2026-08-06T12:00:00.000Z";

/** Builds the smallest valid Person Card used by schema tests. */
function validPersonCard(): unknown {
  return {
    protocolVersion: EXP_PROTOCOL_VERSION,
    profileVersion: EXP_PROFILE_VERSION,
    id: "10000000-0000-4000-8000-000000000001",
    entityType: "person",
    owner: { subjectId: "10000000-0000-4000-8000-000000000002" },
    displayName: "Alex Rivera",
    claims: [],
    endpoints: [],
    createdAt: now,
    updatedAt: now,
    profile: { availability: "open" },
  };
}

describe("Entity Card", () => {
  it("defaults disclosure to private", () => {
    expect(parseEntityCard(validPersonCard()).defaultVisibility).toBe("private");
  });

  it("rejects a forward protocol version", () => {
    const card = { ...(validPersonCard() as Record<string, unknown>), protocolVersion: "1.0.0" };
    expect(() => parseEntityCard(card)).toThrow();
  });

  it("rejects malformed contact data", () => {
    const card = validPersonCard() as Record<string, unknown>;
    card.profile = { contactEmail: "not-an-email" };
    expect(() => parseEntityCard(card)).toThrow();
  });
});
