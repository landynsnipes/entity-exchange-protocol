/**
 * Module: EXP wallet connection contracts
 * Purpose: Defines portable device capabilities and direct, consented application handoff.
 */
import { z } from "zod";
import { entityViewSchema } from "./entity-model.js";

export const EXP_WALLET_PROFILE_VERSION = "0.1.0-draft.1" as const;

export const walletRuntimeSchema = z.enum([
  "full_node",
  "desktop_wallet",
  "mobile_wallet",
  "browser_wallet",
  "delegated_client",
]);

export const walletCapabilityProfileSchema = z.object({
  profileVersion: z.literal(EXP_WALLET_PROFILE_VERSION),
  runtime: walletRuntimeSchema,
  outboundHttps: z.boolean(),
  inboundFederation: z.boolean(),
  durableBackgroundDelivery: z.boolean(),
  secureKeyStorage: z.boolean(),
  localApprovalUi: z.boolean(),
  pushWakeup: z.boolean(),
  delegatedStandingMode: z.boolean(),
});

export const walletSignatureSchema = z.object({
  algorithm: z.literal("Ed25519"),
  keyId: z.string().min(1).max(300),
  value: z.string().min(43).max(512),
});

export const walletConnectRequestSchema = z.object({
  profileVersion: z.literal(EXP_WALLET_PROFILE_VERSION),
  id: z.string().uuid(),
  requesterEntityId: z.string().uuid(),
  requesterName: z.string().min(1).max(200),
  requesterOrigin: z.string().url(),
  callbackUri: z.string().url(),
  purpose: z.string().min(1).max(500),
  requestedScopes: z.array(z.string().min(1).max(200)).min(1),
  requestedOperations: z.array(z.enum(["evaluate", "personalize", "draft_proposal"])).min(1),
  prohibitedReuse: z.array(z.string().min(1).max(300)).min(1),
  nonce: z.string().min(16).max(256),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  signature: walletSignatureSchema,
});

export const walletConsentReceiptSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  principalEntityId: z.string().uuid(),
  requesterEntityId: z.string().uuid(),
  purpose: z.string().min(1).max(500),
  approvedScopes: z.array(z.string().min(1).max(200)).min(1),
  approvedOperations: z.array(z.enum(["evaluate", "personalize", "draft_proposal"])).min(1),
  requestNonce: z.string().min(16).max(256),
  decision: z.literal("approved"),
  containsRawContext: z.literal(false),
  approvedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const walletPresentationSchema = z.object({
  profileVersion: z.literal(EXP_WALLET_PROFILE_VERSION),
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  audience: z.string().url(),
  nonce: z.string().min(16).max(256),
  view: entityViewSchema,
  consent: walletConsentReceiptSchema,
  containsRawContext: z.literal(false),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  signature: walletSignatureSchema,
});

export const standardWalletCapabilityProfiles = {
  full_node: {
    profileVersion: EXP_WALLET_PROFILE_VERSION, runtime: "full_node", outboundHttps: true,
    inboundFederation: true, durableBackgroundDelivery: true, secureKeyStorage: true,
    localApprovalUi: true, pushWakeup: false, delegatedStandingMode: false,
  },
  desktop_wallet: {
    profileVersion: EXP_WALLET_PROFILE_VERSION, runtime: "desktop_wallet", outboundHttps: true,
    inboundFederation: false, durableBackgroundDelivery: true, secureKeyStorage: true,
    localApprovalUi: true, pushWakeup: false, delegatedStandingMode: true,
  },
  mobile_wallet: {
    profileVersion: EXP_WALLET_PROFILE_VERSION, runtime: "mobile_wallet", outboundHttps: true,
    inboundFederation: false, durableBackgroundDelivery: false, secureKeyStorage: true,
    localApprovalUi: true, pushWakeup: true, delegatedStandingMode: true,
  },
  browser_wallet: {
    profileVersion: EXP_WALLET_PROFILE_VERSION, runtime: "browser_wallet", outboundHttps: true,
    inboundFederation: false, durableBackgroundDelivery: false, secureKeyStorage: true,
    localApprovalUi: true, pushWakeup: false, delegatedStandingMode: true,
  },
  delegated_client: {
    profileVersion: EXP_WALLET_PROFILE_VERSION, runtime: "delegated_client", outboundHttps: true,
    inboundFederation: false, durableBackgroundDelivery: false, secureKeyStorage: false,
    localApprovalUi: true, pushWakeup: true, delegatedStandingMode: true,
  },
} as const;

for (const profile of Object.values(standardWalletCapabilityProfiles)) walletCapabilityProfileSchema.parse(profile);

function scopeAllows(scope: string, namespace: string): boolean {
  return namespace === scope || namespace.startsWith(`${scope}.`);
}

/** Enforces request binding, minimization, expiry, and consent independently of signature verification. */
export function validateWalletPresentation(
  input: unknown,
  requestInput: unknown,
  now: string,
): WalletPresentation {
  const request = walletConnectRequestSchema.parse(requestInput);
  const presentation = walletPresentationSchema.parse(input);
  const instant = Date.parse(now);
  if (presentation.requestId !== request.id || presentation.consent.requestId !== request.id)
    throw new Error("Presentation is not bound to the connect request.");
  if (presentation.audience !== request.requesterOrigin) throw new Error("Presentation audience mismatch.");
  if (presentation.nonce !== request.nonce || presentation.consent.requestNonce !== request.nonce)
    throw new Error("Presentation nonce mismatch.");
  if (presentation.consent.requesterEntityId !== request.requesterEntityId)
    throw new Error("Consent requester mismatch.");
  if (presentation.consent.principalEntityId !== presentation.view.entityId)
    throw new Error("Consent principal mismatch.");
  if (presentation.consent.purpose !== request.purpose || presentation.view.purpose !== request.purpose)
    throw new Error("Presentation purpose mismatch.");
  if (Date.parse(request.expiresAt) <= instant || Date.parse(presentation.expiresAt) <= instant || Date.parse(presentation.consent.expiresAt) <= instant)
    throw new Error("Connect request, consent, or presentation has expired.");
  if (Date.parse(presentation.expiresAt) > Date.parse(request.expiresAt) || Date.parse(presentation.expiresAt) > Date.parse(presentation.consent.expiresAt))
    throw new Error("Presentation outlives its request or consent.");
  if (presentation.consent.approvedScopes.some((scope) => !request.requestedScopes.includes(scope)))
    throw new Error("Consent exceeds requested scopes.");
  if (presentation.consent.approvedOperations.some((operation) => !request.requestedOperations.includes(operation)))
    throw new Error("Consent exceeds requested operations.");
  if (presentation.view.attributes.some((attribute) => !presentation.consent.approvedScopes.some((scope) => scopeAllows(scope, attribute.namespace))))
    throw new Error("Entity View exceeds approved scopes.");
  return presentation;
}

export type WalletCapabilityProfile = z.infer<typeof walletCapabilityProfileSchema>;
export type WalletConnectRequest = z.infer<typeof walletConnectRequestSchema>;
export type WalletConsentReceipt = z.infer<typeof walletConsentReceiptSchema>;
export type WalletPresentation = z.infer<typeof walletPresentationSchema>;
