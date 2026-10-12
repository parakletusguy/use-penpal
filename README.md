# PenPal

PenPal is an editor-only workspace for importing IJSDS manuscripts, carrying out structured editorial checks, verifying bibliographic records, and preparing editor-approved revisions.

## Editorial safeguards

- Source `.docx` files are copied to a private workspace. The original Drive file is never changed.
- The IJSDS technical profile makes deterministic preparation checks from extracted text: abstract and keyword limits, numbered sections, acknowledgement placement, and reference-list structure. It is not an acceptance decision or a substitute for the journal's full submission review.
- Citation verification is a separate, evidence-preserving run. PenPal parses references, queries Crossref and OpenAlex only with bibliographic data, compares returned metadata, and reconciles identifiable author–year citations. It never inserts, replaces, or silently corrects a citation.
- Every proposed edit requires an explicit editor approval or rejection before a revised `.docx` can be made. Author queries stay in the editorial record rather than becoming manuscript text.
- Each manuscript has a downloadable editorial record containing the review, decisions, reference-verification evidence, and audit events.
- Revised files can be uploaded to a dedicated Google Drive output folder. When an older revised `.docx` in that folder has the exact same name, PenPal replaces that output in place; it never overwrites or moves the original Drive source. A new Drive output requires an IJSDS Shared Drive folder; a personal Drive folder can only be used to replace its existing matching outputs.

The technical profile reflects the publicly available [IJSDS author guide](https://pop.isdsnet.com/ijds-guide.html), currently covering its machine-checkable requirements. Keep the profile under editorial review if the journal updates its guide.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local`, then supply the values for your Supabase project. The local-only OpenAI setup page at `/setup` keeps a key in the running development session and does not save it to disk.

Apply every migration in `supabase/migrations/` to the intended Supabase project before running the app. The citation-verification migration adds its private evidence tables, ownership checks, and audit-event insert policy.

## Deploy to Vercel

Set these server-side environment variables in the Vercel project before deploying:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `PENPAL_EDITOR_EMAIL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional; defaults to `gpt-4o-mini`)
- `CROSSREF_MAILTO` (recommended for polite Crossref metadata lookups)
- `PENPAL_DRIVE_OUTPUT_FOLDER_ID` and `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` (optional server-only configuration for Drive delivery; share only the output folder with that service account, and use an IJSDS Shared Drive folder when the app needs to create a new file)

Never expose `OPENAI_API_KEY` through a `NEXT_PUBLIC_` variable.
