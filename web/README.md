# Deadline Copilot — Web

Next.js 16 (App Router · TypeScript · Tailwind) frontend + API routes for **Deadline Copilot**.

See the [project README](../README.md) for the full overview, architecture, and the CockroachDB / AWS tools used.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
```

Copy `.env.example` to `.env.local` and fill in CockroachDB, AWS, Bedrock, and S3 values first.

## API routes

- `POST /api/ingest` — extract deadlines from PDF / text / image, embed into CockroachDB
- `POST /api/chat` — grounded chat over agentic memory (union: personal memory + policy KB)
- `GET | PATCH /api/deadlines` — list / update deadlines

A developer test page lives at `/playground`.

## Deploy

Hosted on **AWS Amplify** (SSR / Web Compute), app root = `web/`. Environment variables are set in the Amplify console; `amplify.yml` writes them into `.env.production` at build time.
