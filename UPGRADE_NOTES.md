# Upgrade and migration notes

## Current deployment contract

Use `docker compose` from the repository root with configuration in root `.env` and the GHCR image in `docker-compose.yml`. For production, set `IMAGE_NAME` to an existing release or commit-SHA tag instead of relying on mutable `latest`, and make the documented data backup before pulling an upgrade:

```bash
cp .env.example .env
# Edit .env before starting: configure a real local login pair or complete OIDC.
docker compose pull
docker compose up -d --wait
```

The application owns a named `mikanarr-data` volume mounted at `/app/data`. It is initialized for the non-root `node` user. The default host binding is loopback; use a TLS reverse proxy for ordinary access. Only set `BIND_ADDRESS=0.0.0.0` for consciously exposed, firewall-protected LAN use. Keep `COOKIE_SECURE=true` behind TLS; `false` is for local HTTP development/testing only.

## Back up and restore `mikanarr-data`

Back up the named volume while the application is stopped so the SQLite files are consistent. The service is started again automatically when the backup command exits, including on failure:

```bash
(
set -eu
umask 077
mkdir -p backups
backup="backups/mikanarr-data-$(date +%Y%m%d-%H%M%S).tar.gz"
trap 'docker compose up -d --wait' EXIT
docker compose stop mikanarr
( set -C; docker compose run --rm --no-deps --entrypoint sh mikanarr -c 'tar -C /app/data -czf - .' > "$backup" )
test -s "$backup"
docker compose up -d --wait
trap - EXIT
)
```

To restore, first point `restore` at the intended archive. The command validates that the archive contains the SQLite database, stops the service, makes a fresh pre-restore backup, replaces the named-volume contents, restores `node:node` ownership, and starts the service again:

```bash
(
set -eu
umask 077
restore="$PWD/backups/mikanarr-data-YYYYMMDD-HHMMSS.tar.gz"
test -f "$restore"
docker compose run --rm --no-deps --user root --cap-add DAC_OVERRIDE -v "$restore:/backup.tar.gz:ro" --entrypoint sh mikanarr -c 'set -eu; tar -tzf /backup.tar.gz > /tmp/backup.list; grep -Eq "(^|/)database\.sqlite$" /tmp/backup.list'
docker compose stop mikanarr
mkdir -p backups
backup="backups/mikanarr-data-before-restore-$(date +%Y%m%d-%H%M%S).tar.gz"
( set -C; docker compose run --rm --no-deps --entrypoint sh mikanarr -c 'tar -C /app/data -czf - .' > "$backup" )
test -s "$backup"
docker compose run --rm --no-deps --user root --cap-add DAC_OVERRIDE --cap-add CHOWN -v "$restore:/backup.tar.gz:ro" --entrypoint sh mikanarr -c 'set -eu; find /app/data -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -C /app/data -xzf /backup.tar.gz; chown -R node:node /app/data'
docker compose up -d --wait
)
```

Keep the backup until the upgraded or restored instance has been verified. Treat these archives as secrets because they contain the database and application authentication keys.

## Roll back an application image

If verification fails, set `PREVIOUS_IMAGE` to the exact previously known-good tag or digest and roll back the application image. If an older application cannot read a migrated database, restore the pre-upgrade data archive using the restore procedure above.

```bash
test -n "${PREVIOUS_IMAGE:-}"
IMAGE_NAME="$PREVIOUS_IMAGE" docker compose pull
IMAGE_NAME="$PREVIOUS_IMAGE" docker compose up -d --wait --force-recreate
```

Persist the selected `IMAGE_NAME` in `.env` after verification so later Compose commands do not drift back to `latest`.

## Migrate a legacy `./data` bind mount

Do this before starting the new deployment in production. The sequence first requires the legacy database, stops and removes the old Compose service without deleting volumes, and only then archives and copies the quiesced SQLite files. It creates the new Compose volume without starting the application, refuses to copy into a non-empty destination, and restores `node:node` ownership.

```bash
(
set -eu
umask 077

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
docker compose run --rm --no-deps --user root --cap-add DAC_OVERRIDE --cap-add CHOWN -v "$PWD/data:/legacy:ro" --entrypoint sh mikanarr -c 'set -eu; test -f /legacy/database.sqlite; test -z "$(find /app/data -mindepth 1 -maxdepth 1 -print -quit)"; for name in database.sqlite database.sqlite-wal database.sqlite-shm jwt.key jwt.key.pub; do if [ -e "/legacy/$name" ]; then cp -p "/legacy/$name" "/app/data/$name"; fi; done; chown -R node:node /app/data'
docker compose up -d --wait
)
```

Do not restart the legacy service between `docker compose down` and the copy step; that would make the archive and copied SQLite state diverge. Keep the archive until the upgraded instance has been verified. Do not rerun the copy command against an existing populated volume: its empty-destination check is intentional. If a migration must be retried, stop the service and make a fresh named-volume backup using the procedure above before deciding how to restore it. None of the migration commands deletes the source directory or a volume.

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

Never publish Mikan feed URLs/tokens, Sonarr keys, `.env`, database archives, or JWT private keys. For an exposure, revoke/regenerate the Mikan feed token and update the matching pattern; issue a new Sonarr API key and update root `.env`; then make a named-volume backup and regenerate `/app/data/jwt.key` plus `/app/data/jwt.key.pub`. JWT-key regeneration invalidates all sessions.

```bash
docker compose stop mikanarr
docker compose run --rm --no-deps --entrypoint sh mikanarr -c 'rm -f /app/data/jwt.key /app/data/jwt.key.pub'
docker compose up -d --wait
```
