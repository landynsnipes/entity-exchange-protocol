# EXP wallet platform SDKs

EXP's platform layer separates protocol semantics from device APIs. The public TypeScript SDK owns
request validation, origin binding, consent narrowing, Entity View validation, canonical signing
payloads, timeouts, and submission. Platform adapters supply secure signing and transport.

## Browser

`@exp/protocol/platform-browser` uses standard Fetch and WebCrypto Ed25519. Generated private keys are
non-extractable; only the raw public key is returned for trust registration. Request verification uses
an explicitly pinned key map. The adapter does not provide an inbound listener or persist a complete
Entity Model. The package build emits `dist/platform-browser.bundle.js`; the included smoke page has
been executed against that bundle in headless Chrome.

## Apple

`platforms/swift` is a Swift Package using CryptoKit Ed25519, Keychain storage marked
`WhenUnlockedThisDeviceOnly`, and bounded URLSession transport. The private key is loaded only inside
the actor that signs canonical payload bytes supplied by the protocol SDK. Apple toolchain execution
is required before claiming Swift package conformance.

## Android

`platforms/kotlin` is an Android library using the Android Keystore provider. Because secure Ed25519
availability varies by API level and device provider, the adapter capability-detects it and fails
closed. It reports whether the key is hardware-backed and never silently substitutes another signing
algorithm. Android SDK/API 33+ device or emulator testing is required before claiming Android package
conformance.

## Certification boundary

`platforms/exp-wallet-platform-conformance.json` lists the required platform cases and claim metadata.
Passing local tests is a self-conformance result. A certified claim additionally requires an
identified independent reviewer and immutable report hash; this repository cannot certify itself.
