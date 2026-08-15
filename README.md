# @exp/protocol

This package defines the public EXP v0.1 contract. It contains no database, application, model,
network, or proprietary implementation dependencies.

## Stewardship

EXP was initiated by Landyn Snipes and incubated by Veltrax Technologies. It is published as an
open, vendor-neutral protocol under Apache-2.0. Implementing EXP, running conformance, or
contributing to the specification does not require any Veltrax product or service.

EXP contracts are operating-system and device neutral. See `docs/portability.md` for the capabilities
required of full nodes, mobile/desktop wallets, browser clients, and delegated gateways.

## Release status

This is the public source repository for EXP protocol version `0.1.0`. The protocol and profiles are
still drafts, and the npm metadata remains `"private": true`; this repository is not a claim that a
stable npm release or production certification exists. The conformance suite is
`exp-conformance-0.5.0` with 52 cases. Core cases are transport-neutral; HTTP-shaped transport
cases are labeled separately in the report. Browser adapter tests run in headless Chrome; Swift and
Kotlin sources require their native toolchains before platform conformance can be claimed.

The implementation path for TypeScript, Python, Swift, and Kotlin is documented in
[`docs/implementing-exp.md`](docs/implementing-exp.md).

The public repository also includes a framework-free browser wallet proof under
[`examples/browser-wallet`](examples/browser-wallet), an optional MCP v2 adapter under
[`adapters/mcp`](adapters/mcp), and an additive Hospitality Profile. These are demonstrations and
adapter/profile surfaces; they do not turn MCP, HTTP, or hospitality into required core protocol
dependencies.

The `@exp/protocol/wallet-sdk` export provides runtime-neutral direct-connect helpers. Applications
inject fetch-compatible transport, request trust verification, secure signing, clocks, and identifiers;
native mobile wrappers additionally implement the Keychain/Keystore, deep-link, and gateway-wakeup
adapter contract. The SDK never owns a complete Entity Model or private key.

The `@exp/protocol/platform-browser` export supplies WebCrypto Ed25519 signing, pinned request-key
verification, and Fetch transport. Reviewed native adapter packages live under `platforms/swift` and
`platforms/kotlin`; see `docs/platform-sdks.md` for their capability and verification boundaries.

An Entity Card is a versioned envelope around one typed profile. Sensitive values are private by
default. Claims distinguish assertions from evidence and verification so a linked repository never
becomes an unsupported proficiency claim.

## Conformance and independent implementation

The clean public export includes a black-box conformance runner and an independently authored Python
adapter. The Python code loads the published JSON Schemas and does not import this TypeScript package
or any application gateway, database, matching, AI, or product module.

After installing the Node and Python requirements, run:

```bash
npm run conformance
npm run test:python
```

The current 52-case conformance level covers transport-neutral core vectors, canonical signing vectors, wallet presentation policy, semantic/resource bounds, trust descriptors, delegated operations, key lifecycle, planned
root rollover, signed transport, replay and staleness, HTTPS policy, privacy-safe standing
notifications, participant authorization, dual approval, disclosure-scope intersection, invalidation
binding, released-proposal protection, and invalidated-decision rejection. A passing report covers
only the cases named by this conformance version; it is not third-party certification or proof that
every device must operate an always-online server.

## Canonical signing

All signed EXP payloads use the `RFC8785-JCS` canonical JSON profile. It produces deterministic
UTF-8 bytes, orders object names by UTF-16 code units, preserves array order, and uses
ECMAScript-compatible number serialization. Signature envelope fields are removed before
canonicalization; the exact field list is normative in [`SPECIFICATION.md`](SPECIFICATION.md).

The reusable TypeScript helpers are exported from `@exp/protocol/canonical-json`, and wallet
records continue to use the source-compatible `walletSigningBytes()` helper. The independent
Python implementation uses the same profile without importing the TypeScript package.

EXP delivery is transport-neutral. `@exp/protocol/transport` defines adapter contracts for
message identity, opaque payloads, replay, trust resolution, deadlines, and normalized responses;
`@exp/protocol/signing` centralizes reusable signature metadata without replacing record-specific
v0.1 envelopes. HTTP, MCP, NFC/QR, local, and queue bindings can carry the same core records.
See [`docs/transport-bindings.md`](docs/transport-bindings.md).

The shared vectors in [`test-vectors/canonical-signing.json`](test-vectors/canonical-signing.json)
cover nested objects, Unicode, control characters, numbers, wallet envelopes, root transitions,
and federation transport payloads. Implementers should run the TypeScript tests, Python tests,
and black-box conformance runner against these vectors before claiming interoperability.

The transport-neutral core vectors are in
[`test-vectors/core-conformance.json`](test-vectors/core-conformance.json). Conformance reports
label core cases separately from optional carrier profiles.

## Versions and schemas

EXP compatibility is explicit rather than inferred from matching major numbers. The public
release exports `EXP_SUPPORTED_VERSIONS`, `versionCapabilitiesSchema`, and `negotiateVersion`
from `@exp/protocol/compatibility`. Negotiation selects the highest exact version shared by both
implementations; unsupported minor and major versions are rejected.

The committed [`schemas/`](schemas/) directory is the canonical machine-readable artifact
included in this source distribution. [`schemas/manifest.json`](schemas/manifest.json) records supported
protocol/profile versions and SHA-256 hashes for every schema. Run `npm run schema:check` after
changing a Zod contract; CI or release automation should reject schema drift.

Existing v0.1 wire records are unchanged. Unknown fields remain a boundary policy: published
JSON Schemas reject undeclared fields, while individual TypeScript parsers retain their existing
Zod behavior. Implementations validating external messages should validate against the published
schema before application-level parsing, especially before signature verification.

## Runtime errors, deadlines, and retries

`@exp/protocol/errors` defines runtime-only `ExpError` metadata: a stable `code`, `retryable`
classification, optional HTTP `status`, `requestId`, and `retryAfterMs`. These fields are not
added to signed protocol records. Wallet SDK errors use the same vocabulary and distinguish
`REQUEST_CANCELLED`, `REQUEST_TIMEOUT`, and `DEADLINE_EXCEEDED`.

Callers may provide an `AbortSignal`, `deadlineAt`, and `requestId` to wallet operations. The
effective budget is the minimum of the caller deadline and the SDK timeout; work must stop when
the signal, deadline, or signed record expiry is reached. Retry only transport failures,
timeouts, deadline-safe `408`/`425`/`429`, or `5xx` responses. Do not retry authorization,
schema, signature, replay, conflict, cancellation, or expired-record failures. Retries must
create fresh transport nonces while retaining the same logical operation identifier.

## Semantic validation and resource limits

In addition to field shapes, EXP validators enforce relationships such as timestamp ordering,
unique identifiers and scopes, consent lifetime, proposal party binding, and compensation range
ordering. Untrusted values are bounded before recursion or signing: payloads are limited to 1 MiB,
nesting to 16 levels, arrays and objects to 100 items/properties, and strings to 4,096 UTF-16 code
units. Stable resource categories include `RESOURCE_PAYLOAD_TOO_LARGE`,
`RESOURCE_NESTING_TOO_DEEP`, `RESOURCE_ARRAY_TOO_LARGE`, `RESOURCE_STRING_TOO_LARGE`, and
`RESOURCE_OBJECT_TOO_LARGE`.
