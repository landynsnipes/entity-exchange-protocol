/**
 * Module: EXP hospitality profile
 * Purpose: Provides an additive venue/service profile built on generic EXP views and consent.
 */

import { z } from "zod";
import { intentSchema } from "./foundation.js";
import { entityViewSchema, type EntityView } from "./entity-model.js";

export const EXP_HOSPITALITY_PROFILE_VERSION = "0.1.0-draft.1" as const;
export const EXP_HOSPITALITY_PROFILE_ID = "org.entity-exchange.profile.hospitality" as const;

export const hospitalityPurposeSchema = z.enum([
  "seating_discovery",
  "menu_personalization",
  "allergy_safety_screening",
  "reservation_draft",
]);

export const hospitalityEntityKindSchema = z.enum([
  "venue",
  "seating_option",
  "menu_item",
  "hospitality_service",
]);

export const hospitalityNamespaceSchema = z.enum([
  "hospitality.seating.preference",
  "hospitality.food.preference",
  "hospitality.food.exclusion",
  "hospitality.allergy.constraints",
]);

export const hospitalityIntentSchema = intentSchema.extend({
  profileVersion: z.literal(EXP_HOSPITALITY_PROFILE_VERSION),
  profileId: z.literal(EXP_HOSPITALITY_PROFILE_ID),
  hospitalityPurpose: hospitalityPurposeSchema,
  desiredEntityKinds: z.array(hospitalityEntityKindSchema).min(1),
}).superRefine((intent, context) => {
  if (Date.parse(intent.createdAt) >= Date.parse(intent.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "hospitality intent expiry must follow creation" });
  }
  if (new Set(intent.desiredEntityKinds).size !== intent.desiredEntityKinds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["desiredEntityKinds"], message: "hospitality entity kinds must be unique" });
  }
});

export const hospitalityServiceOfferSchema = z.object({
  profileVersion: z.literal(EXP_HOSPITALITY_PROFILE_VERSION),
  profileId: z.literal(EXP_HOSPITALITY_PROFILE_ID),
  id: z.string().uuid(),
  providerEntityId: z.string().uuid(),
  serviceKind: hospitalityEntityKindSchema,
  title: z.string().min(1).max(200),
  purpose: z.string().min(1).max(500),
  capabilities: z.array(z.string().min(1).max(160)).min(1).max(50),
  supportedNamespaces: z.array(hospitalityNamespaceSchema).min(1),
  endpoint: z.string().url(),
  containsIdentity: z.literal(false),
  containsRawHealthData: z.literal(false),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).superRefine((offer, context) => {
  if (Date.parse(offer.createdAt) >= Date.parse(offer.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "hospitality offer expiry must follow creation" });
  }
  if (new Set(offer.capabilities).size !== offer.capabilities.length
    || new Set(offer.supportedNamespaces).size !== offer.supportedNamespaces.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["capabilities"], message: "hospitality offer collections must be unique" });
  }
});

/** Rejects hospitality views that expose allergy constraints as plaintext. */
export function validateHospitalityView(input: unknown): EntityView {
  const view = entityViewSchema.parse(input);
  const allergyAttribute = view.attributes.find((attribute) => attribute.namespace === "hospitality.allergy.constraints"
    || attribute.namespace.startsWith("hospitality.allergy.constraints."));
  if (allergyAttribute !== undefined && allergyAttribute.disclosure !== "sealed") {
    throw new Error("Hospitality allergy constraints must use sealed disclosure.");
  }
  return view;
}

export type HospitalityIntent = z.infer<typeof hospitalityIntentSchema>;
export type HospitalityServiceOffer = z.infer<typeof hospitalityServiceOfferSchema>;
