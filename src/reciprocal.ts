/**
 * Module: Reciprocal EXP evaluation contracts
 * Purpose: Represents two-sided compatibility without leaking sealed values.
 */
import { z } from "zod";

export const reciprocalFindingSchema = z.object({
  side: z.enum(["subject", "object"]),
  criterionId: z.string().uuid(),
  importance: z.enum(["required", "preferred"]),
  disclosure: z.enum(["private", "consented", "public", "sealed"]),
  status: z.enum(["satisfied", "not_satisfied", "unknown"]),
  rationale: z.string().min(1).max(500),
  evidenceReferences: z.array(z.string().min(1).max(500)).default([]),
  containsSealedValue: z.literal(false),
});

export const reciprocalEvaluationSchema = z.object({
  id: z.string().uuid(),
  decisionTraceId: z.string().uuid(),
  subjectEntityId: z.string().uuid(),
  objectEntityId: z.string().uuid(),
  subjectIntentId: z.string().uuid(),
  objectIntentId: z.string().uuid(),
  purpose: z.string().min(1).max(500),
  algorithmVersion: z.string().min(1).max(100),
  score: z.number().min(0).max(100),
  eligible: z.boolean(),
  confidence: z.number().min(0).max(1),
  findings: z.array(reciprocalFindingSchema),
  sealedCompatibilityCount: z.number().int().min(0),
  sealedConflictCount: z.number().int().min(0),
  missingInformationCount: z.number().int().min(0),
  subjectViewSnapshot: z.string().min(16).max(512),
  objectViewSnapshot: z.string().min(16).max(512),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type ReciprocalFinding = z.infer<typeof reciprocalFindingSchema>;
export type ReciprocalEvaluation = z.infer<typeof reciprocalEvaluationSchema>;
