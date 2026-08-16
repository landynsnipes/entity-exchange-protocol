# Entity Exchange Protocol 0.1

## Status

This document describes the public EXP `0.1.0` draft. It is source-available under Apache-2.0 but
is not a stable standard, npm release, or production certification. Implementations should state
which protocol/profile versions and conformance cases they support.

## Purpose

EXP defines how implementations describe discoverable entities and exchange purpose-bound,
permissioned, evidence-backed claims. An entity is represented by an Entity Card. Version 0.1
defines Person, Organization, Opportunity, and Agent profiles.

## Invariants

1. An Entity Card represents an entity; it never transfers ownership or authority over it.
2. Every card identifies its owner, protocol version, profile version, timestamps, and visibility.
3. Claims remain assertions. Evidence and verification metadata describe their support.
4. Private is the default visibility.
5. Consented disclosure states a grantee, purpose, scope, expiry, and revocation state.
6. Match results apply to one person and one opportunity. EXP does not define a universal person score.
7. Model-generated text cannot modify deterministic results, consent, or approval state.
8. Consequential introductions require explicit approval from both participating parties.

## Discovery

Future drafts may define a well-known discovery endpoint. Version 0.1 defines endpoint records but
does not require public indexing, DNS discovery, or unauthenticated agent access.

## Compatibility

Implementations must reject unsupported major protocol or profile versions. Additive compatible
fields may be introduced in later minor drafts only after conformance fixtures are updated.

This release publishes an explicit capability set in `schemas/manifest.json`. Implementations
MUST negotiate an exact shared version from the relevant family; they MUST NOT infer support for
an unlisted minor or major version. For each family (protocol, profile, foundation, catalog,
standing, trust, wallet, commerce, relationship, hospitality), both sides offer an explicit list.
The selected version is the highest version string that appears in both lists. If the
intersection is empty, negotiation MUST fail. Matching major numbers alone are not enough.

The committed `schemas/` directory is the machine-readable source of field shape. Its manifest
includes a SHA-256 hash for every schema. A schema change requires regenerated artifacts,
updated conformance fixtures, and an explicit compatibility review. Language-specific parsers
are reference material; they are not the normative contract.

At the external message boundary, implementations SHOULD validate the raw payload against the
published JSON Schema before application-level parsing or signature verification. Current v0.1
JSON Schemas reject undeclared fields. Implementations MUST NOT treat unknown or stripped fields
as part of a signed or verified payload.

## Canonical signing

EXP signed payloads use the JSON Canonicalization Scheme (RFC 8785), identified by
`RFC8785-JCS`. The canonical representation is UTF-8 JSON with no insignificant whitespace,
object names ordered by UTF-16 code units, and ECMAScript-compatible JSON number serialization.
Implementations MUST reject non-finite numbers, unsupported values, and strings containing
unpaired UTF-16 surrogates before signing. Arrays preserve their declared order; object member
order is not semantically significant before canonicalization.

The canonical payload is the record with its signature envelope removed:

- Wallet connect requests and presentations: remove `signature`.
- Catalog registrations: remove `registrationSignature`.
- Signed catalog discovery queries: remove `requestSignature`.
- Node descriptors: remove `descriptorSignature`.
- Root transitions: remove both `previousRootSignature` and `nextRootSignature`.
- State-change events: remove `eventSignature`.

The current federation transport profile signs a constructed object containing `method`, `path`,
`body`, `nodeId`, `nonce`, and `signedAt`; the HTTP signature headers are not part of that object.
Implementations MUST sign and verify the same canonical bytes and MUST NOT canonicalize an
already encoded JSON string a second time.

The existing v0.1 signature algorithm identifiers remain wire-compatible: wallet and operational
keys use `Ed25519`, while the current trust draft uses `EdDSA` for its Ed25519 root signatures.
Public keys are carried in the encoding required by each existing schema (for example, PEM in
trust descriptors); key encoding is not inferred from the canonical JSON profile. Signature
values use unpadded base64url where the applicable contract specifies a compact signature value.

The committed vectors in `test-vectors/canonical-signing.json` are normative interoperability
fixtures. A change to canonical bytes is a protocol compatibility change and requires a new
canonicalization identifier or a new protocol/profile version; it MUST NOT be silently changed
under `RFC8785-JCS`.

## Transport-neutral delivery

EXP core records are independent of their delivery carrier. A binding MAY carry an EXP record over
HTTP, MCP, NFC/QR rendezvous, WebSocket, a queue, local IPC, or another mechanism. The carrier does
not become part of the core protocol merely because it is convenient for one implementation.

Adapter-level delivery metadata includes message and operation identity, sender and recipient
binding, nonce, lifecycle timestamps, opaque payload bytes, replay handling, trust resolution,
deadlines, and normalized responses. Carrier metadata MUST remain separate from signed EXP input
unless the binding explicitly promotes it into that input. Language package paths are optional
helpers, not the protocol.

Each binding MUST preserve the core authorization properties. It MUST NOT broaden scopes, extend
expiry, reuse a nonce, or treat local proximity, an MCP tool grant, or a transport URL as a
substitute for EXP identity, consent, signature verification, or revocation. Binding-specific
requirements are conformance profiles; they do not change the v0.1 wire records.

MCP is an optional agent-facing binding. It MAY expose EXP resources or operations to an agent, but
MCP does not own wallet approval, audience binding, provenance, or revocation. Future HTTP, MCP,
NFC, and other profiles should add carrier-specific vectors while reusing the transport-neutral
core vectors in `test-vectors/core-conformance.json`.

## Runtime errors, deadlines, and retries

Runtime error handling is intentionally separate from EXP wire records. An implementation MAY
expose `ExpError`-equivalent metadata with a stable code, retryability, HTTP status, request
identifier, and retry-after duration. Implementations MUST NOT add these fields to existing
signed records without a new protocol or transport profile.

The standard runtime categories are:

- `REQUEST_CANCELLED`: the caller explicitly stopped work; never retry automatically.
- `REQUEST_TIMEOUT`: the local transport budget elapsed.
- `DEADLINE_EXCEEDED`: the caller deadline or an applicable record expiry elapsed.
- `TRANSPORT_FAILURE`: the request could not be completed; retry only within the remaining budget.
- `INVALID_RESPONSE`: the peer response was not a valid expected contract; do not retry blindly.
- `REQUEST_REJECTED`: inspect status and policy; `408`, `425`, `429`, and `5xx` may be retryable.

The effective operation budget is the minimum of the caller deadline, local timeout, and any
signed record expiry. Implementations MUST stop work when that budget is exhausted and MUST NOT
retry authorization, schema, signature, replay, conflict, cancellation, or expiry failures.
Retries MUST use fresh transport nonces and preserve the logical operation/event identifier so
the receiver can apply idempotency independently of delivery attempts.

## Semantic validation and resource bounds

Conforming implementations MUST validate semantic relationships in addition to individual field
shapes. This includes timestamp ordering, uniqueness of identifiers and scopes, consent and
authorization lifetime, proposal party binding, and range ordering such as compensation minimum
not exceeding compensation maximum. A payload that fails these relationships MUST be rejected
before it is signed, persisted, or acted upon.

Implementations MUST bound untrusted input before recursive parsing or canonicalization. The
public profile limits a payload to 1 MiB, nesting to 16 levels, arrays and objects to 100
items/properties, and strings to 4,096 UTF-16 code units. Implementations MAY impose narrower
limits. Resource failures SHOULD use stable categories:
`RESOURCE_PAYLOAD_TOO_LARGE`, `RESOURCE_NESTING_TOO_DEEP`, `RESOURCE_ARRAY_TOO_LARGE`,
`RESOURCE_STRING_TOO_LARGE`, and `RESOURCE_OBJECT_TOO_LARGE`.

JSON Schema expresses field-level and representable collection constraints; cross-field semantic
rules remain mandatory application validation because Draft 7 cannot express every binding and
timestamp relationship used by EXP.

The following semantic rules are normative for v0.1 even when a schema would accept the JSON:

- A Consent `subjectEntityId` MUST NOT equal `granteeEntityId`. Reject with `INVALID_BINDING`.
- A Connection Proposal `initiatorEntityId` MUST NOT equal `counterpartyEntityId`. Reject with
  `INVALID_BINDING`.
- Scope arrays (`scopes`, `requestedScopes`, `requestedDisclosureScopes`, `approvedScopes`) MUST
  contain unique values. Reject duplicates with `DUPLICATE_SCOPE`.
- Operation arrays on authority grants MUST contain unique values. Reject duplicates with
  `DUPLICATE_OPERATION`.
- Timestamp fields used as “not after `now`” (`decidedAt`, `invalidatedAt`, and equivalent
  decision times) MUST be less than or equal to the supplied `now`. Future values fail closed.
- Wallet approved scopes and operations MUST be a subset of the request. A wider approval fails
  with `APPROVAL_EXCEEDS_REQUEST`.
- A standing decision’s `approvedDisclosureScopes` MUST be a subset of the proposal’s
  `requestedDisclosureScopes`. A wider set fails with `DISCLOSURE_SCOPE_EXCEEDS_REQUEST`.
- A `StandingMatchNotification` MUST have `containsIdentity` and `containsSealedValues` equal to
  `false`. Otherwise reject with `INVALID_NOTIFICATION_SCHEMA`.
- Dual approval releases only the intersection of independently approved scopes. One approval
  MUST NOT produce a `DisclosureRelease`.
- An invalidation MUST bind the existing notification id and proposal id. A mismatched pair
  fails with `INVALIDATION_BINDING_MISMATCH`.
- After a `DisclosureRelease` exists, invalidation of that proposal MUST fail with
  `RELEASE_ALREADY_EXISTS`.
- After a valid invalidation, new decisions against that proposal MUST fail with
  `PROPOSAL_INVALIDATED`.
- A second decision by the same actor on the same proposal MUST fail with
  `DUPLICATE_ACTOR_DECISION`.
- `actorSide` MUST match the actor’s role on the proposal. Otherwise
  `DECISION_ACTOR_MISMATCH`.
- A proposal whose `expiresAt` is at or before `now` MUST fail with `PROPOSAL_EXPIRED`.
- Replaying an identical proposal/notification pair is idempotent (`accepted` and `duplicate`).
  Changing the notification while keeping the proposal id MUST fail with
  `NOTIFICATION_CONFLICT`.

## Conformance error codes

Implementations that speak the public JSONL adapter MUST use these codes exactly. Nearby
synonyms are not interchangeable.

| Code | When |
| --- | --- |
| `INVALID_BINDING` | Subject equals grantee, or both proposal parties are the same entity |
| `DUPLICATE_SCOPE` | A scope list repeats a value |
| `DUPLICATE_OPERATION` | An operation list repeats a value |
| `INVALID_DESCRIPTOR_SIGNATURE` | Descriptor bytes do not match the pinned root signature |
| `INVALID_DESCRIPTOR_TIMESTAMP` | Descriptor signature time does not match the descriptor’s declared update time |
| `INVALID_ROOT_TRANSITION` | Replacement root or transition signatures/key ids are not acceptable |
| `DESCRIPTOR_ORIGIN_MISMATCH` | Descriptor endpoint origin/scheme does not match the pinned origin |
| `OPERATION_NOT_ALLOWED` | Local policy does not allow the requested operation |
| `NO_ACTIVE_GRANT` | Authority grant is missing, revoked, or expired |
| `NONCE_REPLAY` | Transport nonce was already consumed |
| `INVALID_TRANSPORT_SIGNATURE` | HTTP-shaped signed object does not verify |
| `STALE_TRANSPORT_SIGNATURE` | Transport `signedAt` is outside the accepted freshness window |
| `INSECURE_TRANSPORT` | External HTTP is used without an explicit loopback test mode |
| `APPROVAL_EXCEEDS_REQUEST` | Wallet approval widens requested scopes or operations |
| `NOTIFICATION_CONFLICT` | Same proposal id with a conflicting notification body |
| `INVALID_NOTIFICATION_SCHEMA` | Notification carries identity or sealed values |
| `PROPOSAL_EXPIRED` | Proposal is at or past expiry |
| `DUPLICATE_ACTOR_DECISION` | The same actor already decided |
| `DECISION_ACTOR_MISMATCH` | `actorSide` does not match the actor on the proposal |
| `RELEASE_ALREADY_EXISTS` | Invalidation after a disclosure release |
| `DECISION_TIMESTAMP_INVALID` | Decision time is after `now` |
| `DISCLOSURE_SCOPE_EXCEEDS_REQUEST` | Decision scopes are not a subset of the request |
| `INVALIDATION_BINDING_MISMATCH` | Invalidation notification/proposal pair is wrong |
| `INVALIDATION_TIMESTAMP_INVALID` | Invalidation time is after `now` |
| `PROPOSAL_INVALIDATED` | Decision against an invalidated proposal |
| `RESOURCE_PAYLOAD_TOO_LARGE` | Payload exceeds 1 MiB |
| `RESOURCE_NESTING_TOO_DEEP` | Nesting exceeds 16 levels |
| `RESOURCE_ARRAY_TOO_LARGE` | Array exceeds 100 items |
| `RESOURCE_STRING_TOO_LARGE` | String exceeds 4,096 UTF-16 code units |
| `RESOURCE_OBJECT_TOO_LARGE` | Object exceeds 100 properties |

The transport freshness window used by `STALE_TRANSPORT_SIGNATURE` is **not yet a published
number**. The public stale vector is more than 24 hours old relative to `now`. An implementer
MUST treat that vector as the interoperability fixture and MUST NOT invent a different window
until a later spec revision states an exact duration.

The JSONL commands, input shapes, and stateful standing order are defined in
[`docs/conformance-adapter.md`](docs/conformance-adapter.md).

## Hospitality profile

The additive Hospitality Profile `0.1.0-draft.1` uses the generic foundation, Entity View, and
wallet contracts for venue and service personalization. Its profile identifier is
`org.entity-exchange.profile.hospitality`. Implementations SHOULD scope views to namespaces such
as `hospitality.seating.preference`, `hospitality.food.preference`,
`hospitality.food.exclusion`, and `hospitality.allergy.constraints`.

Allergy constraints MUST NOT be represented as ordinary recommendation text. A hospitality view
MUST use sealed disclosure or an explicitly confirmed safety policy for allergy constraints, and a
recommendation engine MUST NOT infer that a menu item is safe from a preference or incomplete
ingredient record. If safety cannot be established, the service MUST request human review or
decline the recommendation.

## Domain-neutral foundation draft

EXP Foundation `0.2.0-draft.1` generalizes the exchange beyond employment. Career remains the
first reference profile; Commerce is the second conformance profile.

### Intent and reciprocal offers

An Intent states one entity's purpose, direction, desired entity kinds, required criteria,
preferred criteria, visibility, and expiry. Intent can describe seeking, offering, or reciprocal
exchange. Domain vocabulary belongs to versioned profiles rather than the foundation.

### Agent-mediated projection

An AI agent MAY derive an Intent Projection from context it is authorized to use. The projection:

1. MUST identify the principal, agent, authorization, purpose, and expiry.
2. MUST contain only the minimum attributes needed for that purpose.
3. MUST NOT contain raw conversations, hidden model state, or an unrestricted memory export.
4. MUST identify the class of source context and intentionally omitted sensitive categories.
5. MUST require principal approval for consequential disclosure and connection.
6. MUST remain portable across model and gateway providers.

Agent Authorization MUST be purpose-bound, operation-scoped, expiring, and revocable. Deriving an
intent does not authorize disclosure, contact, purchase, application, outreach, or another action.

### Contextual evaluation

Every evaluation binds a subject, object, intent, purpose, evaluator policy, algorithm version,
evidence snapshot, timestamp, confidence, missing information, and expiry. A score, when present,
has meaning only inside that evaluation. EXP does not define a universal entity score.

### Connection lifecycle

Discovery returns candidates; it does not create a relationship. A Connection Proposal is
non-binding. Each participating principal independently approves or rejects it. A gateway may
release only the disclosure scopes approved by all required parties and valid policy.

### Federation

EXP does not require a global registry or a single identity, AI, marketplace, evaluator, or
gateway provider. Implementations may use direct endpoints, trusted registries, organizational
directories, or federated indexes while preserving authorization and provenance.

### Node trust and operational keys

EXP Trust `0.1.0-draft.2` defines a root-signed Node Descriptor. A descriptor binds one node and
operator to an endpoint, monotonic sequence, expiry, and bounded Ed25519 operational keys. Each key
states its activation, expiry, revocation state, and allowed purposes: transport, catalog, or state
event verification.

An implementation MUST validate the descriptor schema, pinned root signature, node identity,
endpoint origin, lifetime, and non-decreasing sequence before accepting an operational key. It MUST
reject keys that are unknown, premature, expired, revoked, or not authorized for the verified purpose.
An unknown operational key MAY trigger one bounded refresh to support overlapping rotation.

An external node or descriptor endpoint MUST use HTTPS. A conforming implementation MAY permit plain
HTTP only for an explicit loopback-only test mode and MUST NOT interpret that mode as production trust.

A federation operation MUST be authorized twice: by the receiving operator's local policy for the
pinned node/operator pair and by an active root-signed `NodeAuthorityGrant` in the peer descriptor.
The grant MUST bind its issuer entity, subject node, allowed operations, validity period, and
revocation state. Either denial MUST fail closed.

Standing invalidation delivery is an independently authorized federation operation. An invalidation
MUST bind one existing notification and proposal, MUST be idempotent by identifier, and MUST NOT
invalidate a proposal that already produced a disclosure release. A conforming implementation MUST
reject new decisions against an invalidated proposal.

Planned root replacement MUST use a `RootTransition` binding the node, old and new root key IDs, new
public key, sequence, activation, and expiry. Both roots MUST sign the same canonical transition.
A resolver MUST NOT accept a descriptor signed by an unpinned replacement root without verifying
both transition signatures and the transition lifetime.

Federation implementations MUST bound request volume, attacker-controlled peer cardinality, descriptor
response size, fetch time, and repeated descriptor failures. The exact distributed enforcement
mechanism is deployment-specific.

The descriptor is public verification metadata. It MUST NOT contain private keys, credentials,
Entity Models, purpose views, identity/contact disclosure, or matching material. The draft does not
mandate one global certificate authority, DID method, registry, or trust-anchor distribution system.

### Domain profiles

Profiles define specialized terms and validation rules while retaining foundation semantics.
Profile conformance MUST NOT expand foundation authorization or weaken disclosure requirements.
