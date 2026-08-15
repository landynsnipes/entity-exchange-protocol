/**
 * Module: EXP standing-mode contracts
 * Purpose: Defines state-driven discovery, privacy-safe notification, invalidation, and governed disclosure.
 */
import { z } from "zod";
import { signatureReferenceSchema } from "./signing.js";

export const EXP_STANDING_VERSION = "0.1.0-draft.1" as const;

/** Announces a material source-model change without publishing the model or changed values. */
export const entityStateChangeSchema = z.object({
  standingVersion: z.literal(EXP_STANDING_VERSION),
  id: z.string().uuid(),
  entityId: z.string().uuid(),
  sourceModelId: z.string().uuid(),
  previousModelVersion: z.string().min(1).max(100).optional(),
  modelVersion: z.string().min(1).max(100),
  changedNamespaces: z.array(z.string().min(1).max(200)).min(1).max(100),
  occurredAt: z.string().datetime(),
  eventSignature: signatureReferenceSchema,
});

/**
 * Tells a principal that a purpose-specific match exists while withholding the
 * counterparty identity and every sealed input until governed approval.
 */
export const standingMatchNotificationSchema = z.object({
  standingVersion: z.literal(EXP_STANDING_VERSION),
  id: z.string().uuid(),
  authorizationId: z.string().uuid(),
  recipientEntityId: z.string().uuid(),
  proposalId: z.string().uuid(),
  purpose: z.string().min(1).max(500),
  counterpartyKind: z.string().min(1).max(120),
  scoreBand: z.enum(["potential", "strong"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(500),
  state: z.enum(["active", "read", "dismissed", "invalidated"]),
  containsIdentity: z.literal(false),
  containsSealedValues: z.literal(false),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  invalidatedAt: z.string().datetime().optional(),
}).strict().superRefine((notification, context) => {
  if (Date.parse(notification.createdAt) >= Date.parse(notification.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "notification expiry must follow creation" });
  }
  if (notification.state === "invalidated" && notification.invalidatedAt === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["invalidatedAt"], message: "invalidated notifications require invalidatedAt" });
  }
  if (notification.state !== "invalidated" && notification.invalidatedAt !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["invalidatedAt"], message: "only invalidated notifications may have invalidatedAt" });
  }
  if (notification.invalidatedAt !== undefined
    && (Date.parse(notification.invalidatedAt) < Date.parse(notification.createdAt)
      || Date.parse(notification.invalidatedAt) > Date.parse(notification.expiresAt))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["invalidatedAt"], message: "invalidation must fall within notification lifetime" });
  }
});

/** Records why a previously valid standing result can no longer progress. */
export const standingMatchInvalidationSchema = z.object({
  standingVersion: z.literal(EXP_STANDING_VERSION),
  id: z.string().uuid(),
  notificationId: z.string().uuid(),
  proposalId: z.string().uuid(),
  reason: z.enum([
    "source_state_changed",
    "view_withdrawn",
    "intent_expired",
    "authorization_revoked",
    "consent_revoked",
  ]),
  invalidatedAt: z.string().datetime(),
});

/** Exists only after both principals independently approve the same scopes. */
export const disclosureReleaseSchema = z.object({
  standingVersion: z.literal(EXP_STANDING_VERSION),
  id: z.string().uuid(),
  proposalId: z.string().uuid(),
  initiatorEntityId: z.string().uuid(),
  counterpartyEntityId: z.string().uuid(),
  releasedScopes: z.array(z.string().min(1).max(200)).min(1),
  decisionIds: z.tuple([z.string().uuid(), z.string().uuid()]),
  releasedAt: z.string().datetime(),
});

export type EntityStateChange = z.infer<typeof entityStateChangeSchema>;
export type StandingMatchNotification = z.infer<typeof standingMatchNotificationSchema>;
export type StandingMatchInvalidation = z.infer<typeof standingMatchInvalidationSchema>;
export type DisclosureRelease = z.infer<typeof disclosureReleaseSchema>;
