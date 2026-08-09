# EXP platform packages

These packages adapt platform security and lifecycle APIs to the public `@exp/protocol/wallet-sdk`
contract. They do not own an Entity Model, choose consent, or operate a mandatory EXP service.

| Package | Boundary | Local verification |
| --- | --- | --- |
| Browser | WebCrypto Ed25519, pinned request keys, browser fetch | Built, unit-tested, and executed in headless Chrome |
| Swift | CryptoKit Ed25519, Keychain storage, URLSession transport | Source-reviewed here; requires Apple Swift/Xcode toolchain |
| Kotlin/Android | Android Keystore Ed25519 capability, hardware-backed-key reporting | Source-reviewed here; requires Android SDK/API 33+ device or emulator |

Native availability is capability-detected. A device that cannot create an Ed25519 key in its secure
provider must fail closed or use a separately reviewed external signer. It must not silently replace
Ed25519 with another algorithm while claiming the same EXP wallet profile.

Third-party certification cannot be self-issued by this repository. The included conformance profile
defines the evidence an independent implementation or auditor must produce.
