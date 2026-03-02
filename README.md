# Readium WCP Demo

This repository contains both components of the Readium Web reader demo:

## Structure

```
/server     — Readium CLI publication server (deployed on Railway)
/frontend   — Readium Playground web reader (deployed on Vercel)
```

## Server (`/server`)

The Readium CLI Go-based publication server. Serves EPUB files as Readium Web Publications.

- **Live URL:** https://manus-wcp-production.up.railway.app
- **Deployed on:** Railway (auto-deploys from this repo on push to `master`)
- **Root directory in Railway:** `server`

## Frontend (`/frontend`)

The Readium Playground Next.js web reader (Thorium Web), built on the `ts-toolkit`.

- **Live URL:** https://readium-playground.vercel.app
- **Password:** Eden2026!
- **Deployed on:** Vercel (auto-deploys from this repo on push to `master`)
- **Root directory in Vercel:** `frontend`

## Adding EPUBs

To add a new EPUB to the library:
1. Place the `.epub` file in `/server/epubs/`
2. Add the book entry to `/frontend/src/config/publications.ts`
3. Add the book card to the books array in `/frontend/src/app/page.tsx`
4. Push to `master` — both services will redeploy automatically
