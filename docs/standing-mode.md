# EXP standing mode

Standing mode is the protocol behavior that lets an entity maintain a revocable intent and react to
relevant counterpart changes without repeatedly searching. It describes persistent, decentralized
intent rather than a marketplace application.

## Protocol flow

A conforming implementation may realize this sequence with local services, HTTP peers, queues, or
agent runtimes:

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
- The coordinator in [`src/standing.ts`](../src/standing.ts) is a reference event orchestrator, not a required central
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
  release should produce an audit event in an implementation's audit subsystem.

## Verification boundary

The public conformance suite verifies the standing notification, decision, approval, disclosure, and
invalidation state machine. It does not certify automatic discovery, durable retry/requeue,
production federation, PostgreSQL operation, or multi-replica deployment. Those concerns are
implementation choices and require separately published tests and operational evidence.

Future public work may define browser and mobile-wallet capability profiles. Local controls can be
exposed through MCP or another adapter without changing EXP discovery, evaluation, approval, or
disclosure semantics.
