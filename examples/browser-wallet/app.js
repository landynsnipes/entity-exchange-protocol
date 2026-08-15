import {
  PinnedWebCryptoRequestVerifier,
  createBrowserWalletSdk,
  generateBrowserWalletKey,
  importRequesterPublicKey,
  walletSigningBytes,
} from "/dist/platform-browser.bundle.js";

const serviceOrigin = "https://restaurant.example";
const requesterEntityId = "80000000-0000-4000-8000-000000000002";
const principalEntityId = "80000000-0000-4000-8000-000000000005";
const ids = [
  "80000000-0000-4000-8000-000000000001",
  "80000000-0000-4000-8000-000000000003",
  "80000000-0000-4000-8000-000000000004",
  "80000000-0000-4000-8000-000000000006",
  "80000000-0000-4000-8000-000000000007",
  "80000000-0000-4000-8000-000000000008",
  "80000000-0000-4000-8000-000000000009",
];

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function scopeAllows(scope, namespace) {
  return namespace === scope || namespace.startsWith(`${scope}.`);
}

function uuid() {
  return crypto.randomUUID();
}

async function signedRequesterRequest(issuedAt, expiresAt, privateKey) {
  const unsigned = {
    profileVersion: "0.1.0-draft.1",
    id: ids[0],
    requesterEntityId,
    requesterName: "Restaurant Robot",
    requesterOrigin: serviceOrigin,
    callbackUri: `${serviceOrigin}/v1/exp/presentations`,
    purpose: "hospitality.menu_and_seating",
    requestedScopes: ["hospitality.seating", "hospitality.food", "hospitality.allergy"],
    requestedOperations: ["evaluate", "personalize"],
    prohibitedReuse: ["resale", "cross-venue-profiling", "inference-beyond-purpose"],
    nonce: `restaurant-${crypto.randomUUID()}`,
    issuedAt,
    expiresAt,
    signature: { algorithm: "Ed25519", keyId: "restaurant-requester-key", value: "x".repeat(43) },
  };
  const bytes = walletSigningBytes(unsigned);
  const signature = await crypto.subtle.sign("Ed25519", privateKey, new Uint8Array(bytes));
  return { ...unsigned, signature: { ...unsigned.signature, value: base64Url(new Uint8Array(signature)) } };
}

function viewForScopes(scopes, issuedAt, expiresAt) {
  const attributes = [
    {
      sourceAttributeId: ids[1],
      namespace: "hospitality.seating.preference",
      name: "preference",
      disclosure: "consented",
      value: ["quiet", "booth"],
      evidenceReferences: [],
    },
    {
      sourceAttributeId: ids[2],
      namespace: "hospitality.food.preference",
      name: "preference",
      disclosure: "consented",
      value: ["vegetarian", "low_spice"],
      evidenceReferences: [],
    },
    {
      sourceAttributeId: ids[3],
      namespace: "hospitality.allergy.constraints",
      name: "constraints",
      disclosure: "sealed",
      valueCommitment: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      evidenceReferences: [],
    },
  ].filter((attribute) => scopes.some((scope) => scopeAllows(scope, attribute.namespace)));
  return {
    id: ids[4],
    sourceModelId: ids[5],
    entityId: principalEntityId,
    definitionId: ids[6],
    profileId: "org.entity-exchange.profile.hospitality",
    purpose: "hospitality.menu_and_seating",
    attributes,
    omittedNamespaces: ["identity.contact", "health.private"],
    createdAt: issuedAt,
    expiresAt,
  };
}

async function run() {
  const status = document.querySelector("#status");
  const output = document.querySelector("#output");
  status.textContent = "Generating non-exportable wallet and pinned restaurant key...";
  const requesterKeys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const requesterPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", requesterKeys.publicKey));
  const requesterPublic = await importRequesterPublicKey(requesterPublicRaw);
  const wallet = await generateBrowserWalletKey("browser-demo-wallet");
  const sdk = createBrowserWalletSdk({
    signer: wallet.signer,
    verifier: new PinnedWebCryptoRequestVerifier(new Map([["restaurant-requester-key", requesterPublic]])),
    now: () => new Date().toISOString(),
    createId: uuid,
  });
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const request = await signedRequesterRequest(issuedAt, expiresAt, requesterKeys.privateKey);
  const scopes = [...document.querySelectorAll('input[name="scope"]:checked')].map((input) => input.value);
  if (scopes.length === 0) throw new Error("Approve at least one scope.");
  const presentation = await sdk.createPresentation(
    request,
    viewForScopes(scopes, issuedAt, expiresAt),
    {
      principalEntityId,
      approvedScopes: scopes,
      approvedOperations: ["evaluate", "personalize"],
      expiresAt,
    },
  );
  const robotView = {
    audience: presentation.audience,
    purpose: presentation.consent.purpose,
    scopes: presentation.consent.approvedScopes,
    attributes: presentation.view.attributes,
    containsRawContext: presentation.containsRawContext,
    signatureAlgorithm: presentation.signature.algorithm,
  };
  status.textContent = "Presentation signed and delivered. No source model or plaintext allergy value was sent.";
  output.textContent = JSON.stringify(robotView, null, 2);
}

document.querySelector("#approve").addEventListener("click", async () => {
  try {
    await run();
  } catch (error) {
    document.querySelector("#status").textContent = `Rejected: ${error instanceof Error ? error.message : "unknown error"}`;
  }
});
