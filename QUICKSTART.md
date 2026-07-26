# Quick start

## Docker Compose

From the repository root, create the only configuration file required by Compose:

```bash
cp .env.example .env
# Edit .env: set SONARR_API_KEY, SONARR_HOST, ADMIN_USERNAME, and ADMIN_PASSWORD.
# For the direct loopback HTTP path below, also set COOKIE_SECURE=false.
docker compose pull
docker compose up -d --wait
```

With `COOKIE_SECURE=false`, open `http://127.0.0.1:12306` from the host. This is the local loopback HTTP path only. For a normal deployment behind a TLS reverse proxy, leave `COOKIE_SECURE=true` and open the proxy's `https://` URL instead. Compose uses the GHCR image and a named `mikanarr-data` volume at `/app/data`; it is not a bind-mounted `./data` directory.

The default loopback binding is intentional. For internet-facing use, keep it loopback-only and place a TLS reverse proxy in front of it. Only for a deliberately firewall-protected LAN deployment, put `BIND_ADDRESS=0.0.0.0` in the root `.env` and rerun `docker compose up -d --wait`. A LAN login still needs HTTPS when `COOKIE_SECURE=true`; use `COOKIE_SECURE=false` only for an intentionally plain-HTTP local/test path.

## Login choices

Set both `ADMIN_USERNAME` and `ADMIN_PASSWORD` for a local account. They are a required pair: setting only one does not enable local authentication.

Alternatively or additionally, configure OIDC with all of `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URI`, plus either `OIDC_ALLOWED_SUBJECTS` or `OIDC_REQUIRED_GROUP`. For example:

```env
OIDC_ISSUER=https://auth.example.com/application/o/mikanarr/
OIDC_CLIENT_ID=mikanarr
OIDC_CLIENT_SECRET=replace_me
OIDC_REDIRECT_URI=https://mikanarr.example.com/auth/oidc/callback
OIDC_REQUIRED_GROUP=mikanarr-users
OIDC_GROUPS_CLAIM=groups
```

`OIDC_ALLOWED_SUBJECTS` is a comma-separated subject allow-list. `OIDC_GROUPS_CLAIM` defaults to `groups`. The legacy `OIDC_AUTH_URL` and `OIDC_TOKEN_URL` settings are rejected.

## First use

1. Sign in with the local account or OIDC.
2. Create a pattern from a Mikan RSS URL and select the matching Sonarr series/season.
3. Give Sonarr the generated Mikanarr RSS URL.

Do not share feed URLs containing tokens, API keys, session cookies, or `.env` contents. See [README.md](README.md) for backup, restore, and incident-rotation commands.
