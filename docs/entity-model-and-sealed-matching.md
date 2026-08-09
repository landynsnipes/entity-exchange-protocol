# Entity Models, Views, and sealed matching

## Portable source model

An Entity Model is the principal-controlled source for confirmed attributes, preferences, claims,
evidence references, classification, provenance, and expiry. It is independent of any one model
provider. AI systems may suggest updates, but unconfirmed suggestions cannot enter a purpose-specific
Entity View.

## Purpose-specific views

An Entity View is generated from an explicitly approved definition. Rules select namespaces and
mark them public, consented, sealed, or omitted. Omission is the mandatory default. The most-specific
namespace rule wins, making narrow denials stronger than broad profile permissions.

One model can generate Career, Commerce, Friendship, and Relationship Views without allowing data
from one namespace to appear in another. View definitions expire and are separate from standing
discovery authorizations.

## Sealed values

A sealed view attribute carries a commitment rather than plaintext. Plaintext matching material is
provided to an authorized matcher through a separate private channel and is bound to the view,
purpose, matcher, and expiry. Evaluation findings can report satisfied, not satisfied, or unknown,
but cannot reproduce sealed values.

The draft reference matcher is a trusted matcher, not a cryptographic privacy proof. Future
implementations may replace that trust boundary with client-side evaluation, confidential-computing
enclaves, private set intersection, secure multiparty computation, or zero-knowledge mechanisms.
Those mechanisms must preserve the same public contracts and result restrictions.

## Reciprocal evaluation

Reciprocal evaluation applies the subject's intent to the object's authorized view and the object's
intent to the subject's authorized view. Required unknown or conflicting criteria prevent eligibility.
Results preserve both intents, both view snapshots, rule version, confidence, missing-information
count, expiry, and decision trace. Evaluation never creates a connection; independent approval remains
mandatory.

## Standing discovery

Standing discovery authorizes only bounded projection, discovery, evaluation, and notification.
It does not authorize identity disclosure, contact, application, purchase, booking, or other domain
execution. Authorizations are purpose-bound, rate-limited by result count, expiring, and revocable.
