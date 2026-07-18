# AGENTS.md

## Project Overview

Tabula.md JSON stores encrypted point-in-time workspace snapshots for Tabula.md
Export links.

## Product Guardrails

- Store ciphertext only. The browser keeps the decryption key in the URL
  fragment.
- Keep Export links distinct from live collaboration and public publishing.
- Preserve expiration, payload limits, origin checks, and rate limits.
- Do not log complete Export URLs, keys, plaintext Markdown, credentials, or
  snapshot payloads.
- Treat snapshot routes as an internal Tabula.md compatibility contract, not a
  general publishing API.

## Commands

- Install: `npm install`
- Develop: `npm run dev`
- Test: `npm test`
- Build: `npm run build`
- Expired snapshot cleanup: `npm run cleanup:expired`
- Production smoke: `npm run smoke:production`

## Engineering Guidelines

- Keep storage drivers behind the existing storage boundary.
- Keep generated provider configuration out of version control.
- Add focused tests for storage, expiry, validation, security, and cleanup
  behavior.
- Run `npm test` and `npm run build` before submitting a service change.
