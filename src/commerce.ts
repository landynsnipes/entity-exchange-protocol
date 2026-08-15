/**
 * Module: EXP Commerce Profile
 * Purpose: Proves the neutral EXP foundation across reciprocal consumer and provider intent.
 */
import { z } from "zod";
import { criterionSchema, intentSchema } from "./foundation.js";

export const EXP_COMMERCE_PROFILE_ID = "org.entity-exchange.profile.commerce" as const;
export const EXP_COMMERCE_PROFILE_VERSION = "0.1.0-draft.1" as const;

/** Describes a product offer without prescribing a particular marketplace. */
export const productOfferSchema = z.object({
  profileId: z.literal(EXP_COMMERCE_PROFILE_ID),
  profileVersion: z.literal(EXP_COMMERCE_PROFILE_VERSION),
  id: z.string().uuid(),
  providerEntityId: z.string().uuid(),
  productEntityId: z.string().uuid(),
  name: z.string().min(1).max(240),
  category: z.string().min(1).max(160),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
  capabilityClaims: z.array(criterionSchema).default([]),
  evidenceReferences: z.array(z.string().url()).default([]),
  price: z.object({ amount: z.number().nonnegative(), currency: z.string().length(3) }).optional(),
  availability: z.enum(["available", "limited", "unavailable"]),
  visibility: z.enum(["consented", "public"]).default("public"),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
}).superRefine((offer, context) => {
  if (offer.expiresAt !== undefined && Date.parse(offer.createdAt) >= Date.parse(offer.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "offer expiry must follow creation" });
  }
  if (new Set(offer.evidenceReferences).size !== offer.evidenceReferences.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evidenceReferences"], message: "evidence references must be unique" });
  }
});

/** Narrows a neutral intent to product discovery while retaining the core wire semantics. */
export const commerceIntentSchema = intentSchema.extend({
  commercePurpose: z.enum(["product_discovery", "purchase_consideration", "provider_audience_discovery"]),
  desiredEntityKinds: z.array(z.enum(["product", "consumer_segment"])).min(1),
}).superRefine((intent, context) => {
  if (Date.parse(intent.createdAt) >= Date.parse(intent.expiresAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "intent expiry must follow creation" });
  }
  if (new Set(intent.desiredEntityKinds).size !== intent.desiredEntityKinds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["desiredEntityKinds"], message: "entity kinds must be unique" });
  }
});

export type ProductOffer = z.infer<typeof productOfferSchema>;
export type CommerceIntent = z.infer<typeof commerceIntentSchema>;
