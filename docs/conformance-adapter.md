# EXP conformance adapter contract

This is the public JSONL interface for `exp-conformance-0.5.0`. It is
extracted from `conformance/run.mjs` and the committed test vectors. It is
not a network API and not part of a signed EXP record.

A clean-room implementation SHOULD implement this adapter from this page,
`SPECIFICATION.md`, `schemas/`, and `test-vectors/`. It SHOULD NOT need
TypeScript or Python source.

## Process

```text
stdin   one JSON object per line:  { "id", "command", "input" }
stdout  one JSON object per line:  { "id", "ok", "errorCode"?, "result"? }
stderr  diagnostics only
```

`id` is an opaque string from the runner. Echo it. On rejection set
`ok` to `false` and `errorCode` to one of the codes in
`SPECIFICATION.md`. On success set `ok` to `true` and, when the command
defines a result, put it in `result`.

The runner times out a request after 3 seconds. It compares `ok`,
`errorCode`, and selected `result` fields. Failed cases print `expected`
and `actual` without payloads.

Default invocation runs **all** cases, including `transport:http`. That
52-case command is unchanged.

```bash
npm run conformance
# Profile: all. Existing 52-case suite.

npm run conformance -- --profile core
# Transport-neutral cases only

npm run conformance -- --profile http
# verify_transport and transport_policy only
```

Start with `core`. Implement transport bindings only if you need them.
Passing `core` demonstrates transport-neutral EXP conformance, not HTTP
binding conformance or full-suite conformance. The runner prints the
selected profile, `Passed: X/X`, and `Skipped/not selected: Y` so a
reduced run cannot look accidentally complete.

`verify_transport` rejects a signature when `|now − signedAt| > 300`
seconds.

## Commands

### `canonical_json`

Input: `{ "value": unknown, "omittedFields": string[] }`.

Remove each named envelope field from `value` if it is an object, then
emit RFC 8785-JCS.

Success `result`: `{ "canonicalJson": string, "canonicalUtf8Base64": string }`.

Reject oversize or illegal values with the `RESOURCE_*` codes.

Normative fixtures: `test-vectors/canonical-signing.json` and the
`canonical-empty-object` core vector.

### `validate_core`

Input: `{ "schema": string, "value": object }`.

`schema` is a published schema stem: `consent`, `wallet-connect-request`,
`node-authority-grant`, `connection-proposal`, and any later vector
stem. Map `consent` to `schemas/consent.schema.json`.

Validate JSON Schema, then the semantic rules in `SPECIFICATION.md`.

### `verify_descriptor_key`

Input includes `descriptor`, `anchor`, `keyId`, `purpose`, `operation`,
and `now`.

`anchor` contains `nodeId`, `operatorEntityId`, `rootKeyId`,
`rootPublicKeyPem`, `descriptorOrigin`, and `allowedOperations`.

Success: `{ "ok": true }`. Failures use the trust error codes.

### `verify_transport`

HTTP-shaped profile (`transport:http`).

Input: `{ "method", "path", "body", "headers", "publicKeyPem", "now" }`.

`headers` contains `nodeId`, `keyId`, `nonce`, `signedAt`, `signature`.
The signed object is `{ method, path, body, nodeId, nonce, signedAt }`
with no envelope stripping. Signature is unpadded base64url Ed25519 over
the canonical UTF-8 bytes.

The candidate MUST remember nonces for the process lifetime. The runner
sends a valid transport case and then the same headers again
(`transport-replay` → `NONCE_REPLAY`).

### `transport_policy`

HTTP-shaped profile.

Input: `{ "url": string, "allowInsecureLoopback": boolean }`.

External `http:` fails with `INSECURE_TRANSPORT` even when loopback is
allowed. `https:` succeeds. `http://127.0.0.1` succeeds only when
`allowInsecureLoopback` is true.

### `build_wallet_presentation`

Input includes the connect `request`, `view`, `principalEntityId`,
`approvedScopes`, `approvedOperations`, identifiers, `keyId`,
`privateKeyPem` (PKCS8 PEM), `now`, and `expiresAt`.

Success `result.presentation.consent.approvedScopes` must equal the
approved list, and `containsRawContext` must be false.

### Standing commands (stateful)

`receive_proposal`, `record_decision`, and `receive_invalidation` share
**one process-wide store**. Later cases depend on earlier ones. Do not
reset state between lines.

`receive_proposal` input: `{ proposal, notification, now }`.
Success `result`: `{ accepted, duplicate }`.

`record_decision` input: `{ decision, now }`.
Success `result` includes `release` (`null` until both parties approve
an intersecting scope).

`receive_invalidation` input: `{ invalidation, now? }`.
Success `result`: `{ accepted, duplicate }`.

The public case order is the normative sequence in
`conformance/run.mjs` from `standing-proposal-accepted` through
`standing-invalidated-proposal-decision-rejected`.

## Diagnosing a failure

1. Read `expected` and `actual` in the report. The runner does not print
   the input again.
2. If the name starts with `standing-`, assume prior standing cases
   already mutated store state.
3. If the name starts with `transport-` or is `https-` / `http-`, the
   profile is `transport:http`.
4. If `errorCode` mismatches, use the table in `SPECIFICATION.md`. Do
   not invent a nearby synonym (`INVALID_SIGNATURE` is not a listed
   code).
5. If a standing case fails first, fix that case before interpreting
   later standing failures.

## What this adapter does not cover

Automatic discovery, reciprocal matching, durable retry, multi-replica
stores, MCP, NFC, and production certification. Those are out of
`exp-conformance-0.5.0`.
