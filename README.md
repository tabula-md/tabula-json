# Tabula JSON Store

Encrypted snapshot storage for [Tabula.md](https://tabula.md) share links.

Service: [json.tabula.md](https://json.tabula.md) · Source:
[tabula-md/tabula-json](https://github.com/tabula-md/tabula-json)

This service stores immutable encrypted snapshot blobs for links like:

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

Read requests are public because stored records are ciphertext. The decryption
key stays in the `#json` fragment on `tabula.md` and is never sent to this
service.

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream

<opaque encrypted bytes>
```

If the id does not exist, the service returns `404`.

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

## Production

The hosted v0 deployment runs the Node service on Google App Engine with Google
Cloud Storage as the persistent encrypted object store.

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

`app.yaml` uses F1 automatic scaling with `min_instances: 0` and
`max_instances: 3`. That keeps idle cost low, caps runaway scale, and still
allows short share-link bursts to start extra instances. Snapshot creation is
rate-limited more tightly than snapshot reads because writes create durable GCS
objects.

Deploy:

```sh
GOOGLE_CLOUD_PROJECT=tabula-md-prod npm run deploy
TABULA_JSON_SMOKE_URL=https://json.tabula.md npm run smoke:production
```

### GitHub Actions Production Deploy

Merges to `main` deploy through `.github/workflows/deploy.yml`. Pull requests
run install, test, and build only; production credentials are only requested by
the `production` environment deploy job after code has landed on `main`.

Use GitHub OIDC with Google Workload Identity Federation instead of a long-lived
service account JSON key. Configure these GitHub Environment variables on the
`production` environment:

| Variable | Value |
| --- | --- |
| `GCP_PROJECT_ID` | `tabula-md-prod` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity Provider resource name. |
| `GCP_SERVICE_ACCOUNT` | Deploy service account email. |
| `TABULA_JSON_SMOKE_URL` | `https://json.tabula.md` |
| `TABULA_JSON_SMOKE_ORIGIN` | `https://tabula.md` |

The deploy service account should be scoped to this project and should only
have the permissions needed to deploy the App Engine service and write/read the
private snapshot bucket used by `app.yaml`.

The service uses Google Application Default Credentials. On App Engine, grant
the App Engine service account object read/write access to the private GCS
bucket. For local production testing, use `gcloud auth application-default
login` or set `GOOGLE_APPLICATION_CREDENTIALS`.

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
TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE=30
TABULA_JSON_READ_RATE_LIMIT_PER_MINUTE=600
```

## Retention and Abuse Controls

Share links are intended to be durable. Production buckets should not expire
objects unless the product explicitly changes the share-link contract.

The service applies per-instance IP and global rate limits for snapshot writes
and reads. These are cost and abuse guardrails, not account-level product
policy. For larger launches, add edge or load-balancer rate limiting in front of
`json.tabula.md` so distributed abuse is stopped before it reaches App Engine.

## Deployment Checklist

1. Create a private Google Cloud Storage bucket.
2. Grant the App Engine service account object read/write access to the bucket.
3. Confirm `app.yaml` points at the production bucket and allowed origins.
4. Deploy with `GOOGLE_CLOUD_PROJECT=tabula-md-prod npm run deploy`.
5. Attach `json.tabula.md` to the App Engine service.
6. Run `TABULA_JSON_SMOKE_URL=https://json.tabula.md npm run smoke:production`.
7. Set `VITE_TABULA_JSON_URL=https://json.tabula.md` on the Tabula.md web app.
8. Redeploy Tabula.md and run a share-link round trip.

## Backed By

Tabula JSON Store is backed by
[Marker Inc Korea](https://github.com/Marker-Inc-Korea).

## License

MIT. See `LICENSE`.
