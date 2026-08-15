/**
 * Module: EXP protocol contracts
 * Purpose: Defines the portable Entity Card schemas shared by every implementation.
 */
import { z } from "zod";
import { EXP_PROFILE_VERSION, EXP_PROTOCOL_VERSION } from "./compatibility.js";

/** Defines supported entity types in EXP v0.1. */
export const entityTypeSchema = z.enum(["person", "organization", "opportunity", "agent"]);

/** Defines how broadly a field or claim may be disclosed. */
export const visibilitySchema = z.enum(["private", "consented", "public"]);

/** Defines evidence strength without pretending that every assertion is verified. */
export const verificationLevelSchema = z.enum([
  "self_asserted",
  "linked",
  "attested",
  "credential_verified",
  "demonstrated",
]);

/** Defines the semantic purpose of a claim. */
export const claimKindSchema = z.enum([
  "identity",
  "capability",
  "evidence",
  "intent",
  "preference",
  "constraint",
  "credential",
]);

/** Defines where a record came from and when EXP observed it. */
export const provenanceSchema = z.object({
  sourceType: z.enum(["manual", "github", "credential", "attestation", "system"]),
  sourceUri: z.string().url().optional(),
  sourceId: z.string().min(1).max(256).optional(),
  observedAt: z.string().datetime(),
  importedAt: z.string().datetime().optional(),
});

/** Defines a verification decision and the party responsible for it. */
export const verificationSchema = z.object({
  level: verificationLevelSchema,
  verifier: z.string().min(1).max(256).optional(),
  verifiedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
}).superRefine((verification, context) => {
  if (verification.verifiedAt !== undefined && verification.expiresAt !== undefined
    && Date.parse(verification.verifiedAt) >= Date.parse(verification.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "verifiedAt must precede expiresAt" });
  }
});

/** Stores one bounded assertion about an entity. */
export const claimSchema = z.object({
  id: z.string().uuid(),
  kind: claimKindSchema,
  name: z.string().min(1).max(160),
  canonicalId: z.string().min(1).max(256).optional(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  visibility: visibilitySchema.default("private"),
  evidenceIds: z.array(z.string().uuid()).default([]),
  verification: verificationSchema.default({ level: "self_asserted" }),
  provenance: provenanceSchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
}).superRefine((claim, context) => {
  if (claim.expiresAt !== undefined && Date.parse(claim.issuedAt) >= Date.parse(claim.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "claim expiry must follow issuance" });
  }
  if (new Set(claim.evidenceIds).size !== claim.evidenceIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evidenceIds"], message: "evidence IDs must be unique" });
  }
});

/** Stores evidence separately so multiple claims can cite the same source. */
export const evidenceRecordSchema = z.object({
  id: z.string().uuid(),
  subjectEntityId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  evidenceType: z.enum(["project", "github_repository", "attestation", "credential", "work_sample"]),
  uri: z.string().url().optional(),
  visibility: visibilitySchema.default("private"),
  verification: verificationSchema,
  provenance: provenanceSchema,
  demonstratedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

/** Defines ownership without treating an email address as a stable entity identifier. */
export const ownerSchema = z.object({
  subjectId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
});

/** Defines discoverable endpoints without placing credentials in an Entity Card. */
export const endpointSchema = z.object({
  kind: z.enum(["profile", "agent", "evidence", "contact"]),
  uri: z.string().url(),
  authentication: z.enum(["none", "oauth2", "signed_request"]),
});

/** Defines fields shared by every Entity Card profile. */
export const entityCardBaseSchema = z.object({
  protocolVersion: z.literal(EXP_PROTOCOL_VERSION),
  profileVersion: z.literal(EXP_PROFILE_VERSION),
  id: z.string().uuid(),
  owner: ownerSchema,
  displayName: z.string().min(1).max(200),
  summary: z.string().max(2000).optional(),
  defaultVisibility: visibilitySchema.default("private"),
  claims: z.array(claimSchema).default([]),
  endpoints: z.array(endpointSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** Defines a person represented by EXP. */
export const personCardSchema = entityCardBaseSchema.extend({
  entityType: z.literal("person"),
  profile: z.object({
    contactEmail: z.string().email().optional(),
    locationRegion: z.string().max(120).optional(),
    availability: z.enum(["available", "open", "unavailable"]).optional(),
  }),
});

/** Defines an organization that owns opportunities or agents. */
export const organizationCardSchema = entityCardBaseSchema.extend({
  entityType: z.literal("organization"),
  profile: z.object({
    domains: z.array(z.string().min(1).max(253)).default([]),
    contactEmail: z.string().email().optional(),
  }),
});

/** Defines one capability requirement inside an Opportunity Card. */
export const requirementSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  canonicalId: z.string().min(1).max(256).optional(),
  importance: z.enum(["required", "preferred"]),
  minimumVerification: verificationLevelSchema.default("self_asserted"),
  description: z.string().max(500).optional(),
});

/** Defines a concrete opportunity, initially focused on technology employment. */
export const opportunityCardSchema = entityCardBaseSchema.extend({
  entityType: z.literal("opportunity"),
  profile: z.object({
    organizationId: z.string().uuid(),
    title: z.string().min(1).max(200),
    outcomes: z.array(z.string().min(1).max(500)).min(1),
    requirements: z.array(requirementSchema).min(1),
    locationRegion: z.string().max(120).optional(),
    workMode: z.enum(["remote", "hybrid", "onsite"]),
    compensationMin: z.number().nonnegative().optional(),
    compensationMax: z.number().nonnegative().optional(),
    currency: z.string().length(3).optional(),
  }),
});

/** Defines an agent endpoint and its bounded advertised skills. */
export const agentCardSchema = entityCardBaseSchema.extend({
  entityType: z.literal("agent"),
  profile: z.object({
    agentVersion: z.string().min(1).max(64),
    skills: z.array(z.string().min(1).max(160)).default([]),
    principalEntityId: z.string().uuid(),
  }),
});

/** Validates any supported Entity Card by its discriminator. */
export const entityCardSchema = z.discriminatedUnion("entityType", [
  personCardSchema,
  organizationCardSchema,
  opportunityCardSchema,
  agentCardSchema,
]).superRefine((card, context) => {
  if (Date.parse(card.updatedAt) < Date.parse(card.createdAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["updatedAt"], message: "updatedAt must not precede createdAt" });
  }
  const claimIds = card.claims.map((claim) => claim.id);
  if (new Set(claimIds).size !== claimIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["claims"], message: "claim IDs must be unique" });
  }
  if (card.entityType === "opportunity") {
    const { compensationMin, compensationMax, currency } = card.profile;
    if (compensationMin !== undefined && compensationMax !== undefined && compensationMin > compensationMax) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile", "compensationMax"], message: "compensationMin must not exceed compensationMax" });
    }
    if ((compensationMin !== undefined || compensationMax !== undefined) && currency === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile", "currency"], message: "currency is required with compensation" });
    }
  }
});

/** Defines one purpose-bound and revocable disclosure authorization. */
export const consentGrantSchema = z.object({
  id: z.string().uuid(),
  subjectEntityId: z.string().uuid(),
  granteeEntityId: z.string().uuid(),
  purpose: z.string().min(1).max(500),
  scopes: z.array(z.string().min(1).max(160)).min(1),
  state: z.enum(["active", "revoked", "expired"]),
  grantedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
}).superRefine((consent, context) => {
  if (consent.subjectEntityId === consent.granteeEntityId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["granteeEntityId"], message: "consent grantee must differ from subject" });
  }
  if (Date.parse(consent.grantedAt) >= Date.parse(consent.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "consent expiry must follow grant time" });
  }
  if (new Set(consent.scopes).size !== consent.scopes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scopes"], message: "consent scopes must be unique" });
  }
  if (consent.state === "revoked" && consent.revokedAt === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revokedAt"], message: "revoked consent requires revokedAt" });
  }
  if (consent.revokedAt !== undefined && (Date.parse(consent.revokedAt) < Date.parse(consent.grantedAt)
    || Date.parse(consent.revokedAt) > Date.parse(consent.expiresAt))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revokedAt"], message: "revocation must fall within consent lifetime" });
  }
});

/** Describes how one requirement matched the person's evidence. */
export const requirementFindingSchema = z.object({
  requirementId: z.string().uuid(),
  requirementName: z.string(),
  importance: z.enum(["required", "preferred"]),
  status: z.enum(["strong", "moderate", "limited", "missing"]),
  score: z.number().min(0).max(1),
  claimIds: z.array(z.string().uuid()),
  evidenceIds: z.array(z.string().uuid()),
  rationale: z.string().min(1).max(1000),
});

/** Defines an opportunity-specific result rather than a universal human score. */
export const matchResultSchema = z.object({
  id: z.string().uuid(),
  personEntityId: z.string().uuid(),
  opportunityEntityId: z.string().uuid(),
  decisionTraceId: z.string().uuid(),
  algorithmVersion: z.string().min(1),
  score: z.number().min(0).max(100),
  eligible: z.boolean(),
  confidence: z.number().min(0).max(1),
  findings: z.array(requirementFindingSchema),
  hardConstraintFailures: z.array(z.string()),
  uncertainty: z.array(z.string()),
  explanation: z.string().max(4000).optional(),
  explanationProvider: z.string().max(100).optional(),
  explanationModelVersion: z.string().max(100).optional(),
  explanationPromptVersion: z.string().max(100).optional(),
  createdAt: z.string().datetime(),
});

/** Defines one party's explicit decision about an introduction. */
export const introductionDecisionSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  actorEntityId: z.string().uuid(),
  actorRole: z.enum(["candidate", "employer"]),
  state: z.enum(["pending", "approved", "rejected", "withdrawn", "expired"]),
  reason: z.string().max(1000).optional(),
  decidedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).superRefine((decision, context) => {
  if (Date.parse(decision.decidedAt) >= Date.parse(decision.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "decision expiry must follow decision time" });
  }
});

/** TypeScript type for any EXP Entity Card. */
export type EntityCard = z.infer<typeof entityCardSchema>;
/** TypeScript type for a Person Card. */
export type PersonCard = z.infer<typeof personCardSchema>;
/** TypeScript type for an Organization Card. */
export type OrganizationCard = z.infer<typeof organizationCardSchema>;

export * from "./foundation.js";
export * from "./commerce.js";
export * from "./entity-model.js";
export * from "./relationship.js";
export * from "./reciprocal.js";
export * from "./catalog.js";
export * from "./standing.js";
export * from "./trust.js";
export * from "./wallet.js";
export * from "./wallet-sdk.js";
export * from "./platform-browser.js";
export * from "./canonical-json.js";
export * from "./compatibility.js";
export * from "./errors.js";
export * from "./resource-limits.js";
export * from "./signing.js";
export * from "./transport.js";
export * from "./in-memory-transport.js";
export * from "./hospitality.js";
/** TypeScript type for an Opportunity Card. */
export type OpportunityCard = z.infer<typeof opportunityCardSchema>;
/** TypeScript type for an Agent Card. */
export type AgentCard = z.infer<typeof agentCardSchema>;
/** TypeScript type for one evidence record. */
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;
/** TypeScript type for a consent grant. */
export type ConsentGrant = z.infer<typeof consentGrantSchema>;
/** TypeScript type for a deterministic match result. */
export type MatchResult = z.infer<typeof matchResultSchema>;
/** TypeScript type for one introduction decision. */
export type IntroductionDecision = z.infer<typeof introductionDecisionSchema>;

/** Validates unknown input and returns a typed Entity Card. */
export function parseEntityCard(input: unknown): EntityCard {
  return entityCardSchema.parse(input);
}
