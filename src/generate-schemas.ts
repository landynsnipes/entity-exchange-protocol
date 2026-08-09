/**
 * Module: JSON Schema generator
 * Purpose: Publishes stable machine-readable schemas from the protocol source of truth.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  agentCardSchema,
  consentGrantSchema,
  entityCardSchema,
  evidenceRecordSchema,
  introductionDecisionSchema,
  matchResultSchema,
  opportunityCardSchema,
  organizationCardSchema,
  personCardSchema,
} from "./index.js";
import {
  agentAuthorizationSchema,
  connectionDecisionSchema,
  connectionProposalSchema,
  contextualEvaluationSchema,
  discoveryRequestSchema,
  intentProjectionSchema,
  intentSchema,
} from "./foundation.js";
import { commerceIntentSchema, productOfferSchema } from "./commerce.js";
import {
  catalogDescriptorSchema,
  catalogDiscoveryQuerySchema,
  catalogDiscoveryResponseSchema,
  catalogRegistrationSchema,
  signedCatalogDiscoveryQuerySchema,
} from "./catalog.js";
import {
  entityModelSchema,
  entityViewDefinitionSchema,
  entityViewSchema,
  sealedMatchMaterialSchema,
  standingDiscoveryAuthorizationSchema,
} from "./entity-model.js";
import { relationshipIntentSchema, relationshipMatchExplanationSchema } from "./relationship.js";
import { reciprocalEvaluationSchema } from "./reciprocal.js";
import {
  disclosureReleaseSchema,
  entityStateChangeSchema,
  standingMatchInvalidationSchema,
  standingMatchNotificationSchema,
} from "./standing.js";
import {
  federationOperationSchema,
  nodeAuthorityGrantSchema,
  nodeDescriptorSchema,
  nodeVerificationKeySchema,
  rootTransitionSchema,
} from "./trust.js";
import {
  walletCapabilityProfileSchema,
  walletConnectRequestSchema,
  walletConsentReceiptSchema,
  walletPresentationSchema,
} from "./wallet.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(packageRoot, "generated");

/** Writes each public contract as a stable, reviewable JSON Schema file. */
async function generateSchemas(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  const schemas = {
    "entity-card": entityCardSchema,
    "person-card": personCardSchema,
    "organization-card": organizationCardSchema,
    "opportunity-card": opportunityCardSchema,
    "agent-card": agentCardSchema,
    evidence: evidenceRecordSchema,
    consent: consentGrantSchema,
    intent: intentSchema,
    "agent-authorization": agentAuthorizationSchema,
    "intent-projection": intentProjectionSchema,
    "discovery-request": discoveryRequestSchema,
    "contextual-evaluation": contextualEvaluationSchema,
    "connection-proposal": connectionProposalSchema,
    "catalog-descriptor": catalogDescriptorSchema,
    "catalog-registration": catalogRegistrationSchema,
    "catalog-discovery-query": catalogDiscoveryQuerySchema,
    "catalog-discovery-response": catalogDiscoveryResponseSchema,
    "signed-catalog-discovery-query": signedCatalogDiscoveryQuerySchema,
    "connection-decision": connectionDecisionSchema,
    "commerce-intent": commerceIntentSchema,
    "product-offer": productOfferSchema,
    "entity-model": entityModelSchema,
    "entity-view-definition": entityViewDefinitionSchema,
    "entity-view": entityViewSchema,
    "sealed-match-material": sealedMatchMaterialSchema,
    "standing-discovery-authorization": standingDiscoveryAuthorizationSchema,
    "relationship-intent": relationshipIntentSchema,
    "relationship-match-explanation": relationshipMatchExplanationSchema,
    "reciprocal-evaluation": reciprocalEvaluationSchema,
    "entity-state-change": entityStateChangeSchema,
    "standing-match-notification": standingMatchNotificationSchema,
    "standing-match-invalidation": standingMatchInvalidationSchema,
    "disclosure-release": disclosureReleaseSchema,
    "node-descriptor": nodeDescriptorSchema,
    "node-verification-key": nodeVerificationKeySchema,
    "node-authority-grant": nodeAuthorityGrantSchema,
    "federation-operation": federationOperationSchema,
    "root-transition": rootTransitionSchema,
    "wallet-capability-profile": walletCapabilityProfileSchema,
    "wallet-connect-request": walletConnectRequestSchema,
    "wallet-consent-receipt": walletConsentReceiptSchema,
    "wallet-presentation": walletPresentationSchema,
    match: matchResultSchema,
    "introduction-decision": introductionDecisionSchema,
  };

  for (const [name, schema] of Object.entries(schemas)) {
    const jsonSchema = zodToJsonSchema(schema, { name, target: "jsonSchema7" });
    await writeFile(resolve(outputDirectory, `${name}.schema.json`), `${JSON.stringify(jsonSchema, null, 2)}\n`);
  }
}

await generateSchemas();
