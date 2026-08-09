# Contributing

EXP is privately incubated while the first employment workflow validates its abstractions. Public
contribution instructions will activate with the v0.1 release.

All proposed changes must preserve privacy defaults, evidence provenance, deterministic matching,
human approval, public/private package boundaries, and conformance coverage. Never include real
personal data, credentials, production endpoints, or private Veltrax material in tests or examples.

Independent implementations should consume the schemas and conformance boundary without importing
private reference services. Conformance adapters communicate through JSON Lines so implementations
may use any language. A passing report demonstrates only the cases named by its conformance version;
it must not be presented as production certification or complete standing-mode interoperability.
