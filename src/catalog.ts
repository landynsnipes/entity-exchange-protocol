/**
 * Module: Federated EXP catalog contracts
 * Purpose: Defines privacy-safe registration and discovery across independently operated catalogs.
 */
import { z } from "zod";
import { signatureReferenceSchema } from "./signing.js";

export const EXP_CATALOG_VERSION = "0.1.0-draft.1" as const;
export { signatureReferenceSchema };

/** Advertises one independently operated discovery catalog. */
export const catalogDescriptorSchema = z.object({
  catalogVersion: z.literal(EXP_CATALOG_VERSION),
  id: z.string().min(1).max(256),
  operatorEntityId: z.string().uuid(),
  endpoint: z.string().url(),
  supportedProfileIds: z.array(z.string().min(1).max(200)).min(1),
  authentication: z.enum(["none", "oauth2", "signed_request"]),
  federation: z.object({
    enabled: z.boolean(),
    maximumHops: z.number().int().min(0).max(5),
    peerCatalogIds: z.array(z.string().min(1).max(256)).default([]),
  }),
  descriptorSignature: signatureReferenceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Registers a discoverable reference, never a private model or sealed matching material.
 * The referenced view remains controlled by its publisher and may expire or be withdrawn.
 */
export const catalogRegistrationSchema = z.object({
  catalogVersion: z.literal(EXP_CATALOG_VERSION),
  id: z.string().uuid(),
  publisherEntityId: z.string().uuid(),
  recordKind: z.enum(["intent", "offer", "entity_view"]),
  recordId: z.string().uuid(),
  profileId: z.string().min(1).max(200),
  purpose: z.string().min(1).max(500),
  entityKinds: z.array(z.string().min(1).max(120)).min(1),
  discoveryTags: z.array(z.string().min(1).max(120)).max(50).default([]),
  dereferenceEndpoint: z.string().url(),
  state: z.enum(["active", "withdrawn", "expired"]),
  provenanceReferences: z.array(z.string().min(1).max(500)).default([]),
  containsIdentity: z.literal(false),
  containsSealedValues: z.literal(false),
  publishedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  withdrawnAt: z.string().datetime().optional(),
  registrationSignature: signatureReferenceSchema,
}).superRefine((registration, context) => {
  if (Date.parse(registration.publishedAt) >= Date.parse(registration.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "registration expiry must follow publication" });
  }
  if (registration.state === "withdrawn" && registration.withdrawnAt === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["withdrawnAt"], message: "withdrawn registrations require withdrawnAt" });
  }
  if (registration.state !== "withdrawn" && registration.withdrawnAt !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["withdrawnAt"], message: "only withdrawn registrations may have withdrawnAt" });
  }
  if (registration.withdrawnAt !== undefined
    && (Date.parse(registration.withdrawnAt) < Date.parse(registration.publishedAt)
      || Date.parse(registration.withdrawnAt) > Date.parse(registration.expiresAt))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["withdrawnAt"], message: "withdrawal must fall within registration lifetime" });
  }
  if (new Set(registration.discoveryTags).size !== registration.discoveryTags.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["discoveryTags"], message: "discovery tags must be unique" });
  }
});

/** Requests bounded discovery from one catalog and, optionally, its peers. */
export const catalogDiscoveryQuerySchema = z.object({
  id: z.string().uuid(),
  requesterEntityId: z.string().uuid(),
  authorizationId: z.string().uuid(),
  purpose: z.string().min(1).max(500),
  acceptedProfileIds: z.array(z.string().min(1).max(200)).min(1),
  desiredEntityKinds: z.array(z.string().min(1).max(120)).min(1),
  discoveryTags: z.array(z.string().min(1).max(120)).max(50).default([]),
  resultLimit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(1000).optional(),
  federation: z.object({
    allowed: z.boolean().default(false),
    remainingHops: z.number().int().min(0).max(5).default(0),
    visitedCatalogIds: z.array(z.string().min(1).max(256)).max(50).default([]),
  }),
  createdAt: z.string().datetime(),
});

/** Binds a discovery request to its requester, lifetime, nonce, and immutable query payload. */
export const signedCatalogDiscoveryQuerySchema = catalogDiscoveryQuerySchema.extend({
  nonce: z.string().min(16).max(256),
  expiresAt: z.string().datetime(),
  requestSignature: signatureReferenceSchema,
}).superRefine((query, context) => {
  if (Date.parse(query.createdAt) >= Date.parse(query.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "query expiry must follow creation" });
  }
  if (new Set(query.acceptedProfileIds).size !== query.acceptedProfileIds.length
    || new Set(query.desiredEntityKinds).size !== query.desiredEntityKinds.length
    || new Set(query.federation.visitedCatalogIds).size !== query.federation.visitedCatalogIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["federation", "visitedCatalogIds"], message: "query collections must be unique" });
  }
});

/** Returns only enough metadata to request an authorized, purpose-specific view. */
export const catalogCandidateSchema = z.object({
  registrationId: z.string().uuid(),
  sourceCatalogId: z.string().min(1).max(256),
  recordKind: z.enum(["intent", "offer", "entity_view"]),
  recordId: z.string().uuid(),
  profileId: z.string().min(1).max(200),
  purpose: z.string().min(1).max(500),
  entityKinds: z.array(z.string().min(1).max(120)).min(1),
  discoveryTags: z.array(z.string().min(1).max(120)).max(50).default([]),
  dereferenceEndpoint: z.string().url(),
  provenanceReferences: z.array(z.string().min(1).max(500)).default([]),
  containsIdentity: z.literal(false),
  containsSealedValues: z.literal(false),
  expiresAt: z.string().datetime(),
});

/** Preserves partial-federation behavior and traceability without hiding peer failures. */
export const catalogDiscoveryResponseSchema = z.object({
  queryId: z.string().uuid(),
  decisionTraceId: z.string().uuid(),
  servedByCatalogId: z.string().min(1).max(256),
  candidates: z.array(catalogCandidateSchema).max(100),
  consultedCatalogIds: z.array(z.string().min(1).max(256)).max(50),
  nextCursor: z.string().min(1).max(1000).optional(),
  partial: z.boolean(),
  errors: z.array(z.object({
    catalogId: z.string().min(1).max(256),
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(500),
  })).default([]),
  createdAt: z.string().datetime(),
});

export type CatalogDescriptor = z.infer<typeof catalogDescriptorSchema>;
export type CatalogRegistration = z.infer<typeof catalogRegistrationSchema>;
export type CatalogDiscoveryQuery = z.infer<typeof catalogDiscoveryQuerySchema>;
export type CatalogCandidate = z.infer<typeof catalogCandidateSchema>;
export type CatalogDiscoveryResponse = z.infer<typeof catalogDiscoveryResponseSchema>;
export type SignedCatalogDiscoveryQuery = z.infer<typeof signedCatalogDiscoveryQuerySchema>;
