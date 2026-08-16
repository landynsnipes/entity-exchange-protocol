# Entity Exchange Protocol

[![Validate](https://github.com/landynsnipes/entity-exchange-protocol/actions/workflows/validate.yml/badge.svg)](https://github.com/landynsnipes/entity-exchange-protocol/actions/workflows/validate.yml)

Permissioned, evidence-backed connection between people, organizations, applications, and AI agents — without handing anyone the whole profile, the conversation history, or a standing right to act.

EXP is a **draft, transport-neutral protocol**. It is not a production runtime, a marketplace, or a claim that a stable npm release exists. The npm package remains `"private": true`.

## The problem

AI assistants now sit between people and every other system. The usual answers fail in the same place:

- OAuth and cookies assume one app and one identity provider.
- Vendor “memory” and RAG assume the model may see the raw record.
- Chatbot plugins assume one assistant mediates every session.
- Unstructured model output is not a contract another implementation can verify.

EXP treats connection as a **signed, scoped, expiring exchange**. A principal (person or organization) discloses a minimal view for one purpose. An agent may carry that view only with explicit delegated authority. The counterpart evaluates evidence, not a global score. Consequential next steps still require human approval.

## Architecture

```text
Principal (person or org)
        │
        ▼
EXP wallet / agent / vault     ← keys, consent, expiry stay here
        │  signed request / presentation
        ▼
Application or gateway         ← never owns the Entity Model
        │
        ├── contextual evaluation
        ├── proposal
        └── decision + evidence
```

The same core records can move over HTTP, MCP, NFC/QR, local IPC, or a queue. Carrier metadata is not a security property unless it is promoted into the signed EXP input.

```text
SPECIFICATION.md
    → hashed JSON Schemas (schemas/)
    → TypeScript contract package
    → independent Python adapter
    → browser / Swift / Kotlin platform adapters
    → optional MCP adapter
    → black-box conformance (52 cases)
```

Core protocol has no database, model, network, or product dependency. Implementing EXP does not require Veltrax.

## Working demo (five minutes)

```bash
git clone https://github.com/landynsnipes/entity-exchange-protocol.git
cd entity-exchange-protocol
npm install
npm run validate
```

That runs typecheck, Vitest, schema-hash drift check, and the TypeScript build.

Independent Python adapter and black-box conformance:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r implementations/python/requirements.txt
npm run test:python
npm run conformance
```

Browser wallet proof (no server-side customer store):

```bash
npm run build
npm run browser:serve
```

Open `/examples/browser-wallet/index.html`. The page generates a non-exportable WebCrypto key, shows explicit scope approval, and creates a signed read-only presentation.

Clean-room path (specification, schemas, vectors, adapter contract, runner):
[`docs/implementing-exp.md`](docs/implementing-exp.md) and
[`docs/conformance-adapter.md`](docs/conformance-adapter.md).
Black-box implementer audit: [`docs/implementer-audit.md`](docs/implementer-audit.md).
Direct-connect handshake: [`docs/connect-with-exp.md`](docs/connect-with-exp.md).
TypeScript, Python, Swift, and Kotlin remain optional reference implementations.

## What a passing gate proves

| Gate | Proves | Does not prove |
| --- | --- | --- |
| `npm run validate` | TypeScript contract, unit tests, schema hashes match committed `schemas/` | Production certification |
| `npm run conformance` | 52 named cases in `exp-conformance-0.5.0` | Every device, every binding, or live federation |
| `npm run conformance -- --profile core` | Transport-neutral subset of that suite | HTTP binding or full-suite conformance |
| `npm run test:python` | Independent adapter agrees with published schemas | Interoperability with an untested third implementation |
| Browser wallet | Scoped consent + WebCrypto signing in a page | A hosted wallet product |
| Swift / Kotlin sources | Reviewed native adapter contracts | Platform conformance (needs native toolchains) |

Conformance covers transport-neutral core vectors, canonical signing, wallet presentation policy, semantic and resource bounds, trust descriptors, delegated operations, key lifecycle, root rollover, signed transport, replay and staleness, HTTPS policy, standing notifications, authorization, dual approval, disclosure-scope intersection, and lifecycle invalidation. Core cases are labeled separately from HTTP-shaped transport cases.

A passing report is **protocol correctness**, not model-quality evaluation and not third-party certification.

## Production characteristics (draft)

- **Exact version negotiation** — `negotiateVersion` selects the highest version both sides name. Matching major numbers are not enough.
- **Canonical signing** — `RFC8785-JCS` over payloads with envelope fields stripped. Shared vectors in `test-vectors/`.
- **Bounded untrusted input** — 1 MiB payload, 16 nesting levels, 100 items/properties, 4,096 UTF-16 code units per string.
- **Retry rules** — retry transport, timeout, and deadline-safe `408`/`425`/`429`/`5xx` only. Fresh transport nonce, same logical operation id. Do not retry auth, schema, signature, replay, conflict, cancel, or expiry.
- **Privacy default** — sensitive fields stay private; claims separate assertion, evidence, and verification.
- **Model-neutral** — an AI may derive a short-lived Intent Projection. It does not own the principal, consent, or another model’s memory.

## Technical depth

| Topic | Start |
| --- | --- |
| Normative contract | [`SPECIFICATION.md`](SPECIFICATION.md) |
| Protocol vision | [`docs/protocol-vision.md`](docs/protocol-vision.md) |
| Transport bindings | [`docs/transport-bindings.md`](docs/transport-bindings.md) |
| Portability (node / wallet / browser / gateway) | [`docs/portability.md`](docs/portability.md) |
| Platform SDKs | [`docs/platform-sdks.md`](docs/platform-sdks.md) |
| Conformance runner | [`conformance/README.md`](conformance/README.md) |
| Python adapter | [`implementations/python/README.md`](implementations/python/README.md) |
| Optional MCP adapter | [`adapters/mcp/README.md`](adapters/mcp/README.md) |
| Security reporting | [`SECURITY.md`](SECURITY.md) |
| Contributing | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

Focused TypeScript exports include `@exp/protocol/canonical-json`, `signing`, `transport`, `compatibility`, `errors`, `resource-limits`, `wallet-sdk`, `platform-browser`, and additive profiles such as `hospitality`. The wallet SDK never owns a complete Entity Model or private key; applications inject transport, trust, signing, clocks, and identifiers.

Published JSON Schemas reject undeclared fields. `schemas/manifest.json` records SHA-256 hashes for every schema. `npm run schema:check` must stay green after any Zod contract change.

## Stewardship and status

EXP was initiated by Landyn Snipes and incubated by Veltrax Technologies. It is published as an open, vendor-neutral protocol under Apache-2.0. Protocol version `0.1.0` and its profiles are drafts.

Hospitality examples, the MCP adapter, and the browser wallet are demonstrations and extension surfaces. They do not make MCP, HTTP, or hospitality required core dependencies.
