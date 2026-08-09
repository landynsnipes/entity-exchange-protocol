/** Tests model-neutral intent projection and contextual exchange invariants. */
import { describe, expect, it } from "vitest";
import {
  agentAuthorizationSchema,
  contextualEvaluationSchema,
  intentProjectionSchema,
} from "./foundation.js";
import { commerceIntentSchema, productOfferSchema } from "./commerce.js";

const now = "2026-08-07T12:00:00.000Z";
const later = "2026-08-08T12:00:00.000Z";

describe("agent-mediated intent", () => {
  it("requires human approval for disclosure and connection", () => {
    const base = {
      id: "10000000-0000-4000-8000-000000000001",
      principalEntityId: "10000000-0000-4000-8000-000000000002",
      agentEntityId: "10000000-0000-4000-8000-000000000003",
      purposes: ["Find minimal athletic shirts"],
      allowedOperations: ["derive_intent", "discover", "evaluate", "draft_proposal"],
      allowedDisclosureScopes: ["clothing.preferences"],
      prohibitedDisclosureScopes: ["raw_conversation", "contact"],
      grantedAt: now,
      expiresAt: later,
    };
    expect(() => agentAuthorizationSchema.parse({ ...base, requiresHumanApprovalForDisclosure: false, requiresHumanApprovalForConnection: true })).toThrow();
  });

  it("forbids raw conversation content in an intent projection", () => {
    const projection = {
      id: "20000000-0000-4000-8000-000000000001",
      authorizationId: "20000000-0000-4000-8000-000000000002",
      generatedByAgentId: "20000000-0000-4000-8000-000000000003",
      derivationMethod: "agent_assisted",
      sourceContextClass: "private_agent_memory",
      containsRawConversation: true,
      createdAt: now,
      intent: {
        id: "20000000-0000-4000-8000-000000000004",
        principalEntityId: "20000000-0000-4000-8000-000000000005",
        purpose: "Find shirts",
        direction: "seek",
        desiredEntityKinds: ["product"],
        createdAt: now,
        expiresAt: later,
      },
    };
    expect(() => intentProjectionSchema.parse(projection)).toThrow();
  });
});

describe("commerce proves domain neutrality", () => {
  it("validates reciprocal consumer and provider intent", () => {
    const consumerIntent = commerceIntentSchema.parse({
      id: "30000000-0000-4000-8000-000000000001",
      principalEntityId: "30000000-0000-4000-8000-000000000002",
      purpose: "Find clean, comfortable athletic-fit shirts without visible logos",
      direction: "seek",
      desiredEntityKinds: ["product"],
      commercePurpose: "product_discovery",
      criteria: [],
      createdAt: now,
      expiresAt: later,
    });
    const providerIntent = commerceIntentSchema.parse({
      ...consumerIntent,
      id: "30000000-0000-4000-8000-000000000003",
      principalEntityId: "30000000-0000-4000-8000-000000000004",
      purpose: "Reach consenting shoppers seeking minimal athletic apparel",
      direction: "offer",
      desiredEntityKinds: ["consumer_segment"],
      commercePurpose: "provider_audience_discovery",
    });
    expect(consumerIntent.direction).toBe("seek");
    expect(providerIntent.direction).toBe("offer");
  });

  it("keeps an evaluation tied to a purpose and evidence snapshot", () => {
    const result = contextualEvaluationSchema.parse({
      id: "40000000-0000-4000-8000-000000000001",
      subjectEntityId: "40000000-0000-4000-8000-000000000002",
      objectEntityId: "40000000-0000-4000-8000-000000000003",
      intentId: "40000000-0000-4000-8000-000000000004",
      scope: { purpose: "product_discovery", evaluatorPolicyId: "commerce-shirts-v0.1", validAt: now },
      algorithmId: "constraint-evaluator",
      algorithmVersion: "0.1.0",
      score: 92,
      eligible: true,
      confidence: 0.84,
      findings: [],
      evidenceSnapshotHash: "sha256:1234567890abcdef",
      createdAt: now,
      expiresAt: later,
    });
    expect(result.scope.purpose).toBe("product_discovery");
  });

  it("validates a provider offer independently of consumer identity", () => {
    const offer = productOfferSchema.parse({
      profileId: "org.entity-exchange.profile.commerce",
      profileVersion: "0.1.0-draft.1",
      id: "50000000-0000-4000-8000-000000000001",
      providerEntityId: "50000000-0000-4000-8000-000000000002",
      productEntityId: "50000000-0000-4000-8000-000000000003",
      name: "Core performance tee",
      category: "apparel.shirt",
      attributes: { visibleLogo: false, fit: "athletic", comfort: "soft" },
      availability: "available",
      createdAt: now,
    });
    expect(offer.attributes.visibleLogo).toBe(false);
  });
});
