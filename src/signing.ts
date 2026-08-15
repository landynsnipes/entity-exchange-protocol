/**
 * Module: EXP shared signing boundary
 * Purpose: Centralize reusable signature metadata while preserving record-specific envelopes.
 */

import { z } from "zod";
import { signedPayloadBytes } from "./canonical-json.js";

export const signatureReferenceSchema = z.object({
  algorithm: z.string().min(1).max(100),
  keyId: z.string().min(1).max(500),
  signature: z.string().min(16).max(4096),
  signedAt: z.string().datetime(),
});

export type SignatureReference = z.infer<typeof signatureReferenceSchema>;

/**
 * Returns canonical bytes for a signed record after omitting its signature envelope fields.
 *
 * The omitted fields are record-specific because wallet, trust, and delivery records intentionally
 * preserve different v0.1 wire shapes.
 */
export function signedRecordBytes(
  record: Readonly<Record<string, unknown>>,
  omittedFields: readonly string[],
): Uint8Array {
  return signedPayloadBytes(record, omittedFields);
}

export { signedPayloadBytes };
