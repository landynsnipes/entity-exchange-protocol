/** Tests deterministic purpose-specific projection from one portable person model. */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  entityModelSchema,
  entityViewDefinitionSchema,
  materializeEntityView,
  type EntityModel,
  type EntityView,
} from "./entity-model.js";

const now = "2026-08-07T12:00:00.000Z";
const later = "2026-09-07T12:00:00.000Z";
const fixturePath = resolve(dirname(fileURLToPath(import.meta.url)), "../examples/entity-model/person-model.valid.json");

async function personModel(): Promise<EntityModel> {
  return entityModelSchema.parse(JSON.parse(await readFile(fixturePath, "utf8")) as unknown);
}

function view(model: EntityModel, profileId: string, prefix: string, action: "consented" | "sealed", sequence: string): EntityView {
  const definition = entityViewDefinitionSchema.parse({
    id: `71000000-0000-4000-8000-0000000000${sequence}`,
    profileId,
    purpose: `${profileId}.discovery`,
    rules: [{ namespacePrefix: prefix, action }],
    defaultAction: "omit",
    approvedByPrincipalAt: now,
    expiresAt: later,
  });
  return materializeEntityView({
    model,
    definition,
    viewId: `72000000-0000-4000-8000-0000000000${sequence}`,
    createdAt: now,
    commitmentFor: (attribute) => `commitment:${attribute.id}`,
  });
}

describe("purpose-specific Entity Views", () => {
  it("projects Career, Commerce, Friendship, and Relationship without cross-domain leakage", async () => {
    const model = await personModel();
    const career = view(model, "career", "career", "consented", "01");
    const commerce = view(model, "commerce", "commerce", "consented", "02");
    const friendship = view(model, "friendship", "friendship", "consented", "03");
    const relationship = view(model, "relationship", "relationship", "sealed", "04");

    expect(career.attributes.map((attribute) => attribute.namespace)).toEqual(["career.capability"]);
    expect(commerce.attributes.map((attribute) => attribute.namespace)).toEqual(["commerce.apparel"]);
    expect(friendship.attributes.map((attribute) => attribute.namespace)).toEqual(["friendship.interest"]);
    expect(relationship.attributes.map((attribute) => attribute.namespace)).toEqual(["relationship.goals"]);
    expect(JSON.stringify(relationship)).not.toContain("wantsChildrenWithinYears\":5");
    expect(JSON.stringify([career, commerce, friendship, relationship])).not.toContain("must-not-project");
  });

  it("uses the most-specific rule and defaults every other namespace to omission", async () => {
    const model = await personModel();
    const definition = entityViewDefinitionSchema.parse({
      id: "73000000-0000-4000-8000-000000000001",
      profileId: "relationship",
      purpose: "relationship.discovery",
      rules: [
        { namespacePrefix: "relationship", action: "sealed" },
        { namespacePrefix: "relationship.goals", action: "omit" }
      ],
      defaultAction: "omit",
      approvedByPrincipalAt: now,
      expiresAt: later,
    });
    const result = materializeEntityView({
      model,
      definition,
      viewId: "73000000-0000-4000-8000-000000000002",
      createdAt: now,
      commitmentFor: (attribute) => `commitment:${attribute.id}`,
    });
    expect(result.attributes).toHaveLength(0);
    expect(result.omittedNamespaces).toContain("relationship.goals");
  });
});
