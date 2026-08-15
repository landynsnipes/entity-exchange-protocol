# EXP platform packages

These packages adapt platform security and lifecycle APIs to the public `@exp/protocol/wallet-sdk`
contract. They do not own an Entity Model, choose consent, or operate a mandatory EXP service.

For setup and implementation boundaries across TypeScript, Python, Swift, and Kotlin, see
[`docs/implementing-exp.md`](../docs/implementing-exp.md).

| Package | Boundary | Local verification |
| --- | --- | --- |
| Browser | WebCrypto Ed25519, pinned request keys, browser fetch | Built, unit-tested, and executed in headless Chrome |
| Swift | CryptoKit Ed25519, Keychain storage, URLSession transport | Source-reviewed here; requires Apple Swift/Xcode toolchain |
| Kotlin/Android | Android Keystore Ed25519 capability, hardware-backed-key reporting | Source-reviewed here; requires Android SDK/API 33+ device or emulator |

Native availability is capability-detected. A device that cannot create an Ed25519 key in its secure
provider must fail closed or use a separately reviewed external signer. It must not silently replace
Ed25519 with another algorithm while claiming the same EXP wallet profile.

Wallet platform adapters expose public wallet keys as exactly 32 raw Ed25519 public-key bytes.
Android's Keystore certificate API returns SPKI DER, so the Kotlin adapter exposes that encoding
separately as `publicKeySpkiDer()` and strips the validated Ed25519 SubjectPublicKeyInfo prefix
for `publicKeyRaw()`. Trust descriptor keys remain a separate contract and continue to use PEM.
All adapters must preserve response headers, support bounded cancellation/deadlines, and map
cancelled, timed-out, and transport failures to their platform error equivalents.

The public wallet contract also defines lifecycle seams for opening an external URI, registering a
deep-link handler, and scheduling a gateway wakeup. Swift and Kotlin host applications provide
those integrations; the interfaces alone do not claim background delivery, approval UI, or device
runtime conformance.

Third-party certification cannot be self-issued by this repository. The included conformance profile
defines the evidence an independent implementation or auditor must produce.
