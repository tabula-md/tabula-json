# Tabula JSON

Encrypted JSON share-link storage for Tabula.md.

This service backs Excalidraw-style read-only links:

```text
https://tabula.md/#json=<jsonId>,<decryptionKey>
```

The browser encrypts the Markdown snapshot before upload. The service stores
only the encrypted payload and IV. The decryption key stays after `#` in the
Tabula.md URL and is not sent to this service.

## API

### `GET /health`

Returns service health.

### `POST /v1/json`

Stores an encrypted snapshot.

Request:

```json
{
  "encryptedData": "base64url-ciphertext",
  "iv": "base64url-iv"
}
```

Response:

```json
{
  "jsonId": "generated-id",
  "createdAt": "2026-06-28T00:00:00.000Z"
}
```

### `GET /v1/json/:jsonId`

Returns the encrypted snapshot record.

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
TABULA_JSON_DATA_DIR=/data
TABULA_JSON_MAX_PAYLOAD_BYTES=1048576
TABULA_JSON_RATE_LIMIT_PER_MINUTE=120
```

For production, deploy this service behind `https://json.tabula.md`.
