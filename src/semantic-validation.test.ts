import { describe, expect, it } from "vitest";
import {
  consentGrantSchema,
  entityCardSchema,
} from "./index.js";

const ids = {
  subject: "99000000-0000-4000-8000-000000000001",
  grantee: "99000000-0000-4000-8000-000000000002",
  owner: "99000000-0000-4000-8000-000000000003",
  organization: "99000000-0000-4000-8000-000000000004",
  card: "99000000-0000-4000-8000-000000000005",
  requirement: "99000000-0000-4000-8000-000000000006",
};

describe("EXP semantic validation", () => {
  it("rejects invalid consent lifetimes, duplicate scopes, and self-grants", () => {
    expect(() => consentGrantSchema.parse({
      id: ids.card,
      subjectEntityId: ids.subject,
      granteeEntityId: ids.subject,
      purpose: "test",
      scopes: ["identity", "identity"],
      state: "active",
      grantedAt: "2026-08-10T00:00:00.000Z",
      expiresAt: "2026-08-09T00:00:00.000Z",
    })).toThrow();
  });

  it("rejects reversed compensation ranges and missing currency", () => {
    expect(() => entityCardSchema.parse({
      protocolVersion: "0.1.0",
      profileVersion: "0.1.0",
      id: ids.card,
      entityType: "opportunity",
      owner: { subjectId: ids.owner, organizationId: ids.organization },
      displayName: "Opportunity",
      claims: [],
      endpoints: [],
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
      profile: {
        organizationId: ids.organization,
        title: "Engineer",
        outcomes: ["Build"],
        requirements: [{
          id: ids.requirement,
          name: "TypeScript",
          importance: "required",
        }],
        workMode: "remote",
        compensationMin: 200,
        compensationMax: 100,
      },
    })).toThrow();
  });
});
