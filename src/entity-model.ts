/**
 * Module: Portable EXP Entity Model
 * Purpose: Produces approved, purpose-specific views without exposing the principal's complete model.
 */
import { z } from "zod";

export const entityAttributeValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.tuple([z.number(), z.number()]),
]);

/** Stores one governed fact or preference in the principal-controlled source model. */
export const entityAttributeSchema = z.object({
  id: z.string().uuid(),
  namespace: z.string().min(1).max(200),
  name: z.string().min(1).max(160),
  value: entityAttributeValueSchema,
  sensitivity: z.enum(["public", "internal", "confidential", "restricted"]),
  sourceKind: z.enum(["principal_declared", "agent_suggested", "credential", "attestation", "imported_record"]),
  confirmationState: z.enum(["confirmed", "unconfirmed", "rejected"]),
  evidenceReferences: z.array(z.string().min(1).max(500)).default([]),
  observedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});

/** Defines the canonical source controlled by an entity rather than an AI provider. */
export const entityModelSchema = z.object({
  id: z.string().uuid(),
  entityId: z.string().uuid(),
  controllerEntityId: z.string().uuid(),
  modelVersion: z.string().min(1).max(100),
  attributes: z.array(entityAttributeSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** Selects how one namespace may appear in a single purpose-specific view. */
export const viewRuleSchema = z.object({
  namespacePrefix: z.string().min(1).max(200),
  action: z.enum(["omit", "consented", "public", "sealed"]),
});

/** Requires explicit principal review before a model can be projected for discovery. */
export const entityViewDefinitionSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().min(1).max(200),
  purpose: z.string().min(1).max(500),
  rules: z.array(viewRuleSchema).min(1),
  defaultAction: z.literal("omit"),
  approvedByPrincipalAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

const disclosedViewAttributeSchema = z.object({
  sourceAttributeId: z.string().uuid(),
  namespace: z.string().min(1).max(200),
  name: z.string().min(1).max(160),
  disclosure: z.enum(["consented", "public"]),
  value: entityAttributeValueSchema,
  evidenceReferences: z.array(z.string().min(1).max(500)).default([]),
});

const sealedViewAttributeSchema = z.object({
  sourceAttributeId: z.string().uuid(),
  namespace: z.string().min(1).max(200),
  name: z.string().min(1).max(160),
  disclosure: z.literal("sealed"),
  valueCommitment: z.string().min(16).max(512),
  evidenceReferences: z.array(z.string().min(1).max(500)).default([]),
});

export const entityViewAttributeSchema = z.union([
  disclosedViewAttributeSchema,
  sealedViewAttributeSchema,
]);

/** Contains only the attributes approved for one profile and purpose. */
export const entityViewSchema = z.object({
  id: z.string().uuid(),
  sourceModelId: z.string().uuid(),
  entityId: z.string().uuid(),
  definitionId: z.string().uuid(),
  profileId: z.string().min(1).max(200),
  purpose: z.string().min(1).max(500),
  attributes: z.array(entityViewAttributeSchema),
  omittedNamespaces: z.array(z.string().min(1).max(200)),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

/** Keeps sealed plaintext outside the portable Entity View wire representation. */
export const sealedMatchMaterialSchema = z.object({
  viewId: z.string().uuid(),
  valuesByCommitment: z.record(entityAttributeValueSchema),
  authorizedMatcherId: z.string().min(1).max(256),
  purpose: z.string().min(1).max(500),
  expiresAt: z.string().datetime(),
});

/** Governs recurring discovery without granting autonomous outreach or connection. */
export const standingDiscoveryAuthorizationSchema = z.object({
  id: z.string().uuid(),
  principalEntityId: z.string().uuid(),
  viewDefinitionId: z.string().uuid(),
  purpose: z.string().min(1).max(500),
  cadence: z.enum(["manual", "daily", "weekly", "monthly"]),
  allowedOperations: z.array(z.enum(["project_view", "discover", "evaluate", "notify"])).min(1),
  prohibitedOperations: z.array(z.enum(["disclose_identity", "contact", "apply", "purchase", "book"])).min(1),
  maximumResultsPerRun: z.number().int().min(1).max(100),
  grantedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
});

export interface MaterializeEntityViewInput {
  model: EntityModel;
  definition: EntityViewDefinition;
  viewId: string;
  createdAt: string;
  commitmentFor: (attribute: EntityAttribute) => string;
}

/** Chooses the most-specific approved rule for one attribute namespace. */
function ruleFor(namespace: string, rules: EntityViewDefinition["rules"]): EntityViewDefinition["rules"][number] | undefined {
  return rules
    .filter((rule) => namespace === rule.namespacePrefix || namespace.startsWith(`${rule.namespacePrefix}.`))
    .sort((left, right) => right.namespacePrefix.length - left.namespacePrefix.length)[0];
}

/** Deterministically projects confirmed attributes and never emits sealed plaintext. */
export function materializeEntityView(input: MaterializeEntityViewInput): EntityView {
  const attributes: EntityView["attributes"] = [];
  const omittedNamespaces = new Set<string>();

  for (const attribute of input.model.attributes) {
    const rule = ruleFor(attribute.namespace, input.definition.rules);
    if (attribute.confirmationState !== "confirmed" || rule === undefined || rule.action === "omit") {
      omittedNamespaces.add(attribute.namespace);
      continue;
    }
    if (rule.action === "sealed") {
      attributes.push({
        sourceAttributeId: attribute.id,
        namespace: attribute.namespace,
        name: attribute.name,
        disclosure: "sealed",
        valueCommitment: input.commitmentFor(attribute),
        evidenceReferences: attribute.evidenceReferences,
      });
      continue;
    }
    attributes.push({
      sourceAttributeId: attribute.id,
      namespace: attribute.namespace,
      name: attribute.name,
      disclosure: rule.action,
      value: attribute.value,
      evidenceReferences: attribute.evidenceReferences,
    });
  }

  return entityViewSchema.parse({
    id: input.viewId,
    sourceModelId: input.model.id,
    entityId: input.model.entityId,
    definitionId: input.definition.id,
    profileId: input.definition.profileId,
    purpose: input.definition.purpose,
    attributes,
    omittedNamespaces: [...omittedNamespaces].sort(),
    createdAt: input.createdAt,
    expiresAt: input.definition.expiresAt,
  });
}

export type EntityAttribute = z.infer<typeof entityAttributeSchema>;
export type EntityModel = z.infer<typeof entityModelSchema>;
export type EntityViewDefinition = z.infer<typeof entityViewDefinitionSchema>;
export type EntityView = z.infer<typeof entityViewSchema>;
export type SealedMatchMaterial = z.infer<typeof sealedMatchMaterialSchema>;
export type StandingDiscoveryAuthorization = z.infer<typeof standingDiscoveryAuthorizationSchema>;
export type EntityAttributeValue = z.infer<typeof entityAttributeValueSchema>;
