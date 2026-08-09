# Connect with EXP

EXP supports direct application-to-principal exchange without requiring ChatGPT, Claude, or another
daily-driver AI to mediate the session. A compatible website or mobile application can request a
purpose-specific Entity View from the principal's chosen EXP wallet, agent, or vault.

## Direct exchange

```text
compatible application
    -> signed purpose and scope request
principal's EXP wallet or agent
    -> human review, narrowing, approval, or rejection
minimal expiring Entity View
    -> application EXP gateway
contextual evaluation or service workflow
    -> proposal requiring any consequential approvals
```

The experience may begin through a Connect with EXP button, QR code, mobile deep link, browser
extension, operating-system wallet, or an already authorized agent endpoint. These are transports and
user experiences around the same protocol contracts.

The requester identifies itself, the purpose, requested fields, intended operations, prohibited
reuse, and expiration. The principal can reject the request or approve a narrower view. Approval does
not grant permission to retrieve the complete Entity Model, raw AI conversations, unrelated profile
data, sealed plaintext, identity, contact details, or authority to transact.

## Cross-device storage

EXP does not require all data to remain on one physical device. A principal may use local-only
storage, encrypted device-to-device synchronization, a self-hosted vault, an enterprise-controlled
vault, or a chosen managed provider. The provider-independent Entity Model remains portable, and the
storage or synchronization provider does not gain protocol ownership of the principal.

Business data follows the same rule: an organization can retain its source model in its own systems
and disclose only an approved Organization, Product, Service, or Opportunity View. Direct exchange is
therefore reciprocal rather than a mechanism for businesses to collect complete consumer profiles.

## Relationship to background discovery

Direct connection and federated background discovery are complementary. Direct connection begins
with a known application. Background discovery begins with an intent and searches privacy-safe catalog
references for compatible unknown counterparts. Both converge on scoped views, evidence-backed
evaluation, consent, expiry, and controlled connection.

## Wallet handshake

The portable handshake has three signed records:

1. `WalletConnectRequest` identifies the application origin, callback, purpose, requested scopes and
   operations, prohibited reuse, expiry, and a single-use nonce.
2. `WalletConsentReceipt` records the principal's approval. Its scopes and operations may only narrow
   the request, never widen it.
3. `WalletPresentation` binds the minimal Entity View and consent receipt to the exact request,
   origin, purpose, nonce, and expiry.

The receiving application verifies both signatures, its own stored challenge, audience, expiry,
purpose, scope subsets, and nonce freshness before accepting the view. It consumes the nonce
atomically. A repeated presentation fails even if its signature remains valid. Raw conversations and
provider memory are forbidden; the wire contract contains `containsRawContext: false` twice so that
both the consent and presentation boundaries fail closed.

Each Ed25519 signature covers the complete record with its `signature` member omitted, serialized
using RFC 8785 JSON Canonicalization Scheme (JCS), and encoded as UTF-8. An implementation must reject
unknown signature algorithms and must resolve the declared key through its trust policy rather than
accepting key material embedded by the requester.

## Device capability profiles

EXP defines capabilities instead of pretending every device is a permanently available server.

| Profile | Inbound federation | Background delivery | Approval UI | Standing mode |
| --- | --- | --- | --- | --- |
| Full node | Yes | Durable | Local | Native |
| Desktop wallet | No | Durable while available | Local | May delegate |
| Mobile wallet | No | OS push/wakeup | Local | Delegated gateway |
| Browser wallet | No | No guarantee | Local | Delegated gateway |
| Delegated client | No | Provider dependent | Local | Delegated gateway |

A browser or mobile wallet only needs outbound HTTPS for direct connection. It can retrieve a request
through a deep link, QR code, browser extension, or app association; show a local approval surface;
derive a minimized view; sign it with device-backed key material where available; and submit it to
the application's callback. It does not expose an inbound port. Persistent discovery is optional and
can be delegated through a revocable, purpose-limited authorization without handing the gateway the
principal's complete Entity Model.
