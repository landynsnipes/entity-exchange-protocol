# Contributing

EXP is a public protocol draft. Contributions are welcome, but changes should be treated as
pre-stable work until the protocol reaches a declared stable release.

The root `Validate` workflow must stay green: `npm run validate`, Python adapter tests,
`npm run conformance`, and the optional MCP adapter tests.

All proposed changes must preserve privacy defaults, evidence provenance, deterministic matching,
human approval, public/private package boundaries, and conformance coverage. Never include real
personal data, credentials, production endpoints, or confidential or proprietary material in tests
or examples.

Independent implementations should consume the schemas and conformance boundary without importing
application-specific services. Conformance adapters communicate through JSON Lines so implementations
may use any language. A passing report demonstrates only the cases named by its conformance version;
it must not be presented as production certification or complete standing-mode interoperability.
