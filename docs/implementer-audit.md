# EXP black-box implementer audit

Date: 2026-08-16.
Protocol: EXP `0.1.0` draft.
Conformance: `exp-conformance-0.5.0`.
Method: public contract only:
`SPECIFICATION.md` → `schemas/` → `test-vectors/` → implementer docs →
`conformance/run.mjs`. TypeScript `src/` and `implementations/python/` were
not used as a cheat sheet.

This audit does **not** change the external-adoption score. It is
self-authored implementability evidence. External adoption stays **2.0**
until another person attempts a clean-room client.

Acceptance criterion used:

> An engineer should be able to build a clean-room implementation and
> diagnose conformance failures without reading EXP TypeScript source.

## Verdict

The specification carries architecture and invariants. It does **not**
carry enough of the conformance contract.

A competent independent engineer would have to inspect `conformance/run.mjs`
(allowed, but not advertised as the command catalog) or a reference
implementation (off-limits) to learn:

- which adapter commands exist
- input and result shapes
- exact error codes
- semantic rules that JSON Schema permits
- that the runner is **stateful** across standing cases
- the transport-staleness threshold

That fails the acceptance criterion as the repository stood before this
audit.

## Classification

| ID | Finding | Class | Would force |
| --- | --- | --- | --- |
| A1 | No published adapter command catalog | Conformance / documentation defect | Guess commands or read Python/TS |
| A2 | Error codes used by the runner are not listed in the spec | Specification defect | Guess codes; fail cases without knowing why |
| A3 | Self-grant, duplicate scope/operation, and identical-party rules are tested but not MUST-stated | Specification defect | Infer from four core vectors only |
| A4 | Standing state machine lives in runner case order, not the spec | Specification defect | Reverse-engineer `run.mjs` |
| A5 | Transport signature staleness window is unspecified | Specification defect | Guess hours/days or read impl |
| A6 | Descriptor `signedAt` / unexpected `keyId` error mapping is unspecified | Specification defect | Fail `INVALID_DESCRIPTOR_TIMESTAMP` / `INVALID_ROOT_TRANSITION` |
| A7 | Version negotiation algorithm is README-only and not a conformance command | Specification / documentation defect | Guess “highest shared exact version” |
| A8 | Default 52-case run requires HTTP-shaped transport | Conformance defect vs transport-neutral claim | Implement HTTP to pass “core” |
| A9 | Implementer guide and standing/transport docs point at `src/*.ts` | Documentation defect | Leave the clean-room path |
| A10 | Spec treats Zod/TypeScript helpers as if they were normative | Documentation defect | Misread MUST vs reference |
| A11 | Schema vs semantic split is stated, but `uniqueItems` is absent where uniqueness is required | Conformance / schema note | Schema-only implementer ships invalid consents |
| A12 | Wallet adapter requires PKCS8 PEM and `containsRawContext` without an adapter schema | Documentation defect | Guess key encoding |
| A13 | No failure-diagnosis guide (which field, which prior case) | Conformance / documentation defect | Fail standing cases without knowing they share state |
| A14 | `Ed25519` vs `EdDSA` and PEM vs base64url are mentioned but not tabulated by record | Documentation defect | Wrong algorithm identifier |
| A15 | Resource bounds are specified; only one oversized-string case is public | Optional improvement | Edge-case UTF-16 counting |

Implementation convenience issues (not defects): TypeScript package
exports, Python adapter, browser demo. Useful after a clean-room pass.
Not allowed as the source of normative behavior.

## What already works from the public contract

- Invariants are clear: no ownership transfer, private default, no
  universal score, dual approval, model text cannot mutate consent.
- Canonical signing has **normative vectors** with canonical JSON,
  UTF-8 base64, and signatures. An implementer can reproduce JCS from
  `test-vectors/canonical-signing.json` plus RFC 8785.
- Envelope fields to strip are listed in the spec.
- Resource numeric limits are listed (1 MiB, 16 levels, 100
  items/properties, 4,096 UTF-16 code units).
- Published schemas reject undeclared fields.
- Transport is correctly described as a profile, not core wire records.
- Hospitality allergy rules are normative in the spec.

## Fixes applied after the audit

Only missing contract, not prettier wording:

1. Normative semantic rules and error-code table in `SPECIFICATION.md`.
2. Standing and wallet rules that conformance already enforces.
3. Version-negotiation algorithm moved from README into the spec.
4. `docs/conformance-adapter.md`: command catalog, statefulness, and
   diagnosis notes extracted from the public runner.
5. Implementer guide and related docs no longer require `src/` to start.

Not changed:

- Conformance case outcomes and error codes
- Wire records and schema hashes
- Transport staleness threshold (still unknown without an
  implementation constant; recorded as residual A5)
- Recruiting an external implementer

## Residual after the doc fixes

A5 is closed as **300 seconds** of absolute skew, matching
`exp_adapter.py` and `exp_http_node.py`. The runner fixture agrees. A8
is closed as `--profile core` / `--profile http` with the default 52-case
command unchanged.

## External adoption

Unchanged at **2.0**. This file is still Landyn writing about Landyn’s
protocol.
