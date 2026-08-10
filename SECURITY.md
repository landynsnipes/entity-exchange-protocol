# Security policy

EXP handles identity, employment, contact, consent, and evidence data. Treat all of it as
sensitive unless a schema explicitly classifies a field as public.

## Required controls

- Never commit credentials, session tokens, magic-link tokens, user exports, or production data.
- Enforce authentication, role checks, ownership, and organization scope in the API.
- Store only hashes of session and magic-link tokens.
- Keep contact information private until both parties approve the same introduction.
- Treat Entity Card text, GitHub content, and model output as untrusted input.
- Never let model output execute actions, change a match score, or grant consent.
- Record security-sensitive state changes in the append-only audit log.

## Reporting

Use GitHub's private vulnerability reporting for this repository. If private reporting is
unavailable, contact the repository owner through GitHub without including exploit details in a
public issue. Do not open public issues for unpatched vulnerabilities or include real personal data
in a report.
