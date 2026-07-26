# Mikanarr Refactor

Mikanarr converts Mikan RSS feeds for use with Sonarr. It is a Node 22 application using Express and SQLite, deployed with Docker Compose.

## Runtime model

- Published image: `ghcr.io/sagehou/mikanarr-refactor:latest` (override with `IMAGE_NAME`).
- Configuration: repository-root `.env`, created from `.env.example`.
- Persistent state: Compose named volume `mikanarr-data` at `/app/data`, including `database.sqlite` and generated JWT key files.
- Network: `127.0.0.1:12306` by default; use a TLS reverse proxy. Set `BIND_ADDRESS=0.0.0.0` only for intentional LAN exposure.
- Container process: non-root `node` user.

Start or update a deployment with:

```bash
cp .env.example .env
docker compose pull
docker compose up -d --wait
```

## Authentication

Local login needs both `ADMIN_USERNAME` and `ADMIN_PASSWORD`. Sessions are HttpOnly, SameSite cookies. Set `COOKIE_SECURE=true` in production behind TLS; use `false` only for local HTTP development/testing.

OIDC uses issuer discovery and requires `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URI`, plus `OIDC_ALLOWED_SUBJECTS` or `OIDC_REQUIRED_GROUP`. `OIDC_GROUPS_CLAIM` selects the group claim and defaults to `groups`. Example issuer: `https://auth.example.com/application/o/mikanarr/`. The legacy `OIDC_AUTH_URL` and `OIDC_TOKEN_URL` variables are rejected.

## Operational notes

Pattern create, update, delete, authenticated import, and authenticated export are supported. Back up the named volume and handle legacy bind-mount migration as described in [README.md](README.md) and [UPGRADE_NOTES.md](UPGRADE_NOTES.md). Keep Mikan feed tokens, Sonarr API keys, root `.env`, backups, and generated JWT keys confidential; rotate them and invalidate sessions after an exposure.

## License

ISC. See [LICENSE](LICENSE).
