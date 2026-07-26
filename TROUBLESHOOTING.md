# Troubleshooting

## Check the deployment

Compose reads the root `.env`, uses `ghcr.io/sagehou/mikanarr-refactor:latest` by default, and stores runtime data in the named `mikanarr-data` volume mounted at `/app/data`.

```bash
docker compose ps
docker compose logs --tail=100 mikanarr
curl -i http://127.0.0.1:12306/api/health
```

The default port binding is `127.0.0.1:12306`. If a remote client cannot connect, use a TLS reverse proxy on the host. Set `BIND_ADDRESS=0.0.0.0` in root `.env` only for deliberate, firewall-protected LAN exposure, then run `docker compose up -d --wait`.

## Login or OIDC errors

For local authentication, both `ADMIN_USERNAME` and `ADMIN_PASSWORD` must be set in root `.env`. Restart after changing them:

```bash
docker compose up -d --wait
```

For OIDC, set the complete issuer/client/redirect tuple and one authorization rule. A production issuer and redirect URI must use HTTPS:

```env
OIDC_ISSUER=https://auth.example.com/application/o/mikanarr/
OIDC_CLIENT_ID=mikanarr
OIDC_CLIENT_SECRET=replace_me
OIDC_REDIRECT_URI=https://mikanarr.example.com/auth/oidc/callback
OIDC_ALLOWED_SUBJECTS=alice-subject
# or OIDC_REQUIRED_GROUP=mikanarr-users
# optional, defaults to groups: OIDC_GROUPS_CLAIM=groups
```

`OIDC_ALLOWED_SUBJECTS` is comma-separated. OIDC is rejected if its issuer/client/secret/redirect tuple is incomplete or neither allowed subjects nor a required group is configured. `OIDC_AUTH_URL` and `OIDC_TOKEN_URL` are legacy settings and are rejected; use `OIDC_ISSUER` instead. Keep `COOKIE_SECURE=true` behind HTTPS; `COOKIE_SECURE=false` is only appropriate for local HTTP development/testing.

## Sonarr requests fail

Check that `SONARR_HOST` is an address reachable by the Mikanarr container and that `SONARR_API_KEY` is current. `SONARR_PUBLIC_URL` is optional and does not change the server-side connection.

```bash
docker compose exec mikanarr sh -c 'wget -qO- --header="X-Api-Key: $SONARR_API_KEY" "$SONARR_HOST/api/v3/series"'
```

Do not include a real API key, Mikan feed token, cookie, or `.env` contents in a support request. Redact them from logs and screenshots.

## Database backup, restore, and session rotation

The application data is a named volume, not `./data`. Follow the stop/backup/restore commands in [README.md](README.md); they operate through the `mikanarr` service at `/app/data` and preserve `node:node` ownership after restore.

If a Mikan token, Sonarr API key, or generated JWT key may have escaped, rotate it promptly. Regenerate the feed token and update the pattern; replace `SONARR_API_KEY` in root `.env`; and, after making a backup, remove `/app/data/jwt.key` and `/app/data/jwt.key.pub` using the documented one-off Compose command. Regenerated JWT keys invalidate every existing session.

## Docker runtime unavailable locally

`docker compose` commands require a running Docker CLI/daemon. If it is not installed on the machine performing a source checkout, use `npm ci` and `npm run check` for application validation, then run the Compose deployment commands on a Docker-capable host. The application image itself uses Node 22.
