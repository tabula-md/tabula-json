# AGENTS.md

## Project Overview

Tabula JSON is the encrypted read-only share-link storage service for
Tabula.md. It stores ciphertext for `#json=<id>,<key>` links.

## Boundaries

- Keep this service separate from Tabula Publish.
- Do not add plaintext publish pages, `/p/:id`, `llms.txt`, collaboration room
  relay, accounts, billing, analytics, or custom domain management here.
- The service must never receive or store URL fragment keys.
- The service must never accept Markdown plaintext, file arrays, room IDs,
  room keys, or publish owner tokens.

## Commands

- Install: `npm install`
- Dev: `npm run dev`
- Test: `npm test`
- Build: `npm run build`
- Production smoke: `npm run smoke:production`

## Repository Map

- `src/server.ts`: Node/Express service for local development and self-hosting.
- `src/protocol.ts`: encrypted JSON payload and ID validation.
- `src/storage/file-store.ts`: local encrypted record persistence.
- `src/storage/gcs-store.ts`: Google Cloud Storage encrypted object
  persistence.
- `test`: protocol and server tests.
