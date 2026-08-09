import { describe, expect, it } from "vitest";
import {
  standardWalletCapabilityProfiles,
  validateWalletPresentation,
  walletCapabilityProfileSchema,
  type WalletConnectRequest,
  type WalletPresentation,
} from "./wallet.js";

const now = "2026-08-09T12:00:00.000Z";
const later = "2026-08-09T12:10:00.000Z";
const signature = { algorithm: "Ed25519" as const, keyId: "key-1", value: "x".repeat(43) };
const request: WalletConnectRequest = {
  profileVersion: "0.1.0-draft.1",
  id: "93000000-0000-4000-8000-000000000001",
  requesterEntityId: "93000000-0000-4000-8000-000000000002",
  requesterName: "Example",
  requesterOrigin: "https://shop.example",
  callbackUri: "https://shop.example/v1/exp/presentations",
  purpose: "commerce.personalization",
  requestedScopes: ["commerce.apparel", "identity.contact"],
  requestedOperations: ["evaluate", "personalize"],
  prohibitedReuse: ["resale"],
  nonce: "single-use-wallet-nonce-0001",
  issuedAt: now,
  expiresAt: later,
  signature,
};
const presentation: WalletPresentation = {
  profileVersion: "0.1.0-draft.1",
  id: "93000000-0000-4000-8000-000000000003",
  requestId: request.id,
  audience: request.requesterOrigin,
  nonce: request.nonce,
  view: {
    id: "93000000-0000-4000-8000-000000000004",
    sourceModelId: "93000000-0000-4000-8000-000000000005",
    entityId: "93000000-0000-4000-8000-000000000006",
    definitionId: "93000000-0000-4000-8000-000000000007",
    profileId: "commerce",
    purpose: request.purpose,
    attributes: [{
      sourceAttributeId: "93000000-0000-4000-8000-000000000008",
      namespace: "commerce.apparel.style",
      name: "style",
      disclosure: "consented",
      value: ["minimal"],
      evidenceReferences: [],
    }],
    omittedNamespaces: ["identity.contact"],
    createdAt: now,
    expiresAt: later,
  },
  consent: {
    id: "93000000-0000-4000-8000-000000000009",
    requestId: request.id,
    principalEntityId: "93000000-0000-4000-8000-000000000006",
    requesterEntityId: request.requesterEntityId,
    purpose: request.purpose,
    approvedScopes: ["commerce.apparel"],
    approvedOperations: ["evaluate"],
    requestNonce: request.nonce,
    decision: "approved",
    containsRawContext: false,
    approvedAt: now,
    expiresAt: later,
  },
  containsRawContext: false,
  issuedAt: now,
  expiresAt: later,
  signature,
};

describe("wallet capability profiles", () => {
  it("does not require browser or mobile wallets to expose inbound federation", () => {
    for (const runtime of ["browser_wallet", "mobile_wallet"] as const) {
      const profile = walletCapabilityProfileSchema.parse(standardWalletCapabilityProfiles[runtime]);
      expect(profile.outboundHttps).toBe(true);
      expect(profile.inboundFederation).toBe(false);
      expect(profile.localApprovalUi).toBe(true);
      expect(profile.delegatedStandingMode).toBe(true);
    }
  });
});

describe("wallet presentation policy", () => {
  it("accepts a purpose-bound view narrowed by the principal", () => {
    expect(validateWalletPresentation(presentation, request, now)).toEqual(presentation);
  });

  it("rejects excess scopes, attributes, operations, expiry, audience, and raw context", () => {
    const cases: unknown[] = [
      { ...presentation, audience: "https://attacker.example" },
      { ...presentation, expiresAt: "2026-08-09T11:59:00.000Z" },
      { ...presentation, containsRawContext: true },
      { ...presentation, consent: { ...presentation.consent, approvedScopes: ["health.records"] } },
      { ...presentation, consent: { ...presentation.consent, approvedOperations: ["draft_proposal"] } },
      { ...presentation, view: { ...presentation.view, attributes: [{ ...presentation.view.attributes[0], namespace: "identity.contact" }] } },
    ];
    for (const candidate of cases) expect(() => validateWalletPresentation(candidate, request, now)).toThrow();
  });
});
