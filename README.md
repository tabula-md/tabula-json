# Tabula JSON Store

Encrypted snapshot storage for [Tabula.md](https://tabula.md) share links.

Service: [json.tabula.md](https://json.tabula.md) · Source:
[tabula-md/tabula-json](https://github.com/tabula-md/tabula-json)

This service stores encrypted snapshot blobs for links like:

```text
https://tabula.md/#json=<jsonId>,<decryptionKey>
```

The Tabula.md browser client serializes and encrypts a workspace snapshot before
uploading it. The decryption key stays after `#` in the Tabula.md URL and is
not sent to this service.

Tabula JSON Store is not the live collaboration server. `tabula-room` relays
real-time editing updates; `tabula-json` stores encrypted snapshots that can be
opened later through the replace/import flow.

## Protocol

### `POST /api/v2/post/`

Stores an encrypted snapshot.

Write requests are CORS-limited to `TABULA_JSON_ALLOWED_ORIGINS`.
Snapshots expire after the configured retention window. The default is 7 days.

Request:

```http
POST /api/v2/post/
Content-Type: application/octet-stream

<opaque encrypted bytes>
```

Response:

```json
{
  "id": "generated-id",
  "data": "https://json.tabula.md/api/v2/generated-id",
  "expiresAt": "2026-10-01T00:00:00.000Z"
}
```

### `GET /api/v2/:id`

Returns the stored encrypted snapshot bytes.

Read requests are public because stored records are ciphertext. The decryption
key stays in the `#json` fragment on `tabula.md` and is never sent to this
service.

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream

<opaque encrypted bytes>
```

If the id does not exist, the service returns `404`.
Expired snapshots also return `404`.

### `GET /health`

Returns service health.

`/api/v1/post/` and `/api/v1/:id` remain available as compatibility aliases for
older Tabula.md clients.

## Development

```sh
npm install
npm run dev
```

The development server listens on `http://localhost:3004` by default.

Run Tabula.md against a local JSON store with:

```sh
VITE_TABULA_JSON_URL=http://localhost:3004 npm run dev
```

## Self-Hosting

Run Tabula JSON Store as a Node service behind a TLS-capable edge. The service
can store encrypted blobs in object storage or on a local filesystem.

Example object-storage configuration:

```env
NODE_ENV=production
TABULA_JSON_ALLOWED_ORIGINS=https://app.example.com
TABULA_JSON_STORAGE_DRIVER=gcs
TABULA_JSON_GCS_BUCKET=your-private-snapshot-bucket
TABULA_JSON_GCS_PREFIX=json/
TABULA_JSON_MAX_PAYLOAD_BYTES=2097152
TABULA_JSON_RETENTION_DAYS=7
TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE=30
TABULA_JSON_READ_RATE_LIMIT_PER_MINUTE=600
TABULA_JSON_GLOBAL_WRITE_RATE_LIMIT_PER_MINUTE=120
TABULA_JSON_GLOBAL_READ_RATE_LIMIT_PER_MINUTE=3000
```

Provider-specific project ids, credentials, DNS, and rollout commands belong
outside the public repository.

## Storage Drivers

`TABULA_JSON_STORAGE_DRIVER` is required outside development.

- `gcs`: stores records in Google Cloud Storage.
- `file`: stores records under `TABULA_JSON_DATA_DIR` for local or simple
  self-hosted deployments.

Example self-hosted file configuration:

```env
PORT=3004
TABULA_JSON_ALLOWED_ORIGINS=https://tabula.md
TABULA_JSON_STORAGE_DRIVER=file
TABULA_JSON_DATA_DIR=/data
TABULA_JSON_MAX_PAYLOAD_BYTES=2097152
TABULA_JSON_RETENTION_DAYS=7
TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE=30
TABULA_JSON_READ_RATE_LIMIT_PER_MINUTE=600
```

## Retention and Abuse Controls

Share links are intended for handoff, not permanent publishing. The default
retention window is 7 days. Set `TABULA_JSON_RETENTION_DAYS` to choose a
different window, and configure the backing object store lifecycle to delete
objects after the same period.

The service applies per-instance IP and global rate limits for snapshot writes
and reads. These are cost and abuse guardrails, not account-level product
policy. For larger launches, add edge or load-balancer rate limiting before
requests reach this service.

## Validation

```sh
npm test
npm run build
```

## Backed By

Tabula JSON Store is backed by
[Marker Inc Korea](https://github.com/Marker-Inc-Korea).

## License

MIT. See `LICENSE`.
