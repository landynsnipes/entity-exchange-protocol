# EXP standing mode

Standing mode is the protocol behavior that lets an entity maintain a revocable intent and react to
relevant counterpart changes without repeatedly searching. It is the first proof of EXP as
persistent, decentralized intent rather than a marketplace application.

## Proven flow

The private reference implementation now exercises this sequence with two separately operated
in-memory nodes and two federated catalogs:

1. Each principal owns its Entity Model, purpose-specific Entity View, intent, authorization, keys,
   catalog, and notification inbox.
2. A provider changes one governed attribute and signs an `EntityStateChange` containing model
   versions and changed namespaces, but no changed value.
3. Its node withdraws the previous catalog reference and publishes a newly signed reference to the
   replacement view.
4. The other node's standing authorization automatically permits one bounded, signed federated
   discovery request. No person performs a manual search.
5. The agent dereferences the authorized record and runs the deterministic reciprocal evaluator.
6. If both required intents are satisfied, each principal receives a `StandingMatchNotification`.
   The notification contains a purpose, entity kind, score band, confidence, and proposal reference;
   it contains neither counterparty identity nor sealed values.
7. Each principal independently decides which requested scopes to approve. One approval releases
   nothing. A `DisclosureRelease` exists only when both sides approve at least one identical scope.
8. A later state change invalidates unresolved notifications before the replacement view is evaluated.

## What is decentralized

- There is no required EXP database containing every principal's complete data.
- Models, views, records, authorizations, and inboxes belong to their respective nodes.
- Catalogs exchange signed references and bounded discovery responses, not source models.
- Peer relationships are explicit and hop-limited.
- The coordinator in `packages/standing` is a reference event orchestrator, not a required central
  network service. Its interfaces can be distributed across HTTP, MCP, queues, or local agent
  runtimes without changing the protocol contracts.

## Safety invariants

- A state event never carries the changed attribute value.
- A catalog candidate never carries publisher identity or sealed values.
- A notification never carries counterparty identity or sealed values.
- Standing authorization permits projection, discovery, evaluation, and notification—not contact,
  application, purchase, booking, or identity disclosure.
- Matching remains pair-specific, purpose-specific, deterministic, and versioned.
- Identity and contact scopes are released only by intersecting two independent approvals.
- A changed source state invalidates unresolved results based on the earlier snapshot.
- Every accepted state change, republication, evaluation, notification, decision, invalidation, and
  release produces an audit event in the reference proof.

## What this proof does not claim

The original contract proof remains a fast in-process conformance test. A second proof runs the flow
through two independently configured TypeScript HTTP child processes with durable stores and signed
transport. A third proof now connects the TypeScript gateway to an independently authored Python HTTP
node and completes automatic discovery, reciprocal evaluation, proposal delivery, independent
approval, and disclosure release. The Python node imports neither TypeScript nor private packages;
its lightweight persistence and reduced lifecycle surface are not production federation.

The Python path now persists pending delivery, retries automatically after restart, keeps outbox
bodies out of operator status, and preserves revocation and invalidation state. The live proof starts
the TypeScript peer offline, restarts the Python process, completes delivery, then proves that a
persisted revocation suppresses a later automatic match.
The same proof now rotates the Python descriptor root through a dual-signed transition, remotely
invalidates an unresolved notification on both nodes, rejects decisions on invalidated results,
dead-letters a later offline delivery, exposes no queued body during inspection, authenticates the
requeue, and completes delivery after the peer returns.

## Next proof

The operated retry worker and optional transactional PostgreSQL adapter now preserve standing state,
outbox recovery, row-locked mutations, and integrity revisions across restarts. Root-pinned signed
descriptors now support operational-key discovery, overlapping rotation, revocation, and expiry.
The cross-language lifecycle proof is complete for this reference level. Next, define browser and
mobile-wallet conformance profiles. MCP can
expose local controls without changing EXP discovery, evaluation, approval, or disclosure semantics.
See `cross-process-standing-proof.md`.
