# Tabula JSON Store

Encrypted snapshot storage for Tabula.md share links.

Service page: [json.tabula.md](https://json.tabula.md).
Source: [tabula-md/tabula-json](https://github.com/tabula-md/tabula-json).

This service backs encrypted snapshot links:

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

### `POST /api/v2/post/`

Stores an encrypted snapshot.

Write requests are CORS-limited to `TABULA_JSON_ALLOWED_ORIGINS`.

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
  "data": "https://json.tabula.md/api/v2/generated-id"
}
```

### `GET /api/v2/:id`

Returns the stored encrypted snapshot bytes.

Read requests are public because the record is ciphertext. The decryption key
stays in the `#json` fragment on `tabula.md` and is never sent to this service.

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream

<opaque encrypted bytes>
```

`/api/v1/post/` and `/api/v1/:id` remain available as compatibility aliases for
older Tabula.md clients.

## Local Development

```sh
npm install
npm run dev
```

The Node development server listens on `http://localhost:3004` by default.

Use Tabula.md with:

```sh
VITE_TABULA_JSON_URL=http://localhost:3004 npm run dev
```

## Production: App Engine + Google Cloud Storage

Production should run the Node service on Google App Engine with Google Cloud
Storage as the persistent encrypted object store.

Required environment:

```env
NODE_ENV=production
TABULA_JSON_ALLOWED_ORIGINS=https://tabula.md,https://www.tabula.md
TABULA_JSON_STORAGE_DRIVER=gcs
TABULA_JSON_GCS_BUCKET=tabula-json-prod
TABULA_JSON_GCS_PREFIX=json/
TABULA_JSON_MAX_PAYLOAD_BYTES=2097152
TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE=30
TABULA_JSON_READ_RATE_LIMIT_PER_MINUTE=600
TABULA_JSON_GLOBAL_WRITE_RATE_LIMIT_PER_MINUTE=120
TABULA_JSON_GLOBAL_READ_RATE_LIMIT_PER_MINUTE=3000
```

`app.yaml` runs on F1 automatic scaling with `min_instances: 0` and
`max_instances: 3`. This keeps idle cost low, caps runaway scale, and still
lets short share-link bursts start additional instances. Snapshot creation is
rate-limited more tightly than snapshot reads because writes create durable GCS
objects.

The service uses Google Application Default Credentials. For App Engine, grant
the App Engine default service account or the configured app service account
object read/write access to the bucket. For local production testing,
authenticate with `gcloud auth application-default login` or set
`GOOGLE_APPLICATION_CREDENTIALS` to a service account key file.

Build and run:

```sh
npm run build
npm start
```

App Engine deploy:

```sh
GOOGLE_CLOUD_PROJECT=tabula-md-prod npm run deploy
npm run smoke:production
```

Attach `json.tabula.md` to the App Engine service through the chosen DNS
provider or load balancer.

## Retention and Abuse Controls

Share links are intended to be durable. Production buckets should not expire
objects unless the product explicitly changes the share-link contract.

The service applies per-instance IP and global rate limits for snapshot writes
and reads. These are cost and abuse guardrails, not account-level product
policy. For larger launches, add edge or load-balancer rate limiting in front of
`json.tabula.md` so distributed abuse is stopped before it reaches App Engine.

## Node Self-hosting

The Node/Express server remains available for local development and simple
self-hosting:

```env
PORT=3004
TABULA_JSON_ALLOWED_ORIGINS=https://tabula.md
TABULA_JSON_STORAGE_DRIVER=file
TABULA_JSON_DATA_DIR=/data
TABULA_JSON_MAX_PAYLOAD_BYTES=2097152
TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE=30
TABULA_JSON_READ_RATE_LIMIT_PER_MINUTE=600
```

For Node production, `TABULA_JSON_STORAGE_DRIVER` is required. Supported
drivers:

- `file`: stores records under `TABULA_JSON_DATA_DIR`.
- `gcs`: stores records in Google Cloud Storage.

## Deployment Checklist

1. Create a private Google Cloud Storage bucket, for example
   `tabula-json-prod`.
2. Create or choose a service account for the JSON service.
3. Grant that service account object read/write access to the bucket.
4. Confirm `app.yaml` points at the production bucket and allowed origins.
5. Deploy this Node service with `GOOGLE_CLOUD_PROJECT=tabula-md-prod npm run deploy`.
6. Attach `json.tabula.md` to the App Engine service.
7. Run `npm run smoke:production`.
8. Set `VITE_TABULA_JSON_URL=https://json.tabula.md` on the Tabula.md web app.
9. Redeploy Tabula.md.
10. Run a share-link round trip against `https://tabula.md`.
