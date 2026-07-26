# Mikanarr Refactor

Mikanarr bridges Mikan RSS feeds to Sonarr and stores patterns in SQLite. It is a cookie-authenticated web application; credentials and API keys remain server-side.

## Deploy with Docker Compose

Use the checked-in Compose file and the published GHCR image. Configuration belongs in the repository-root `.env`; do not put it in the data volume or commit it.

```bash
cp .env.example .env
# Before continuing, edit .env and configure either a real local login pair or complete OIDC.
# The unedited example intentionally fails closed at startup.
docker compose pull
docker compose up -d --wait
```

The image is `ghcr.io/sagehou/mikanarr-refactor:latest` unless `IMAGE_NAME` is set. Compose stores SQLite and generated session-signing keys in the named `mikanarr-data` volume mounted at `/app/data`. The volume is initialized for the non-root application user; there is no host `data/` directory to create for a new deployment.

The published port is loopback-only by default (`127.0.0.1:12306`). Put a TLS-terminating reverse proxy in front of it for normal use and leave `COOKIE_SECURE=true`. To intentionally expose it on a trusted LAN, set `BIND_ADDRESS=0.0.0.0` in root `.env`, apply firewall controls, and restart with `docker compose up -d --wait`.

## Configuration

`SONARR_API_KEY` and `SONARR_HOST` configure the server-side Sonarr connection. `SONARR_PUBLIC_URL` is optional and is only the browser-facing Sonarr URL. `TMDB_API_KEY` is optional.

Local login is enabled only when `ADMIN_USERNAME` and `ADMIN_PASSWORD` are both non-empty. Supplying only one is not a valid local login. `COOKIE_SECURE` defaults to true in production; set it to `false` only for local HTTP development or testing, never for a TLS deployment.

`TRUST_PROXY_HOPS` defaults to `0`, so client-supplied `X-Forwarded-For` is ignored. If Mikanarr is reachable only through a fixed reverse-proxy chain, set it to the exact number of proxy hops (for example, `1` for one proxy). Never set a larger convenience value or expose a shorter direct path: doing so lets clients spoof their throttling identity and bypass or misdirect login limits.

OIDC is optional but, when used, requires this complete tuple: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URI`. The issuer is discovered from its issuer URL, for example:

```env
OIDC_ISSUER=https://auth.example.com/application/o/mikanarr/
OIDC_CLIENT_ID=mikanarr
OIDC_CLIENT_SECRET=replace_me
OIDC_REDIRECT_URI=https://mikanarr.example.com/auth/oidc/callback
OIDC_ALLOWED_SUBJECTS=alice-subject
# or: OIDC_REQUIRED_GROUP=mikanarr-users
# optional custom claim name: OIDC_GROUPS_CLAIM=groups
```

At least one allowed subject (`OIDC_ALLOWED_SUBJECTS`, comma-separated) or required group (`OIDC_REQUIRED_GROUP`) is mandatory. Group membership is read from `OIDC_GROUPS_CLAIM`, which defaults to `groups`. The old `OIDC_AUTH_URL` and `OIDC_TOKEN_URL` variables are rejected; replace them with `OIDC_ISSUER`.

## Data safety and incident response

Back up the named volume while the application is stopped so the SQLite files are consistent:

```bash
docker compose stop mikanarr
mkdir -p backups
docker compose run --rm --no-deps --entrypoint sh mikanarr -c 'tar -C /app/data -czf - .' > backups/mikanarr-data-$(date +%F).tar.gz
docker compose up -d --wait
```

To restore, stop the service, first make a fresh backup, then run the following command with the intended archive path. It deliberately replaces all application data and restores node ownership.

```bash
(
set -eu
docker compose stop mikanarr
mkdir -p backups
backup="backups/mikanarr-data-before-restore-$(date +%Y%m%d-%H%M%S).tar.gz"
( set -C; docker compose run --rm --no-deps --entrypoint sh mikanarr -c 'tar -C /app/data -czf - .' > "$backup" )
test -s "$backup"
docker compose run --rm --no-deps --user root -v "$PWD/backups/mikanarr-data-YYYY-MM-DD.tar.gz:/backup.tar.gz:ro" --entrypoint sh mikanarr -c 'set -eu; find /app/data -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -C /app/data -xzf /backup.tar.gz; chown -R node:node /app/data'
docker compose up -d --wait
)
```

Treat Mikan feed URLs/tokens, Sonarr API keys, `.env`, database backups, and `/app/data/jwt.key` as secrets. Do not paste them into issues or logs. If exposed: revoke/regenerate the Mikan feed token and update affected patterns; generate a new Sonarr API key and update root `.env`; then stop the service, make a backup, remove `/app/data/jwt.key` and `/app/data/jwt.key.pub` through a one-off Compose run, and start it again. New keys invalidate all existing sessions.

```bash
docker compose stop mikanarr
docker compose run --rm --no-deps --entrypoint sh mikanarr -c 'rm -f /app/data/jwt.key /app/data/jwt.key.pub'
docker compose up -d --wait
```

See [QUICKSTART.md](QUICKSTART.md), [UPGRADE_NOTES.md](UPGRADE_NOTES.md), and [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for operating guidance.

## License

ISC. See [LICENSE](LICENSE).
