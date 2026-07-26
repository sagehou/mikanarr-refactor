# Upgrade and migration notes

## Current deployment contract

Use `docker compose` from the repository root with configuration in root `.env` and the GHCR image in `docker-compose.yml`:

```bash
cp .env.example .env
docker compose pull
docker compose up -d --wait
```

The application owns a named `mikanarr-data` volume mounted at `/app/data`. It is initialized for the non-root `node` user. The default host binding is loopback; use a TLS reverse proxy for ordinary access. Only set `BIND_ADDRESS=0.0.0.0` for consciously exposed, firewall-protected LAN use. Keep `COOKIE_SECURE=true` behind TLS; `false` is for local HTTP development/testing only.

## Migrate a legacy `./data` bind mount

Do this before starting the new deployment in production. The sequence first requires the legacy database, stops and removes the old Compose service without deleting volumes, and only then archives and copies the quiesced SQLite files. It creates the new Compose volume without starting the application, refuses to copy into a non-empty destination, and restores `node:node` ownership.

```bash
(
set -eu

# From the repository root, with the old ./data bind directory still present.
test -f ./data/database.sqlite

# Quiesce the legacy SQLite writer. Do not add -v: existing volumes must survive.
docker compose down
test -f ./data/database.sqlite

# Back up the stopped legacy data before creating or copying into the new volume.
mkdir -p backups
backup="backups/legacy-data-before-volume-$(date +%Y%m%d-%H%M%S).tar.gz"
test ! -e "$backup"
tar -C ./data -czf "$backup" .

# Ensure root .env is ready. None of the following commands starts the application writer.
test -f .env || cp .env.example .env
docker compose pull
docker compose create mikanarr
docker compose run --rm --no-deps --user root -v "$PWD/data:/legacy:ro" --entrypoint sh mikanarr -c 'set -eu; test -f /legacy/database.sqlite; test -z "$(find /app/data -mindepth 1 -maxdepth 1 -print -quit)"; for name in database.sqlite database.sqlite-wal database.sqlite-shm jwt.key jwt.key.pub; do if [ -e "/legacy/$name" ]; then cp -p "/legacy/$name" "/app/data/$name"; fi; done; chown -R node:node /app/data'
docker compose up -d --wait
)
```

Do not restart the legacy service between `docker compose down` and the copy step; that would make the archive and copied SQLite state diverge. Keep the archive until the upgraded instance has been verified. Do not rerun the copy command against an existing populated volume: its empty-destination check is intentional. If a migration must be retried, stop the service and make a fresh named-volume backup as described in [README.md](README.md) before deciding how to restore it. None of the migration commands deletes the source directory or a volume.

## Authentication migration

Local authentication now requires the complete `ADMIN_USERNAME`/`ADMIN_PASSWORD` pair. Sessions are HttpOnly cookies, so remove expectations of browser-stored or `Authorization: Bearer` login tokens.

OIDC now uses issuer discovery. Replace legacy `OIDC_AUTH_URL` and `OIDC_TOKEN_URL` with the following complete configuration; the legacy variables are rejected at startup:

```env
OIDC_ISSUER=https://auth.example.com/application/o/mikanarr/
OIDC_CLIENT_ID=mikanarr
OIDC_CLIENT_SECRET=replace_me
OIDC_REDIRECT_URI=https://mikanarr.example.com/auth/oidc/callback
OIDC_ALLOWED_SUBJECTS=alice-subject,bob-subject
# Or authorize a group: OIDC_REQUIRED_GROUP=mikanarr-users
# Optional group-claim name (default: groups): OIDC_GROUPS_CLAIM=groups
```

OIDC needs all four issuer/client/secret/redirect values and at least one allowed subject or group rule. The issuer/redirect must be HTTPS in production.

## Rotate exposed credentials

Never publish Mikan feed URLs/tokens, Sonarr keys, `.env`, database archives, or JWT private keys. For an exposure, revoke/regenerate the Mikan feed token and update the matching pattern; issue a new Sonarr API key and update root `.env`; then back up and regenerate `/app/data/jwt.key` plus `/app/data/jwt.key.pub` following [README.md](README.md). JWT-key regeneration invalidates all sessions.
