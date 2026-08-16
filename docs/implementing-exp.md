# Implementing EXP

This guide describes the public interoperability boundary for EXP `0.1.0`. An implementation
should consume the committed schemas, canonical-signing vectors, and conformance runner. It does
not need a particular database, AI framework, cloud, or always-online service.

## Shared implementation rules

1. Validate incoming JSON against the relevant file in [`schemas/`](../schemas/).
2. Apply semantic validation, including timestamp ordering, uniqueness, binding, and lifetime rules.
3. Enforce the resource limits documented in [`SPECIFICATION.md`](../SPECIFICATION.md) before
   recursive parsing or signing.
4. Remove the normative signature-envelope fields and serialize the remaining value with the
   RFC 8785-JCS profile before Ed25519 signing or verification.
5. Negotiate an exact supported protocol/profile version; do not infer support from a matching
   major version.
6. Run the conformance suite before claiming interoperability. A passing report covers only the
   named cases and is not certification.

## Core and carrier bindings

EXP core behavior is defined independently of the delivery mechanism. The
`@exp/protocol/transport` export provides adapter contracts for opaque payload bytes, message
identity, sender/recipient binding, nonces, expiry, replay storage, trust resolution, and
normalized responses. The `@exp/protocol/signing` export provides shared signature metadata and
record-specific signed-byte construction.

An HTTP, MCP, NFC/QR, WebSocket, queue, or local-IPC binding may encode those contracts in its own
carrier format. Carrier metadata must not become a security property unless the binding promotes it
into the signed EXP input. MCP can expose EXP requests and presentations to an agent, but it does
not replace EXP identity, consent, signing, or revocation.

The conformance report labels transport-neutral cases as `core`. HTTP-shaped method/path and
HTTPS-policy cases are labeled `transport:http`; future bindings should add their own profile
without changing the core vectors.

## TypeScript

Install the repository dependencies and run the public checks:

```bash
npm install
npm run validate
npm run conformance
```

`npm run validate` runs typecheck, unit tests, schema-hash check, and the TypeScript build. CI on `main` also runs the Python tests, conformance suite, and optional MCP adapter tests.

The root export provides protocol schemas and types. Focused exports include:

- `@exp/protocol/canonical-json` for canonical JSON and signed-payload bytes
- `@exp/protocol/signing` and `@exp/protocol/transport` for carrier-neutral adapter contracts
- `@exp/protocol/hospitality` for the additive venue/service profile
- `@exp/protocol/compatibility` for exact version negotiation
- `@exp/protocol/errors` and `@exp/protocol/resource-limits` for runtime/error boundaries
- `@exp/protocol/wallet-sdk` for transport-injected wallet operations
- `@exp/protocol/platform-browser` for browser WebCrypto and Fetch adapters

The wallet SDK does not own private keys, a complete Entity Model, or a mandatory network service.
Applications inject signing, trust verification, transport, clocks, and identifiers.

The optional MCP adapter lives under [`adapters/mcp/`](../adapters/mcp/). It uses the official MCP
v2 server package and remains separate from the core dependency graph:

```bash
npm install --prefix adapters/mcp
npm run build:mcp
npm run test:mcp
```

The adapter exposes EXP delivery as an MCP tool and can expose an authorized context resource.
MCP tool access is never a substitute for EXP consent.

## Python

The independent Python implementation loads the committed schemas and does not import the
TypeScript package:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r implementations/python/requirements.txt
npm run test:python
npm run conformance
```

To run a candidate adapter directly:

```bash
python3 implementations/python/exp_adapter.py --schemas schemas
```

The adapter reads one JSON request per stdin line and writes one response per stdout line.
Diagnostics belong on stderr. Use the JSONL contract in
[`conformance/README.md`](../conformance/README.md) for another language implementation.

## Browser proof

Build the browser bundle and serve the repository with the dependency-free local server:

```bash
npm run build
npm run browser:serve
```

Then open `/examples/browser-wallet/index.html`. The demo generates a non-exportable WebCrypto
wallet key, pins a simulated restaurant requester key, displays explicit scope approval, and
creates a signed read-only presentation. It intentionally has no server-side customer store.

## Hospitality profile

The additive [`@exp/protocol/hospitality`](../src/hospitality.ts) profile defines venue/service
intent and offer records. It reuses generic Entity Views and scopes rather than changing v0.1
wallet records. Hospitality views should use namespace-scoped attributes such as
`hospitality.seating.preference` and `hospitality.food.preference`; allergy constraints must be
sealed or otherwise handled under an explicit safety policy. Recommendations must never infer that
an item is allergy-safe.

## Swift

The Swift package uses CryptoKit Ed25519, Keychain-backed signing, and bounded URLSession
transport:

```bash
cd platforms/swift
swift test
```

The platform adapter exposes the raw 32-byte Ed25519 public key required by the wallet contract.
Apple SDK execution is required before claiming Swift platform conformance; source inspection alone
is not a certification claim.

## Kotlin/Android

The Android library uses the Android Keystore provider and requires compile SDK 35, minimum SDK
28, and Kotlin JVM toolchain 17. From `platforms/kotlin`, use Android Studio or a compatible Gradle
installation:

```bash
gradle :library:assemble
```

The adapter capability-detects Ed25519 support and fails closed when unavailable. Wallet public
keys are exposed as 32 raw Ed25519 bytes; `publicKeySpkiDer()` is available separately for the
Android certificate encoding. Device or emulator execution is required before claiming Android
platform conformance. The current public Kotlin package has no executable test suite.

Both native packages now expose lifecycle seams for external URI opening, deep-link registration,
and gateway wakeup scheduling. These are host-application contracts, not evidence that background
delivery or approval UI is available on a device.

## Reporting support

When publishing an implementation report, identify the protocol/profile versions, conformance
version, language/runtime, platform capability level, and tests actually executed. Do not describe
source-reviewed or self-conformance results as independent certification.
