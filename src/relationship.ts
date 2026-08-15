/**
 * Module: EXP Relationship Profile
 * Purpose: Defines opt-in friendship and romantic discovery without public intimate profiles.
 */
import { z } from "zod";
import { intentSchema } from "./foundation.js";

export const EXP_RELATIONSHIP_PROFILE_ID = "org.entity-exchange.profile.relationship" as const;
export const EXP_RELATIONSHIP_PROFILE_VERSION = "0.1.0-draft.1" as const;

export const relationshipIntentSchema = intentSchema.extend({
  relationshipPurpose: z.enum(["friendship", "romantic_relationship", "activity_partner", "professional_peer"]),
  desiredEntityKinds: z.array(z.literal("person")).min(1),
  identityDisclosure: z.enum(["after_mutual_interest", "after_mutual_approval"]),
  contactDisclosure: z.literal("after_mutual_approval"),
}).superRefine((intent, context) => {
  if (Date.parse(intent.createdAt) >= Date.parse(intent.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "intent expiry must follow creation" });
  }
});

/** Restricts explanations so sealed compatibility cannot reveal intimate values or dealbreakers. */
export const relationshipMatchExplanationSchema = z.object({
  evaluationId: z.string().uuid(),
  summary: z.string().min(1).max(1000),
  sharedPublicThemes: z.array(z.string().min(1).max(200)).default([]),
  sealedCompatibilityCount: z.number().int().min(0),
  sealedConflictCount: z.number().int().min(0),
  missingInformationCount: z.number().int().min(0),
  containsSealedValues: z.literal(false),
});

export type RelationshipIntent = z.infer<typeof relationshipIntentSchema>;
export type RelationshipMatchExplanation = z.infer<typeof relationshipMatchExplanationSchema>;
