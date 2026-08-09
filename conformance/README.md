# EXP conformance

The runner treats an implementation as a black-box JSON Lines process. It does not import candidate
code. Version `exp-conformance-0.2.0` covers signed node descriptors, delegated operations, operational
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
`errorCode`. Candidate diagnostics belong on stderr. The runner emits a payload-free JSON report and
returns nonzero when any case fails.

This black-box level proves EXP Trust, transport, and the approval/disclosure/invalidation state
machine. The private incubation harness separately proves automatic discovery, reciprocal matching,
durable retry/requeue, remote invalidation, and planned root rollover between TypeScript and Python.
Third-party certification and production multi-replica operation remain higher levels.
