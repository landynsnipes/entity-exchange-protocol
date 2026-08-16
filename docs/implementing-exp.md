# Implementing EXP

This guide is the clean-room path for EXP `0.1.0`. An independent engineer should be able to
implement from these artifacts only:

1. [`SPECIFICATION.md`](../SPECIFICATION.md)
2. [`schemas/`](../schemas/) and `schemas/manifest.json`
3. [`test-vectors/`](../test-vectors/)
4. this page and [`conformance-adapter.md`](conformance-adapter.md)
5. [`conformance/run.mjs`](../conformance/run.mjs)

TypeScript under `src/` and Python under `implementations/python/` are reference
implementations. They are not the contract. Do not treat them as required reading.

The work does not need a particular database, AI framework, cloud, or always-online service.

## Shared implementation rules

1. Validate incoming JSON against the relevant file in [`schemas/`](../schemas/).
2. Apply the semantic rules in the specification, including timestamp ordering, uniqueness,
   binding, and lifetime. Schema acceptance is not sufficient.
3. Enforce the resource limits in the specification before recursive parsing or signing.
4. Remove the listed signature-envelope fields and serialize the remaining value with
   RFC 8785-JCS before Ed25519 / EdDSA verification. Use
   `test-vectors/canonical-signing.json` as the byte-level fixture.
5. Negotiate an exact shared version per family. Select the highest version both sides name.
   Do not infer support from a matching major version.
6. Implement the JSONL adapter in [`conformance-adapter.md`](conformance-adapter.md).
7. Run the conformance suite. A passing report covers only the named cases and is not
   certification. The default run includes `transport:http` cases.

## Core and carrier bindings

EXP core records are independent of the delivery carrier. HTTP, MCP, NFC/QR, WebSocket, a
queue, or local IPC may carry the same records. Carrier metadata is not a security property
unless the binding promotes it into the signed EXP input.

The conformance report labels transport-neutral cases as `core`. HTTP-shaped method/path and
HTTPS-policy cases are labeled `transport:http`. Those HTTP cases still run in the default
52-case command. They do not change the v0.1 wire records.

See [`transport-bindings.md`](transport-bindings.md).

## Optional TypeScript reference

The remainder of this page is convenience for people who already chose a reference
implementation. Skip it for a clean-room client.

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

The additive Hospitality Profile is defined in `SPECIFICATION.md` and
`schemas/hospitality-*.schema.json`. It reuses generic Entity Views and scopes. Allergy
constraints must be sealed or handled under an explicit safety policy. Recommendations must
never infer that an item is allergy-safe.

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
