# Tabula JSON Store

Encrypted snapshot storage for Tabula.md share links.

Service page: [json.tabula.md](https://json.tabula.md).
Source: [tabula-md/tabula-json](https://github.com/tabula-md/tabula-json).

This service backs Excalidraw-style snapshot links:

```text
https://tabula.md/#json=<jsonId>,<decryptionKey>
```

The browser serializes and encrypts a Tabula.md workspace snapshot before
upload. This service stores only an opaque encrypted blob. The decryption key
stays after `#` in the Tabula.md URL and is not sent to this service.

Tabula JSON Store is not the live collaboration server. `tabula-room` relays
real-time editing updates. `tabula-json` stores encrypted read-only snapshots
that can be opened later as a replace/import flow.

## API

### `GET /health`

Returns service health.

### `POST /api/v1/post/`

Stores an encrypted snapshot.

Write requests are CORS-limited to `TABULA_JSON_ALLOWED_ORIGINS`.

Request:

```http
POST /api/v1/post/
Content-Type: application/octet-stream

<opaque encrypted bytes>
```

Response:

```json
{
  "id": "generated-id",
  "data": "https://json.tabula.md/api/v1/generated-id",
  "createdAt": "2026-06-28T00:00:00.000Z"
}
```

### `GET /api/v1/:id`

Returns the stored encrypted snapshot bytes.

Read requests are public because the record is ciphertext. The decryption key
stays in the `#json` fragment on `tabula.md` and is never sent to this service.

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream

<opaque encrypted bytes>
```

## Local Development

```sh
npm install
npm run dev
```

The Node development server listens on `http://localhost:3004` by default.
To run the Cloudflare Worker locally:

```sh
npm run dev:worker
```

Use Tabula.md with:

```sh
VITE_TABULA_JSON_URL=http://localhost:3004 npm run dev
```

## Production: Cloudflare Worker + R2

Production should run as a Cloudflare Worker with an R2 bucket binding. The
Worker uses the `SNAPSHOTS` R2 binding directly, so no R2 access key or S3
compatibility secret is needed in production.

`wrangler.jsonc` defines:

- Worker name: `tabula-json`
- R2 binding: `SNAPSHOTS`
- Bucket name: `tabula-json`
- Allowed origins: `https://tabula.md,https://www.tabula.md`
- Max payload: `2097152` bytes

Deploy:

```sh
npm run deploy:dry-run
npm run deploy
npm run smoke:production
```

Attach `json.tabula.md` as a Worker custom domain in Cloudflare.

## Retention and Abuse Controls

Share links are intended to be durable. Production buckets should not expire
objects unless the product explicitly changes the share-link contract.

Use Cloudflare WAF and rate limiting in front of `json.tabula.md` for abuse
protection. Do not implement product policy in this opaque store.

## Node Self-hosting

The Node/Express server remains available for local development and simple
self-hosting:

```env
PORT=3004
TABULA_JSON_ALLOWED_ORIGINS=https://tabula.md
TABULA_JSON_STORAGE_DRIVER=file
TABULA_JSON_DATA_DIR=/data
TABULA_JSON_MAX_PAYLOAD_BYTES=2097152
```

For Node production, `TABULA_JSON_STORAGE_DRIVER` is required. Supported
drivers:

- `file`: stores records under `TABULA_JSON_DATA_DIR`.
- `r2`: uses Cloudflare R2's S3-compatible API for hosts that are not running
  on Cloudflare Workers.

## Deployment Checklist

1. Create a Cloudflare R2 bucket, for example `tabula-json`.
2. Run `npm run typegen` after changing `wrangler.jsonc`.
3. Run `npm run deploy:dry-run`.
4. Deploy this Worker with `npm run deploy`.
5. Attach `json.tabula.md` to the Worker.
6. Run `npm run smoke:production`.
7. Set `VITE_TABULA_JSON_URL=https://json.tabula.md` on the Tabula.md web app.
8. Redeploy Tabula.md.
9. Run a share-link round trip against `https://tabula.md`.
