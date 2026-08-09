/**
 * Module: EXP domain-neutral foundation
 * Purpose: Defines portable intent, authority, discovery, evaluation, and connection contracts.
 */
import { z } from "zod";

/** Identifies the first domain-neutral EXP foundation profile. */
export const EXP_FOUNDATION_VERSION = "0.2.0-draft.1" as const;

/** Prevents implementations from silently treating one evaluation as a universal entity score. */
export const evaluationScopeSchema = z.object({
  purpose: z.string().min(1).max(500),
  evaluatorPolicyId: z.string().min(1).max(256),
  validAt: z.string().datetime(),
  jurisdiction: z.string().min(2).max(120).optional(),
});

/** Represents a domain-neutral criterion without embedding marketplace-specific vocabulary. */
export const criterionSchema = z.object({
  id: z.string().uuid(),
  namespace: z.string().min(1).max(200),
  name: z.string().min(1).max(160),
  operator: z.enum(["equals", "not_equals", "includes", "excludes", "at_least", "at_most", "between"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.tuple([z.number(), z.number()])]),
  importance: z.enum(["required", "preferred"]),
  disclosure: z.enum(["private", "consented", "public", "sealed"]).default("private"),
});

/** Expresses what an entity seeks or offers for one bounded purpose. */
export const intentSchema = z.object({
  id: z.string().uuid(),
  principalEntityId: z.string().uuid(),
  purpose: z.string().min(1).max(500),
  direction: z.enum(["seek", "offer", "exchange"]),
  desiredEntityKinds: z.array(z.string().min(1).max(120)).min(1),
  criteria: z.array(criterionSchema).default([]),
  visibility: z.enum(["private", "consented", "public"]).default("private"),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

/** Limits what an AI agent may derive, disclose, discover, or propose for its principal. */
export const agentAuthorizationSchema = z.object({
  id: z.string().uuid(),
  principalEntityId: z.string().uuid(),
  agentEntityId: z.string().uuid(),
  purposes: z.array(z.string().min(1).max(500)).min(1),
  allowedOperations: z.array(z.enum(["derive_intent", "discover", "evaluate", "draft_proposal"])).min(1),
  allowedDisclosureScopes: z.array(z.string().min(1).max(200)).default([]),
  prohibitedDisclosureScopes: z.array(z.string().min(1).max(200)).default([]),
  requiresHumanApprovalForDisclosure: z.literal(true),
  requiresHumanApprovalForConnection: z.literal(true),
  grantedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
});

/**
 * Carries the minimum structured projection an agent derived from private context.
 * Raw conversations, memory stores, and hidden model state are forbidden from the wire contract.
 */
export const intentProjectionSchema = z.object({
  id: z.string().uuid(),
  intent: intentSchema,
  authorizationId: z.string().uuid(),
  generatedByAgentId: z.string().uuid(),
  derivationMethod: z.enum(["user_authored", "agent_assisted", "system_mapped"]),
  sourceContextClass: z.enum(["user_instruction", "private_agent_memory", "organization_policy", "imported_record"]),
  disclosedAttributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({}),
  omittedSensitiveCategories: z.array(z.string().min(1).max(200)).default([]),
  containsRawConversation: z.literal(false),
  reviewedByPrincipalAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

/** Describes a scoped discovery request that can be served by any conforming gateway. */
export const discoveryRequestSchema = z.object({
  id: z.string().uuid(),
  projection: intentProjectionSchema,
  requestedResultLimit: z.number().int().min(1).max(100).default(20),
  acceptedProfileIds: z.array(z.string().min(1).max(200)).min(1),
  requesterEndpoint: z.string().url().optional(),
  createdAt: z.string().datetime(),
});

/** Explains one purpose-specific criterion result with evidence rather than opaque ranking. */
export const criterionFindingSchema = z.object({
  criterionId: z.string().uuid(),
  status: z.enum(["satisfied", "partially_satisfied", "not_satisfied", "unknown"]),
  score: z.number().min(0).max(1).optional(),
  evidenceReferences: z.array(z.string().min(1).max(500)).default([]),
  rationale: z.string().min(1).max(1000),
});

/** Evaluates two entities only for the declared scope, inputs, and algorithm version. */
export const contextualEvaluationSchema = z.object({
  id: z.string().uuid(),
  subjectEntityId: z.string().uuid(),
  objectEntityId: z.string().uuid(),
  intentId: z.string().uuid(),
  scope: evaluationScopeSchema,
  algorithmId: z.string().min(1).max(200),
  algorithmVersion: z.string().min(1).max(100),
  score: z.number().min(0).max(100).optional(),
  eligible: z.boolean(),
  confidence: z.number().min(0).max(1),
  findings: z.array(criterionFindingSchema),
  hardConstraintFailures: z.array(z.string().min(1).max(500)).default([]),
  missingInformation: z.array(z.string().min(1).max(500)).default([]),
  evidenceSnapshotHash: z.string().min(16).max(256),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

/** Creates a non-binding invitation to continue an exchange; it is never an automatic transaction. */
export const connectionProposalSchema = z.object({
  id: z.string().uuid(),
  evaluationId: z.string().uuid(),
  purpose: z.string().min(1).max(500),
  initiatorEntityId: z.string().uuid(),
  counterpartyEntityId: z.string().uuid(),
  requestedDisclosureScopes: z.array(z.string().min(1).max(200)).default([]),
  state: z.enum(["draft", "proposed", "accepted", "declined", "withdrawn", "expired"]),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

/** Records each party's independent human decision before a governed connection is released. */
export const connectionDecisionSchema = z.object({
  id: z.string().uuid(),
  proposalId: z.string().uuid(),
  actorEntityId: z.string().uuid(),
  actorSide: z.enum(["initiator", "counterparty"]),
  state: z.enum(["approved", "rejected", "withdrawn"]),
  approvedDisclosureScopes: z.array(z.string().min(1).max(200)).default([]),
  reason: z.string().max(1000).optional(),
  decidedAt: z.string().datetime(),
});

export type Intent = z.infer<typeof intentSchema>;
export type AgentAuthorization = z.infer<typeof agentAuthorizationSchema>;
export type IntentProjection = z.infer<typeof intentProjectionSchema>;
export type DiscoveryRequest = z.infer<typeof discoveryRequestSchema>;
export type ContextualEvaluation = z.infer<typeof contextualEvaluationSchema>;
export type ConnectionProposal = z.infer<typeof connectionProposalSchema>;
export type ConnectionDecision = z.infer<typeof connectionDecisionSchema>;
export type Criterion = z.infer<typeof criterionSchema>;
