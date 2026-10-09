# PenPal

PenPal is an editor-only workspace for importing IJSDS manuscripts, carrying out structured editorial checks, and preparing author-approved revisions.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local`, then supply the values for your Supabase project. The local-only OpenAI setup page at `/setup` keeps a key in the running development session and does not save it to disk.

## Deploy to Vercel

Set these server-side environment variables in the Vercel project before deploying:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `PENPAL_EDITOR_EMAIL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional; defaults to `gpt-4o-mini`)

Never expose `OPENAI_API_KEY` through a `NEXT_PUBLIC_` variable.
