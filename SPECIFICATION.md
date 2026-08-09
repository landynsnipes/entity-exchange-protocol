# Entity Exchange Protocol 0.1

## Status

This document describes the private-alpha draft. It is not yet a stable public standard.

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
