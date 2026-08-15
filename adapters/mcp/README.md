# EXP MCP adapter

This optional package exposes EXP delivery through the official MCP v2 TypeScript server SDK.
MCP is an agent-facing carrier; it does not replace EXP identity, consent, signatures, audience
binding, expiry, scope narrowing, or revocation.

Install and test from the repository root:

```bash
npm install --prefix adapters/mcp
npm run build:mcp
npm run test:mcp
```

The `exp_deliver` tool accepts a base64-encoded opaque EXP payload and preserves message identity,
operation, sender/recipient binding, nonce, lifecycle timestamps, optional signatures, and
deadlines. The adapter returns normalized EXP delivery results as MCP structured content.

The optional `exp://authorized-context` resource is only registered when an application supplies
an authorization-aware reader. Applications must not expose a wallet or Entity View through MCP
merely because an agent can call a tool. Every read must still pass EXP authorization and
least-privilege policy.

The MCP adapter is isolated because the core package intentionally remains browser-capable,
transport-neutral, and independent of MCP's Node and Zod 4 runtime requirements.
