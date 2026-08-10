# Independent Python EXP adapter

This adapter is intentionally authored without imports from the TypeScript protocol package, private
gateway, matching engine, or proprietary product code. It consumes the exported JSON Schemas and
implements the EXP Trust/transport conformance JSONL boundary in Python.

`exp_adapter.py` remains the small JSONL conformance candidate. `exp_http_node.py` promotes those
semantics into an independently operated HTTP proof node with an atomic JSON store, public node
descriptor, signed discovery, authorized dereference, proposal/release delivery, token-protected
local controls, and audit metadata. It is a proof node, not production infrastructure.

The HTTP proof node also persists a retrying outbox across restart, applies bounded exponential
backoff and dead-letter state, redacts queued bodies from status responses, enforces bounded
per-peer request state, preserves authorization revocation and notification invalidation, and accepts
only HTTPS or explicit loopback transport. Root replacement is accepted only through a valid
dual-signed transition from the configured anchor.

Run through the public conformance suite with `npm run conformance`.

The private reference repository runs the live TypeScript/Python standing proof. The Python node is
public; the TypeScript product gateway and test harness remain private during incubation.
