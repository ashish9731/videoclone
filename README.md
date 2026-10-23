# Cutroom — browser video editor

A full multi-track video editor that runs in the browser: timeline
editing, keyframes, transitions, effects, caption lanes (SRT/VTT import, manual
cues, per-line retiming) and MP4 export via WebCodecs. Projects and media persist
to Supabase (Postgres + private storage); video encoding happens client-side with
[mediabunny](https://mediabunny.dev). Features that need a hosted model — speech
to text, caption translation, AI portrait effects, the talking avatar — are wired
but locked: `src/lib/pro-gate.ts` answers any attempt with "coming soon in the Pro
version" (see `PRO_AVAILABLE`).

## Stack

- TanStack Start (React 19 + TypeScript, Vite, Nitro server build)
- Tailwind CSS 4 + shadcn/ui (Radix primitives)
- Supabase: auth sessions (anonymous by default), `projects` / `media_assets` /
  `caption_tracks` tables, private `media` storage bucket
- WebCodecs (mediabunny) for in-browser export; MediaPipe for on-device effects
- OpenAI-compatible API (optional) for transcription and caption translation

## Local development

Requires Node.js 20+ ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
git clone <repository-url>
cd videoclone
npm install
cp .env.example .env   # fill in your Supabase values
npm run dev
```

### Environment variables

| Variable                                              | Purpose                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser Supabase client                                                                       |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`           | Server-side Supabase client                                                                   |
| `OPENAI_API_KEY`                                      | Transcription + caption translation — Pro-only paths, unreachable while `pro-gate` locks them |
| `AI_API_BASE_URL`                                     | Optional: any OpenAI-compatible endpoint (default `https://api.openai.com/v1`)                |
| `AI_MODEL` / `AI_TRANSCRIBE_MODEL`                    | Optional: chat / transcription model names                                                    |
| `DB_MIGRATION_URL`                                    | Drizzle kit migrations (direct DB connection string)                                          |
| `VITE_DEMO_AUTH_EMAIL` / `VITE_DEMO_AUTH_PASSWORD`    | Optional fallback sign-in when Supabase anonymous sign-in is off                              |

There is no login screen: visitors get a silent Supabase session (anonymous
sign-in). Enable it in **Supabase → Authentication → Providers → Anonymous**,
or provide the demo credentials above.

### Database

Apply the schema with `npx drizzle-kit push` (or commit + migrate via
`drizzle/migrations`). Row-level security scopes every table and storage object
to the authenticated user.

## Scripts

```sh
npm run dev       # vite dev server
npm run build     # production build (client + nitro server)
npm run preview   # serve the production build
npm run test      # vitest (engine + interaction tests)
npm run lint      # eslint
```

## Architecture

See `AGENTS.md` for the engine/module rules and `roadmap.md` for feature status.
