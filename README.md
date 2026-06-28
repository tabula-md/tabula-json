# Tabula JSON Store

Encrypted snapshot storage for Tabula.md share links.

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

### `POST /v1/json`

Stores an encrypted snapshot.

Write requests are CORS-limited to `TABULA_JSON_ALLOWED_ORIGINS`.

Request:

```http
POST /v1/json
Content-Type: application/octet-stream

<opaque encrypted bytes>
```

Response:

```json
{
  "jsonId": "generated-id",
  "createdAt": "2026-06-28T00:00:00.000Z"
}
```

### `GET /v1/json/:jsonId`

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

The service listens on `http://localhost:3004` by default.

Use Tabula.md with:

```sh
VITE_TABULA_JSON_URL=http://localhost:3004 npm run dev
```

## Production Environment

```env
PORT=3004
TABULA_JSON_ALLOWED_ORIGINS=https://tabula.md
TABULA_JSON_STORAGE_DRIVER=r2
TABULA_JSON_R2_ACCOUNT_ID=<cloudflare-account-id>
TABULA_JSON_R2_BUCKET=tabula-json
TABULA_JSON_R2_ACCESS_KEY_ID=<r2-access-key-id>
TABULA_JSON_R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
TABULA_JSON_R2_PREFIX=json/
TABULA_JSON_DATA_DIR=/data
TABULA_JSON_MAX_PAYLOAD_BYTES=2097152
TABULA_JSON_RATE_LIMIT_PER_MINUTE=120
```

Storage drivers:

- `file`: local development and simple self-hosting. Stores records under
  `TABULA_JSON_DATA_DIR`.
- `r2`: production storage through Cloudflare R2's S3-compatible API.

For production, deploy this service behind `https://json.tabula.md`.

## Retention and Abuse Controls

Share links are intended to be durable. Production buckets should not expire
objects unless the product explicitly changes the share-link contract.

`TABULA_JSON_RATE_LIMIT_PER_MINUTE` is a best-effort per-process limit. Use
Cloudflare DNS proxy, WAF, and rate limiting in front of `json.tabula.md` for
real abuse protection.

## Deployment Checklist

1. Create a Cloudflare R2 bucket, for example `tabula-json`.
2. Create an R2 access key with read/write access to that bucket.
3. Deploy this service with `TABULA_JSON_STORAGE_DRIVER=r2`.
4. Set `TABULA_JSON_ALLOWED_ORIGINS=https://tabula.md`.
5. Point `json.tabula.md` at the service.
6. Set `VITE_TABULA_JSON_URL=https://json.tabula.md` on the Tabula.md web app.
7. Run `curl -fsS https://json.tabula.md/health`.
