# @exp/protocol

This package defines the public EXP v0.1 contract. It contains no database, application, model,
network, or Veltrax-private imports.

EXP contracts are operating-system and device neutral. See `docs/portability.md` for the capabilities
required of full nodes, mobile/desktop wallets, browser clients, and delegated gateways.

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
or any private gateway, database, matching, AI, or product module.

After installing the Node and Python requirements, run:

```bash
npm run conformance
npm run test:python
```

The current 25-case conformance level covers trust descriptors, delegated operations, key lifecycle, planned
root rollover, signed transport, replay and staleness, HTTPS policy, privacy-safe standing
notifications, participant authorization, dual approval, disclosure-scope intersection, invalidation
binding, released-proposal protection, and invalidated-decision rejection. It is
The private incubation source additionally proves live automatic standing exchange between the
TypeScript gateway and this exported Python HTTP node. That proof is interoperability evidence, not a
third-party certification or a claim that every device must operate an always-online server.
