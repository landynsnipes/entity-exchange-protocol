# EXP conformance

The runner treats an implementation as a black-box JSON Lines process. It does not import candidate
code. Version `exp-conformance-0.5.0` contains 52 cases covering transport-neutral core vectors, canonical signing vectors, wallet presentation policy, semantic/resource bounds, signed node descriptors, delegated operations, operational
key lifecycle, cross-signed root rollover, signed transport, replay/staleness rejection, external
HTTPS policy, identity-free standing notifications, participant-bound decisions, dual approval, and
disclosure-scope intersection, invalidation binding, released-proposal protection, and rejection of
decisions against invalidated results.

Run the bundled independent Python adapter from the exported repository:

```bash
npm run conformance
```

Run another candidate by passing its executable and arguments:

```bash
node conformance/run.mjs my-exp-adapter --schemas schemas
```

The candidate reads one JSON object per stdin line and writes one response per stdout line. Requests
contain `id`, `command`, and `input`; responses contain the same `id`, `ok`, and, on rejection, a stable
`errorCode`. Candidate diagnostics belong on stderr. The runner emits a payload-free JSON report with
each case labeled as `core` or an optional transport profile such as `transport:http`, and
returns nonzero when any case fails.

The `schemas/` directory is the canonical published schema set. Run `npm run schema:check` to
regenerate schemas into a temporary directory and compare every committed artifact and manifest
hash before running conformance.

This black-box level covers EXP transport-neutral core behavior, wallet presentation policy, semantic/resource bounds, Trust,
transport, and the approval/disclosure/invalidation state machine. It does not cover automatic
discovery, reciprocal matching, durable retry/requeue, or production multi-replica operation.
Third-party certification remains a higher level.

The repository also includes an optional MCP v2 adapter, a framework-free browser wallet proof, and
an additive Hospitality Profile. These surfaces build on the core contracts but are not required
for a core conformance implementation.
