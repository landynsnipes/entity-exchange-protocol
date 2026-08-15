# EXP portability and device model

EXP is a wire protocol and data-contract family, not one operating-system runtime. A conforming
implementation may be written in any language and run on any platform that can provide the required
security and networking capabilities. Interoperability is determined by schemas, canonical signed
messages, authorization, consent, lifecycle behavior, and conformance tests—not by the device brand,
operating system, AI model, or storage provider.

## Required implementation capabilities

An operated EXP node or wallet needs:

- standards-compliant JSON and HTTPS;
- Ed25519 signing and verification, or a future versioned algorithm profile;
- secure private-key storage appropriate to the platform;
- a clock accurate enough to enforce signature and consent expiry;
- durable storage for grants, decisions, replay nonces, audit lineage, and pending delivery;
- an authenticated local-control surface for the principal or its authorized agent;
- bounded request, response, retry, and peer-cardinality controls.

The protocol does not require PostgreSQL, Node.js, Python, Docker, a public IP address, one cloud,
one model provider, or one central EXP database.

## Practical platform paths

| Platform | Expected EXP form | Current status |
| --- | --- | --- |
| Linux, Windows, macOS | Local wallet, desktop service, CLI, or hosted gateway | Protocol-compatible; the Python adapter is portable where Python 3 and its two dependencies are available |
| iOS and Android | Native wallet using Keychain/Keystore, with background work delegated to OS scheduling or a chosen gateway | Swift and Android source packages exist; Apple/Android toolchain and device lifecycle verification remain pending |
| Web browser | Web wallet using WebCrypto where supported, passkeys or platform keys, and a service worker or paired gateway | WebCrypto/fetch adapter builds and passes signing and pinned-verification tests; installable browser extension UX remains product work |
| Servers and private clouds | Long-running gateway using managed keys, durable storage, TLS, monitoring, and backups | TypeScript protocol implementation exists; production fleet controls remain incomplete |
| Constrained or intermittently connected devices | Thin client delegating standing operation to a principal-selected gateway | Supported through delegation; a device is not expected to remain online continuously |

## Important limitations

- Mobile operating systems suspend background processes, so continuous standing discovery normally
  requires push notifications, OS background scheduling, or a gateway selected by the principal.
- Browsers cannot safely expose a permanent inbound federation listener and have restricted key and
  storage APIs. A browser wallet will usually pair with a gateway while retaining consent control.
- The current Python adapter uses an atomic JSON file and environment/configuration-provided keys. A
  production app must use platform secure storage and production-grade backup/recovery.
- External federation requires HTTPS. Plain HTTP is accepted only for explicit loopback tests.
- Portability does not mean copying every private attribute to every device. Synchronization remains
  provider-selected, encrypted, scoped, revocable, and controlled by the principal.

## Portability acceptance direction

EXP v0.1 should ship language-neutral fixtures and runners, at least two independent implementations,
and published profiles for server, desktop, mobile-wallet, and browser-gateway capability levels.
Conformance claims must state the supported level rather than implying that every device implements a
full always-online federation server.
