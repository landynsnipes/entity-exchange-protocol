import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hospitalityIntentSchema,
  hospitalityServiceOfferSchema,
  validateHospitalityView,
} from "./hospitality.js";

const examplesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../examples/hospitality");

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(examplesRoot, name), "utf8")) as unknown;
}

const safeView = {
  id: "80000000-0000-4000-8000-000000000201",
  sourceModelId: "80000000-0000-4000-8000-000000000202",
  entityId: "80000000-0000-4000-8000-000000000203",
  definitionId: "80000000-0000-4000-8000-000000000204",
  profileId: "org.entity-exchange.profile.hospitality",
  purpose: "hospitality.menu_and_seating",
  attributes: [{
    sourceAttributeId: "80000000-0000-4000-8000-000000000205",
    namespace: "hospitality.allergy.constraints",
    name: "constraints",
    disclosure: "sealed" as const,
    valueCommitment: "sha256:0123456789abcdef0123456789abcdef",
    evidenceReferences: [],
  }],
  omittedNamespaces: ["identity.contact"],
  createdAt: "2026-08-14T20:00:00.000Z",
  expiresAt: "2026-08-15T20:00:00.000Z",
};

describe("hospitality profile", () => {
  it("accepts the published profile fixtures", async () => {
    expect(hospitalityIntentSchema.parse(await fixture("intent.valid.json")).hospitalityPurpose).toBe("menu_personalization");
    expect(hospitalityServiceOfferSchema.parse(await fixture("service-offer.valid.json")).containsRawHealthData).toBe(false);
    expect(validateHospitalityView(safeView).attributes[0]?.disclosure).toBe("sealed");
  });

  it("rejects plaintext allergy constraints", () => {
    expect(() => validateHospitalityView({
      ...safeView,
      attributes: [{ ...safeView.attributes[0], disclosure: "consented", value: ["peanuts"] }],
    })).toThrow(/sealed/i);
  });

  it("rejects expired hospitality intents and duplicate entity kinds", () => {
    expect(() => hospitalityIntentSchema.parse({
      ...{
        id: "80000000-0000-4000-8000-000000000206",
        principalEntityId: "80000000-0000-4000-8000-000000000207",
        purpose: "hospitality.menu_and_seating",
        direction: "seek",
        criteria: [],
        visibility: "consented",
        createdAt: "2026-08-15T00:00:00.000Z",
        expiresAt: "2026-08-14T00:00:00.000Z",
      },
      profileVersion: "0.1.0-draft.1",
      profileId: "org.entity-exchange.profile.hospitality",
      hospitalityPurpose: "menu_personalization",
      desiredEntityKinds: ["venue", "venue"],
    })).toThrow();
  });
});
