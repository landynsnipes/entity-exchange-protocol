/** EXP public conformance runner: black-box JSONL tests for independently authored adapters. */
import { generateKeyPairSync, sign } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const VERSION = "exp-conformance-0.5.0";
const NOW = "2026-08-08T00:00:02.000Z";
const NODE_ID = "conformance-peer";
const OPERATOR_ID = "00000000-0000-4000-8000-000000009001";
const ROOT_KEY_ID = "urn:exp:conformance:root-1";
const NEXT_ROOT_KEY_ID = "urn:exp:conformance:root-2";
const OPERATIONAL_KEY_ID = "urn:exp:conformance:operational-1";
const INITIATOR_ID = "00000000-0000-4000-8000-000000009010";
const COUNTERPARTY_ID = "00000000-0000-4000-8000-000000009011";
const PROPOSAL_ID = "00000000-0000-4000-8000-000000009012";
const OPERATIONS = ["state:announce", "catalog:discover", "record:dereference", "proposal:deliver", "decision:deliver", "release:deliver", "invalidation:deliver"];

function canonical(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite canonical number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  throw new Error("unsupported canonical value");
}
function without(value, keys) { return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))); }
function publicPem(pair) { return pair.publicKey.export({ type: "spki", format: "pem" }).toString(); }
function signature(payload, privateKey) { return sign(null, Buffer.from(payload), privateKey).toString("base64url"); }

function authorityGrant(overrides = {}) {
  return {
    grantId: "00000000-0000-4000-8000-000000009002",
    issuerEntityId: OPERATOR_ID,
    subjectNodeId: NODE_ID,
    operations: [...OPERATIONS],
    state: "active",
    validFrom: "2026-08-07T00:00:00.000Z",
    expiresAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function rootTransition(previousRoot, nextRoot) {
  const base = {
    transitionId: "00000000-0000-4000-8000-000000009003",
    nodeId: NODE_ID,
    sequence: 2,
    previousRootKeyId: ROOT_KEY_ID,
    nextRootKeyId: NEXT_ROOT_KEY_ID,
    nextRootPublicKeyPem: publicPem(nextRoot),
    effectiveAt: "2026-08-08T00:00:01.000Z",
    expiresAt: "2026-08-10T00:00:00.000Z",
    previousRootSignature: { algorithm: "EdDSA", keyId: ROOT_KEY_ID, signature: "placeholder-signature", signedAt: "2026-08-08T00:00:01.000Z" },
    nextRootSignature: { algorithm: "EdDSA", keyId: NEXT_ROOT_KEY_ID, signature: "placeholder-signature", signedAt: "2026-08-08T00:00:01.000Z" },
  };
  const payload = canonical(without(base, ["previousRootSignature", "nextRootSignature"]));
  return {
    ...base,
    previousRootSignature: { ...base.previousRootSignature, signature: signature(payload, previousRoot.privateKey) },
    nextRootSignature: { ...base.nextRootSignature, signature: signature(payload, nextRoot.privateKey) },
  };
}

function descriptor(root, operational, { grant = authorityGrant(), sequence = 1, transition, rootKeyId = ROOT_KEY_ID, endpoint = "https://peer.example" } = {}) {
  const base = {
    trustVersion: "0.1.0-draft.2",
    nodeId: NODE_ID,
    operatorEntityId: OPERATOR_ID,
    endpoint,
    sequence,
    keys: [{
      keyId: OPERATIONAL_KEY_ID,
      algorithm: "Ed25519",
      publicKeyPem: publicPem(operational),
      purposes: ["transport", "catalog", "state_event"],
      state: "active",
      validFrom: "2026-08-07T00:00:00.000Z",
      expiresAt: "2026-08-10T00:00:00.000Z",
    }],
    authorityGrants: [grant],
    ...(transition ? { rootTransition: transition } : {}),
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: sequence === 1 ? "2026-08-08T00:00:00.000Z" : "2026-08-08T00:00:01.000Z",
    expiresAt: "2026-08-10T00:00:00.000Z",
    descriptorSignature: { algorithm: "EdDSA", keyId: rootKeyId, signature: "placeholder-signature", signedAt: sequence === 1 ? "2026-08-08T00:00:00.000Z" : "2026-08-08T00:00:01.000Z" },
  };
  return { ...base, descriptorSignature: { ...base.descriptorSignature, signature: signature(canonical(without(base, ["descriptorSignature"])), root.privateKey) } };
}

function transportHeaders(operational, body, { nonce = "nonce-1", signedAt = NOW } = {}) {
  const headers = { nodeId: NODE_ID, keyId: OPERATIONAL_KEY_ID, nonce, signedAt };
  const payload = canonical({ method: "POST", path: "/v1/catalog/discover", body, nodeId: headers.nodeId, nonce, signedAt });
  return { ...headers, signature: signature(payload, operational.privateKey) };
}

function walletFixture(privateKey, overrides = {}) {
  const request = {
    profileVersion: "0.1.0-draft.1",
    id: "00000000-0000-4000-8000-000000009031",
    requesterEntityId: "00000000-0000-4000-8000-000000009032",
    requesterName: "Conformance App",
    requesterOrigin: "https://app.example",
    callbackUri: "https://app.example/v1/exp/presentations",
    purpose: "commerce.personalization",
    requestedScopes: ["commerce.apparel", "identity.contact"],
    requestedOperations: ["evaluate"],
    prohibitedReuse: ["resale"],
    nonce: "wallet-conformance-nonce-001",
    issuedAt: "2026-08-08T00:00:00.000Z",
    expiresAt: "2026-08-08T00:10:00.000Z",
    signature: { algorithm: "Ed25519", keyId: "app-key", value: "x".repeat(43) },
  };
  const view = {
    id: "00000000-0000-4000-8000-000000009033",
    sourceModelId: "00000000-0000-4000-8000-000000009034",
    entityId: "00000000-0000-4000-8000-000000009035",
    definitionId: "00000000-0000-4000-8000-000000009036",
    profileId: "commerce",
    purpose: request.purpose,
    attributes: [{
      sourceAttributeId: "00000000-0000-4000-8000-000000009037",
      namespace: "commerce.apparel.style",
      name: "style",
      disclosure: "consented",
      value: ["minimal"],
      evidenceReferences: [],
    }],
    omittedNamespaces: ["identity.contact"],
    createdAt: request.issuedAt,
    expiresAt: request.expiresAt,
  };
  return {
    request,
    view,
    principalEntityId: view.entityId,
    approvedScopes: ["commerce.apparel"],
    approvedOperations: ["evaluate"],
    presentationId: "00000000-0000-4000-8000-000000009038",
    consentId: "00000000-0000-4000-8000-000000009039",
    keyId: "conformance-wallet-key",
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    now: request.issuedAt,
    expiresAt: request.expiresAt,
    ...overrides,
  };
}

function anchor(root, allowedOperations = OPERATIONS) {
  return { nodeId: NODE_ID, operatorEntityId: OPERATOR_ID, rootKeyId: ROOT_KEY_ID, rootPublicKeyPem: publicPem(root), descriptorOrigin: "https://peer.example", allowedOperations };
}

function proposal(overrides = {}) {
  return {
    id: PROPOSAL_ID,
    evaluationId: "00000000-0000-4000-8000-000000009013",
    purpose: "Conformance standing connection",
    initiatorEntityId: INITIATOR_ID,
    counterpartyEntityId: COUNTERPARTY_ID,
    requestedDisclosureScopes: ["identity", "contact"],
    state: "proposed",
    createdAt: "2026-08-08T00:00:00.000Z",
    expiresAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function notification(overrides = {}) {
  return {
    standingVersion: "0.1.0-draft.1",
    id: "00000000-0000-4000-8000-000000009014",
    authorizationId: "00000000-0000-4000-8000-000000009015",
    recipientEntityId: COUNTERPARTY_ID,
    proposalId: PROPOSAL_ID,
    purpose: "Conformance standing connection",
    counterpartyKind: "person",
    scoreBand: "strong",
    confidence: 0.9,
    summary: "A privacy-safe reciprocal match is ready for review.",
    state: "active",
    containsIdentity: false,
    containsSealedValues: false,
    createdAt: "2026-08-08T00:00:00.000Z",
    expiresAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function decision(id, actorEntityId, actorSide, approvedDisclosureScopes, proposalId = PROPOSAL_ID, overrides = {}) {
  return { id, proposalId, actorEntityId, actorSide, state: "approved", approvedDisclosureScopes, decidedAt: NOW, ...overrides };
}

function invalidation(proposalId, notificationId, overrides = {}) {
  return {
    standingVersion: "0.1.0-draft.1",
    id: "00000000-0000-4000-8000-000000009020",
    notificationId,
    proposalId,
    reason: "source_state_changed",
    invalidatedAt: NOW,
    ...overrides,
  };
}

class Candidate {
  constructor(command) {
    this.process = spawn(command[0], command.slice(1), { stdio: ["pipe", "pipe", "pipe"] });
    this.pending = new Map();
    this.stderr = "";
    this.process.stderr.on("data", (chunk) => { this.stderr += chunk.toString(); });
    createInterface({ input: this.process.stdout }).on("line", (line) => {
      let response;
      try { response = JSON.parse(line); } catch { return; }
      const pending = this.pending.get(response.id);
      if (pending) { this.pending.delete(response.id); pending.resolve(response); }
    });
  }

  request(command, input) {
    const id = `case-${this.pending.size}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("candidate timeout")); }, 3_000);
      this.pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); } });
      this.process.stdin.write(`${JSON.stringify({ id, command, input })}\n`, (error) => { if (error) reject(error); });
    });
  }

  close() { this.process.stdin.end(); this.process.kill("SIGTERM"); }
}

function parseRunnerArgv(argv) {
  let selectedProfile = "all";
  const command = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--profile") {
      selectedProfile = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith("--profile=")) {
      selectedProfile = argument.slice("--profile=".length);
      continue;
    }
    command.push(argument);
  }
  const aliases = { all: "all", core: "core", http: "transport:http", "transport:http": "transport:http" };
  if (!Object.hasOwn(aliases, selectedProfile)) {
    throw new Error("Unknown conformance profile. Use all, core, or http.");
  }
  return { selectedProfile: aliases[selectedProfile], command };
}

function caseProfile(command) {
  return ["verify_transport", "transport_policy"].includes(command) ? "transport:http" : "core";
}

async function main() {
  const { selectedProfile, command } = parseRunnerArgv(process.argv.slice(2));
  if (command.length === 0) throw new Error("candidate command is required");
  const signingVectors = JSON.parse(readFileSync(new URL("../test-vectors/canonical-signing.json", import.meta.url), "utf8"));
  const coreVectors = JSON.parse(readFileSync(new URL("../test-vectors/core-conformance.json", import.meta.url), "utf8"));
  const oldRoot = generateKeyPairSync("ed25519");
  const nextRoot = generateKeyPairSync("ed25519");
  const operational = generateKeyPairSync("ed25519");
  const wallet = generateKeyPairSync("ed25519");
  const valid = descriptor(oldRoot, operational);
  const transition = rootTransition(oldRoot, nextRoot);
  const rotated = descriptor(nextRoot, operational, { sequence: 2, transition, rootKeyId: NEXT_ROOT_KEY_ID });
  const body = { purpose: "conformance", resultLimit: 5 };
  const headers = transportHeaders(operational, body);
  const walletInput = walletFixture(wallet.privateKey);
  const cases = [
    { name: "descriptor-valid", command: "verify_descriptor_key", input: { descriptor: valid, anchor: anchor(oldRoot), keyId: OPERATIONAL_KEY_ID, purpose: "transport", operation: "state:announce", now: NOW }, expected: { ok: true } },
    { name: "descriptor-tampered", command: "verify_descriptor_key", input: { descriptor: { ...valid, sequence: 9 }, anchor: anchor(oldRoot), keyId: OPERATIONAL_KEY_ID, purpose: "transport", operation: "state:announce", now: NOW }, expected: { ok: false, errorCode: "INVALID_DESCRIPTOR_SIGNATURE" } },
    { name: "descriptor-signature-time-tampered", command: "verify_descriptor_key", input: { descriptor: { ...valid, descriptorSignature: { ...valid.descriptorSignature, signedAt: "2026-08-08T00:00:01.000Z" } }, anchor: anchor(oldRoot), keyId: OPERATIONAL_KEY_ID, purpose: "transport", operation: "state:announce", now: NOW }, expected: { ok: false, errorCode: "INVALID_DESCRIPTOR_TIMESTAMP" } },
    { name: "descriptor-signature-key-tampered", command: "verify_descriptor_key", input: { descriptor: { ...valid, descriptorSignature: { ...valid.descriptorSignature, keyId: "urn:exp:conformance:unknown-root" } }, anchor: anchor(oldRoot), keyId: OPERATIONAL_KEY_ID, purpose: "transport", operation: "state:announce", now: NOW }, expected: { ok: false, errorCode: "INVALID_ROOT_TRANSITION" } },
    { name: "descriptor-origin-scheme-mismatch", command: "verify_descriptor_key", input: { descriptor: descriptor(oldRoot, operational, { endpoint: "http://peer.example" }), anchor: anchor(oldRoot), keyId: OPERATIONAL_KEY_ID, purpose: "transport", operation: "state:announce", now: NOW }, expected: { ok: false, errorCode: "DESCRIPTOR_ORIGIN_MISMATCH" } },
    { name: "operation-locally-denied", command: "verify_descriptor_key", input: { descriptor: valid, anchor: anchor(oldRoot, ["catalog:discover"]), keyId: OPERATIONAL_KEY_ID, purpose: "transport", operation: "state:announce", now: NOW }, expected: { ok: false, errorCode: "OPERATION_NOT_ALLOWED" } },
    { name: "grant-revoked", command: "verify_descriptor_key", input: { descriptor: descriptor(oldRoot, operational, { grant: authorityGrant({ state: "revoked", revokedAt: "2026-08-08T00:00:01.000Z" }) }), anchor: anchor(oldRoot), keyId: OPERATIONAL_KEY_ID, purpose: "transport", operation: "state:announce", now: NOW }, expected: { ok: false, errorCode: "NO_ACTIVE_GRANT" } },
    { name: "grant-expired", command: "verify_descriptor_key", input: { descriptor: descriptor(oldRoot, operational, { grant: authorityGrant({ expiresAt: "2026-08-08T00:00:01.000Z" }) }), anchor: anchor(oldRoot), keyId: OPERATIONAL_KEY_ID, purpose: "transport", operation: "state:announce", now: NOW }, expected: { ok: false, errorCode: "NO_ACTIVE_GRANT" } },
    { name: "root-transition-valid", command: "verify_descriptor_key", input: { descriptor: rotated, anchor: anchor(oldRoot), keyId: OPERATIONAL_KEY_ID, purpose: "transport", operation: "state:announce", now: NOW }, expected: { ok: true } },
    { name: "root-transition-tampered", command: "verify_descriptor_key", input: { descriptor: { ...rotated, rootTransition: { ...transition, nextRootSignature: { ...transition.nextRootSignature, signature: "A".repeat(86) } } }, anchor: anchor(oldRoot), keyId: OPERATIONAL_KEY_ID, purpose: "transport", operation: "state:announce", now: NOW }, expected: { ok: false, errorCode: "INVALID_ROOT_TRANSITION" } },
    { name: "root-transition-previous-signature-tampered", command: "verify_descriptor_key", input: { descriptor: { ...rotated, rootTransition: { ...transition, previousRootSignature: { ...transition.previousRootSignature, signature: "A".repeat(86) } } }, anchor: anchor(oldRoot), keyId: OPERATIONAL_KEY_ID, purpose: "transport", operation: "state:announce", now: NOW }, expected: { ok: false, errorCode: "INVALID_ROOT_TRANSITION" } },
    { name: "transport-valid", command: "verify_transport", input: { method: "POST", path: "/v1/catalog/discover", body, headers, publicKeyPem: publicPem(operational), now: NOW }, expected: { ok: true } },
    { name: "transport-replay", command: "verify_transport", input: { method: "POST", path: "/v1/catalog/discover", body, headers, publicKeyPem: publicPem(operational), now: NOW }, expected: { ok: false, errorCode: "NONCE_REPLAY" } },
    { name: "transport-body-tampered", command: "verify_transport", input: { method: "POST", path: "/v1/catalog/discover", body: { ...body, resultLimit: 6 }, headers: transportHeaders(operational, body, { nonce: "nonce-2" }), publicKeyPem: publicPem(operational), now: NOW }, expected: { ok: false, errorCode: "INVALID_TRANSPORT_SIGNATURE" } },
    { name: "transport-method-tampered", command: "verify_transport", input: { method: "PUT", path: "/v1/catalog/discover", body, headers: transportHeaders(operational, body, { nonce: "nonce-4" }), publicKeyPem: publicPem(operational), now: NOW }, expected: { ok: false, errorCode: "INVALID_TRANSPORT_SIGNATURE" } },
    { name: "transport-stale", command: "verify_transport", input: { method: "POST", path: "/v1/catalog/discover", body, headers: transportHeaders(operational, body, { nonce: "nonce-3", signedAt: "2026-08-07T00:00:00.000Z" }), publicKeyPem: publicPem(operational), now: NOW }, expected: { ok: false, errorCode: "STALE_TRANSPORT_SIGNATURE" } },
    { name: "https-external", command: "transport_policy", input: { url: "https://peer.example", allowInsecureLoopback: false }, expected: { ok: true } },
    { name: "http-external-denied", command: "transport_policy", input: { url: "http://peer.example", allowInsecureLoopback: true }, expected: { ok: false, errorCode: "INSECURE_TRANSPORT" } },
    { name: "http-loopback-explicit", command: "transport_policy", input: { url: "http://127.0.0.1:4100", allowInsecureLoopback: true }, expected: { ok: true } },
    { name: "wallet-presentation-valid", command: "build_wallet_presentation", input: walletInput, expected: { ok: true }, validate: (result) => result?.presentation?.consent?.approvedScopes?.join(",") === "commerce.apparel" && result?.presentation?.containsRawContext === false },
    { name: "wallet-scope-escalation-rejected", command: "build_wallet_presentation", input: { ...walletInput, approvedScopes: ["health.records"] }, expected: { ok: false, errorCode: "APPROVAL_EXCEEDS_REQUEST" } },
    { name: "wallet-duplicate-scope-rejected", command: "build_wallet_presentation", input: { ...walletInput, approvedScopes: ["commerce.apparel", "commerce.apparel"] }, expected: { ok: false, errorCode: "DUPLICATE_SCOPE" } },
    { name: "standing-proposal-accepted", command: "receive_proposal", input: { proposal: proposal(), notification: notification(), now: NOW }, expected: { ok: true }, validate: (result) => result?.accepted === true && result?.duplicate === false },
    { name: "standing-proposal-duplicate", command: "receive_proposal", input: { proposal: proposal(), notification: notification(), now: NOW }, expected: { ok: true }, validate: (result) => result?.accepted === true && result?.duplicate === true },
    { name: "standing-proposal-notification-conflict", command: "receive_proposal", input: { proposal: proposal(), notification: notification({ summary: "Changed notification" }), now: NOW }, expected: { ok: false, errorCode: "NOTIFICATION_CONFLICT" } },
    { name: "standing-notification-identity-leak", command: "receive_proposal", input: { proposal: proposal(), notification: notification({ containsIdentity: true }) }, expected: { ok: false, errorCode: "INVALID_NOTIFICATION_SCHEMA" } },
    { name: "standing-expired-proposal", command: "receive_proposal", input: { proposal: proposal({ id: "00000000-0000-4000-8000-000000009026", expiresAt: NOW }), notification: notification({ id: "00000000-0000-4000-8000-000000009027", proposalId: "00000000-0000-4000-8000-000000009026", expiresAt: NOW }), now: NOW }, expected: { ok: false, errorCode: "PROPOSAL_EXPIRED" } },
    { name: "standing-one-approval-gates-release", command: "record_decision", input: { decision: decision("00000000-0000-4000-8000-000000009016", INITIATOR_ID, "initiator", ["identity", "contact"]), now: NOW }, expected: { ok: true }, validate: (result) => result?.release === null },
    { name: "standing-duplicate-actor-rejected", command: "record_decision", input: { decision: decision("00000000-0000-4000-8000-000000009017", INITIATOR_ID, "initiator", ["identity"]), now: NOW }, expected: { ok: false, errorCode: "DUPLICATE_ACTOR_DECISION" } },
    { name: "standing-nonparticipant-rejected", command: "record_decision", input: { decision: decision("00000000-0000-4000-8000-000000009018", INITIATOR_ID, "counterparty", ["identity"]), now: NOW }, expected: { ok: false, errorCode: "DECISION_ACTOR_MISMATCH" } },
    { name: "standing-dual-approval-intersection", command: "record_decision", input: { decision: decision("00000000-0000-4000-8000-000000009019", COUNTERPARTY_ID, "counterparty", ["identity"]), now: NOW }, expected: { ok: true }, validate: (result) => JSON.stringify(result?.release?.releasedScopes) === JSON.stringify(["identity"]) && result?.release?.decisionIds?.length === 2 },
    { name: "standing-released-proposal-invalidation-rejected", command: "receive_invalidation", input: { invalidation: invalidation(PROPOSAL_ID, notification().id) }, expected: { ok: false, errorCode: "RELEASE_ALREADY_EXISTS" } },
    { name: "standing-second-proposal-accepted", command: "receive_proposal", input: { proposal: proposal({ id: "00000000-0000-4000-8000-000000009021" }), notification: notification({ id: "00000000-0000-4000-8000-000000009022", proposalId: "00000000-0000-4000-8000-000000009021" }), now: NOW }, expected: { ok: true }, validate: (result) => result?.accepted === true },
    { name: "standing-identical-party-binding-rejected", command: "receive_proposal", input: { proposal: proposal({ id: "00000000-0000-4000-8000-000000009031", counterpartyEntityId: INITIATOR_ID }), notification: notification({ id: "00000000-0000-4000-8000-000000009032", proposalId: "00000000-0000-4000-8000-000000009031", recipientEntityId: INITIATOR_ID }), now: NOW }, expected: { ok: false, errorCode: "INVALID_BINDING" } },
    { name: "standing-duplicate-requested-scope-rejected", command: "receive_proposal", input: { proposal: proposal({ id: "00000000-0000-4000-8000-000000009033", requestedDisclosureScopes: ["identity", "identity"] }), notification: notification({ id: "00000000-0000-4000-8000-000000009034", proposalId: "00000000-0000-4000-8000-000000009033" }), now: NOW }, expected: { ok: false, errorCode: "DUPLICATE_SCOPE" } },
    { name: "standing-future-decision-rejected", command: "record_decision", input: { decision: decision("00000000-0000-4000-8000-000000009028", INITIATOR_ID, "initiator", ["identity"], "00000000-0000-4000-8000-000000009021", { decidedAt: "2026-08-08T00:00:03.000Z" }), now: NOW }, expected: { ok: false, errorCode: "DECISION_TIMESTAMP_INVALID" } },
    { name: "standing-disclosure-scope-escalation-rejected", command: "record_decision", input: { decision: decision("00000000-0000-4000-8000-000000009029", INITIATOR_ID, "initiator", ["identity", "private"], "00000000-0000-4000-8000-000000009021"), now: NOW }, expected: { ok: false, errorCode: "DISCLOSURE_SCOPE_EXCEEDS_REQUEST" } },
    { name: "standing-invalidation-binding-rejected", command: "receive_invalidation", input: { invalidation: invalidation("00000000-0000-4000-8000-000000009021", notification().id, { id: "00000000-0000-4000-8000-000000009023" }) }, expected: { ok: false, errorCode: "INVALIDATION_BINDING_MISMATCH" } },
    { name: "standing-future-invalidation-rejected", command: "receive_invalidation", input: { invalidation: invalidation("00000000-0000-4000-8000-000000009021", "00000000-0000-4000-8000-000000009022", { id: "00000000-0000-4000-8000-000000009030", invalidatedAt: "2026-08-08T00:00:03.000Z" }), now: NOW }, expected: { ok: false, errorCode: "INVALIDATION_TIMESTAMP_INVALID" } },
    { name: "standing-active-proposal-invalidated", command: "receive_invalidation", input: { invalidation: invalidation("00000000-0000-4000-8000-000000009021", "00000000-0000-4000-8000-000000009022", { id: "00000000-0000-4000-8000-000000009024" }), now: NOW }, expected: { ok: true }, validate: (result) => result?.accepted === true && result?.duplicate === false },
    { name: "standing-invalidation-duplicate", command: "receive_invalidation", input: { invalidation: invalidation("00000000-0000-4000-8000-000000009021", "00000000-0000-4000-8000-000000009022", { id: "00000000-0000-4000-8000-000000009024" }), now: NOW }, expected: { ok: true }, validate: (result) => result?.accepted === true && result?.duplicate === true },
    { name: "standing-invalidated-proposal-decision-rejected", command: "record_decision", input: { decision: decision("00000000-0000-4000-8000-000000009025", INITIATOR_ID, "initiator", ["identity"], "00000000-0000-4000-8000-000000009021"), now: NOW }, expected: { ok: false, errorCode: "PROPOSAL_INVALIDATED" } },
  ];
  for (const vector of signingVectors.vectors) {
    cases.push({
      name: `canonical-${vector.name}`,
      command: "canonical_json",
      input: { value: vector.value, omittedFields: vector.omittedFields },
      expected: { ok: true },
      validate: (result) => result?.canonicalJson === vector.canonicalJson
        && result?.canonicalUtf8Base64 === vector.canonicalUtf8Base64,
    });
  }
  cases.push({
    name: "resource-oversized-string-rejected",
    command: "canonical_json",
    input: { value: "x".repeat(4_097), omittedFields: [] },
    expected: { ok: false, errorCode: "RESOURCE_STRING_TOO_LARGE" },
  });
  for (const vector of coreVectors.vectors) {
    cases.push({
      name: `core-${vector.name}`,
      command: vector.command,
      input: vector.input,
      expected: vector.expected.errorCode
        ? { ok: false, errorCode: vector.expected.errorCode }
        : { ok: true },
      validate: vector.expected.canonicalJson === undefined
        ? undefined
        : (result) => result?.canonicalJson === vector.expected.canonicalJson
          && result?.canonicalUtf8Base64 === vector.expected.canonicalUtf8Base64,
    });
  }
  const candidate = new Candidate(command);
  const results = [];
  const skippedCases = [];
  try {
    for (const testCase of cases) {
      const profile = testCase.profile ?? caseProfile(testCase.command);
      if (selectedProfile !== "all" && profile !== selectedProfile) {
        skippedCases.push({ name: testCase.name, profile });
        continue;
      }
      const response = await candidate.request(testCase.command, testCase.input);
      const passed = response.ok === testCase.expected.ok
        && (testCase.expected.errorCode === undefined || response.errorCode === testCase.expected.errorCode)
        && (testCase.validate === undefined || testCase.validate(response.result));
      results.push({ name: testCase.name, profile, passed, ...(passed ? {} : { expected: testCase.expected, actual: { ok: response.ok, errorCode: response.errorCode } }) });
    }
  } finally { candidate.close(); }
  const passed = results.filter((item) => item.passed).length;
  const failed = results.filter((item) => !item.passed).length;
  const report = {
    conformanceVersion: VERSION,
    selectedProfile,
    suiteCaseCount: cases.length,
    selectedCount: results.length,
    skippedCount: skippedCases.length,
    candidateExecutable: command[0],
    candidateArgumentCount: command.length - 1,
    total: results.length,
    passed,
    failed,
    cases: results,
    skippedCases,
  };
  process.stderr.write(`Profile: ${selectedProfile}\nPassed: ${passed}/${results.length}\nSkipped/not selected: ${skippedCases.length}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failed > 0) process.exitCode = 1;
}

await main();
