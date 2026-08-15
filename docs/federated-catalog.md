# Federated EXP catalogs

EXP catalogs are independently operated indexes of discoverable references. They are the library
catalog in the EXP model: a catalog helps an authorized agent locate compatible intents, offers, or
purpose-specific Entity Views, but it does not own the entities or their complete private models.

## What enters a catalog

A registration contains a signed public reference, profile, purpose, entity kind, coarse discovery
tags, provenance references, lifecycle state, and an endpoint used to request an authorized view.
It cannot contain direct identity or sealed values. The publisher can expire or withdraw it.

## Federation

A discovery query can remain local or permit a bounded number of federation hops. Catalogs track
visited peers, enforce result limits, and report partial responses and peer errors. This prevents
unbounded fan-out and makes incomplete discovery visible to the requester.

Federation means multiple career networks, commerce providers, communities, or personal agents can
participate without placing every record in one EXP-owned database. A catalog implementation may use
SQL, search indexes, peer-to-peer infrastructure, or another storage system as long as its behavior
conforms to the public contracts.

## Trust boundary

The public TypeScript contracts are defined in [`src/catalog.ts`](../src/catalog.ts). An in-memory
catalog implementation may verify signatures through an injected trust interface, permit exact
idempotent retries, reject changed registrations and signature reuse, enforce discovery
authorization, filter withdrawn or expired records, prevent peer loops, and bound federation depth
and result count. The signed discovery layer adds expiring requests, nonce replay protection,
external key resolution, deterministic cursors, and cached exact retry responses. A
transport-neutral peer interface should report partial failures without hiding them.

This remains a conformance exercise, not a production network. Durable storage, production key discovery
and rotation, transport authentication, peer reputation, network timeouts, rate limits, abuse controls,
and operational telemetry remain future work. Sealed comparison occurs
only after discovery, through an authorized matcher, and never inside the public catalog index.
