<p align="center">
  <a href="https://tabula.md">
    <img src="https://tabula.md/favicon.svg" alt="Tabula.md" width="56" />
  </a>
</p>

# Tabula.md JSON

Encrypted snapshot storage for [Tabula.md](https://tabula.md) share links.

> This repository is for operators who self-host Tabula.md infrastructure. You
> do not need to run it to use Tabula.md.

Tabula.md JSON stores encrypted `#json` snapshots for later import. The browser
encrypts a workspace before upload; the decryption key stays in the URL fragment
and never reaches this service. It is not the live collaboration server.

## Self-host

Run the service behind a TLS-capable edge with either Google Cloud Storage or a
local filesystem driver:

```sh
npm ci
npm run build

TABULA_JSON_ALLOWED_ORIGINS=https://app.example.com \
TABULA_JSON_STORAGE_DRIVER=file \
TABULA_JSON_DATA_DIR=/data \
PORT=3004 \
npm start
```

Point a Tabula.md app checkout at the service:

```sh
VITE_TABULA_JSON_URL=https://json.example.com npm run dev
```

See `.env.example` for payload, retention, rate-limit, and object-storage
configuration.

## Retention

Snapshots are for handoff, not permanent publishing. They expire after seven
days by default; set `TABULA_JSON_RETENTION_DAYS` for a different window.
Expired snapshots are not served. Run `npm run cleanup:expired` periodically for
storage drivers that support deletion, and set matching lifecycle rules in an
object store.

## Operations

- `GET /` reports service metadata and the health-check path.
- `GET /health` reports service health and version.

The snapshot HTTP routes are a compatibility contract for the Tabula.md client,
not a supported third-party publishing API.

## Development

```sh
npm install
npm run dev

npm test
npm run build
```

## Backed By

Tabula.md JSON is backed by
[Marker Inc Korea](https://github.com/Marker-Inc-Korea).

## License

MIT. See `LICENSE`.
