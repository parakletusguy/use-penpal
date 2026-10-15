# PenPal Product Refactor Plan

## Product split

PenPal now separates the protected IJSDS editorial pilot from an author-owned pre-submission studio. The IJSDS workspace retains its consent-led, editor-only technical-preparation boundary. Author projects have distinct permissions, source records, and audit events.

## Phase 1 — Safe foundation (implemented)

- Owner-scoped projects, source ledger, research plans, readiness checks, and audit events.
- Explicit author approval before a source is eligible for future grounded drafting.
- A generic readiness checklist that does not score quality or predict acceptance.
- No external discovery or prose generation in this release.

## Phase 2 — Evidence ingestion and discovery

Add a server-only, provider-specific discovery adapter; retain provider identifiers and retrieval timestamps; require author approval before a result becomes grounded context; and do not send unpublished manuscript wording to discovery services.

## Phase 3 — Grounded drafting

Revalidate ownership and approved sources for every drafting request. Require source locators for factual assertions, return an insufficiency state where evidence is missing, and retain every generated suggestion and author decision in the audit trail.

## Phase 4 — Journal-specific profiles

Add versioned, reviewed profiles with effective dates and source links. Present evidence-backed preparation items only—never a Q1/Q2 score or an acceptance prediction. IJSDS remains isolated unless its editorial team deliberately changes its profile.
