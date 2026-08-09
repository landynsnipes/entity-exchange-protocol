/**
 * Module: EXP node trust contracts
 * Purpose: Defines signed node descriptors, delegated federation authority, and root rollover.
 */
import { z } from "zod";
import { signatureReferenceSchema } from "./catalog.js";

export const EXP_TRUST_VERSION = "0.1.0-draft.2" as const;

export const nodeKeyPurposeSchema = z.enum(["transport", "catalog", "state_event"]);
export const federationOperationSchema = z.enum([
  "state:announce",
  "catalog:discover",
  "record:dereference",
  "proposal:deliver",
  "decision:deliver",
  "release:deliver",
  "invalidation:deliver",
]);

export const nodeVerificationKeySchema = z.object({
  keyId: z.string().min(1).max(500),
  algorithm: z.literal("Ed25519"),
  publicKeyPem: z.string().min(64).max(4096),
  purposes: z.array(nodeKeyPurposeSchema).min(1).max(3),
  state: z.enum(["active", "revoked"]),
  validFrom: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
}).superRefine((key, context) => {
  if (Date.parse(key.expiresAt) <= Date.parse(key.validFrom)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "expiresAt must follow validFrom" });
  }
  if (key.state === "revoked" && key.revokedAt === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revokedAt"], message: "revokedAt is required for revoked keys" });
  }
  if (key.revokedAt && (Date.parse(key.revokedAt) < Date.parse(key.validFrom)
    || Date.parse(key.revokedAt) > Date.parse(key.expiresAt))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revokedAt"], message: "revokedAt must fall within the key lifetime" });
  }
});

/** Root-signed authority delegated by an operator to its online node. */
export const nodeAuthorityGrantSchema = z.object({
  grantId: z.string().uuid(),
  issuerEntityId: z.string().uuid(),
  subjectNodeId: z.string().min(1).max(200),
  operations: z.array(federationOperationSchema).min(1).max(7),
  state: z.enum(["active", "revoked"]),
  validFrom: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
}).superRefine((grant, context) => {
  if (new Set(grant.operations).size !== grant.operations.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["operations"], message: "operations must be unique" });
  }
  if (Date.parse(grant.expiresAt) <= Date.parse(grant.validFrom)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "grant expiry must follow activation" });
  }
  if (grant.state === "revoked" && grant.revokedAt === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revokedAt"], message: "revokedAt is required for revoked grants" });
  }
  if ((grant.state === "active" && grant.revokedAt !== undefined)
    || (grant.revokedAt && (Date.parse(grant.revokedAt) < Date.parse(grant.validFrom)
      || Date.parse(grant.revokedAt) > Date.parse(grant.expiresAt)))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revokedAt"], message: "revocation must match state and fall within the grant lifetime" });
  }
});

/** A dual-signed transition that lets a pinned peer adopt a replacement root without TOFU. */
export const rootTransitionSchema = z.object({
  transitionId: z.string().uuid(),
  nodeId: z.string().min(1).max(200),
  sequence: z.number().int().positive(),
  previousRootKeyId: z.string().min(1).max(500),
  nextRootKeyId: z.string().min(1).max(500),
  nextRootPublicKeyPem: z.string().min(64).max(4096),
  effectiveAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  previousRootSignature: signatureReferenceSchema.extend({ algorithm: z.literal("EdDSA") }),
  nextRootSignature: signatureReferenceSchema.extend({ algorithm: z.literal("EdDSA") }),
}).superRefine((transition, context) => {
  if (transition.previousRootKeyId === transition.nextRootKeyId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["nextRootKeyId"], message: "replacement root must use a new key ID" });
  }
  if (Date.parse(transition.expiresAt) <= Date.parse(transition.effectiveAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "transition expiry must follow activation" });
  }
  if (transition.previousRootSignature.keyId !== transition.previousRootKeyId
    || transition.nextRootSignature.keyId !== transition.nextRootKeyId
    || transition.previousRootSignature.signedAt !== transition.nextRootSignature.signedAt
    || transition.previousRootSignature.signedAt !== transition.effectiveAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["previousRootSignature"], message: "transition signatures must bind both declared roots and one signing time" });
  }
});

/** A root-signed, cacheable description of one independently operated EXP node. */
export const nodeDescriptorSchema = z.object({
  trustVersion: z.literal(EXP_TRUST_VERSION),
  nodeId: z.string().min(1).max(200),
  operatorEntityId: z.string().uuid(),
  endpoint: z.string().url(),
  sequence: z.number().int().nonnegative(),
  keys: z.array(nodeVerificationKeySchema).min(1).max(20),
  authorityGrants: z.array(nodeAuthorityGrantSchema).min(1).max(20),
  rootTransition: rootTransitionSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  descriptorSignature: signatureReferenceSchema.extend({ algorithm: z.literal("EdDSA") }),
}).superRefine((descriptor, context) => {
  if (Date.parse(descriptor.expiresAt) <= Date.parse(descriptor.updatedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "descriptor expiry must follow its update time" });
  }
  if (Date.parse(descriptor.updatedAt) < Date.parse(descriptor.createdAt)
    || descriptor.descriptorSignature.signedAt !== descriptor.updatedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["updatedAt"], message: "descriptor timestamps or signature time are inconsistent" });
  }
  if (new Set(descriptor.keys.map((key) => key.keyId)).size !== descriptor.keys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["keys"], message: "key IDs must be unique" });
  }
  if (new Set(descriptor.authorityGrants.map((grant) => grant.grantId)).size !== descriptor.authorityGrants.length
    || descriptor.authorityGrants.some((grant) => grant.issuerEntityId !== descriptor.operatorEntityId
      || grant.subjectNodeId !== descriptor.nodeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["authorityGrants"], message: "grants must be unique and bind this operator and node" });
  }
  if (descriptor.rootTransition && (descriptor.rootTransition.nodeId !== descriptor.nodeId
    || descriptor.rootTransition.sequence > descriptor.sequence)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["rootTransition", "nodeId"], message: "root transition must bind this node and not exceed descriptor sequence" });
  }
});

export type NodeKeyPurpose = z.infer<typeof nodeKeyPurposeSchema>;
export type FederationOperation = z.infer<typeof federationOperationSchema>;
export type NodeVerificationKey = z.infer<typeof nodeVerificationKeySchema>;
export type NodeAuthorityGrant = z.infer<typeof nodeAuthorityGrantSchema>;
export type RootTransition = z.infer<typeof rootTransitionSchema>;
export type NodeDescriptor = z.infer<typeof nodeDescriptorSchema>;
