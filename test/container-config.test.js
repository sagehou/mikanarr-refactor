const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const yaml = require('yaml');
const dotenv = require('dotenv');
const { loadConfig, ConfigError } = require('../server/config');

const root = resolve(__dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const parseYaml = file => yaml.parse(read(file));

function parseDeclaredVersion(spec) {
  const match = /^[~^]?(\d+)\.(\d+)\.(\d+)$/.exec(spec || '');
  assert.ok(match, `unsupported semver declaration: ${spec}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function assertVersionRange(spec, min, maxExclusive) {
  const version = parseDeclaredVersion(spec);
  assert.ok(compareVersions(version, min) >= 0, `${spec} must be >= ${min.join('.')}`);
  assert.ok(compareVersions(version, maxExclusive) < 0, `${spec} must be < ${maxExclusive.join('.')}`);
  return version;
}

test('production dependency floors and supported majors stay patched', () => {
  const manifest = JSON.parse(read('package.json'));

  assertVersionRange(manifest.dependencies.axios, [1, 18, 1], [2, 0, 0]);
  const betterSqliteVersion = assertVersionRange(manifest.dependencies['better-sqlite3'], [12, 11, 1], [13, 0, 0]);
  assertVersionRange(manifest.dependencies.dotenv, [17, 4, 2], [18, 0, 0]);
  assertVersionRange(manifest.dependencies['http-proxy-middleware'], [3, 0, 7], [4, 0, 0]);
  assertVersionRange(manifest.dependencies['openid-client'], [6, 8, 4], [7, 0, 0]);
  assert.equal(manifest.dependencies.safeRegex2, undefined);
  assertVersionRange(manifest.dependencies['safe-regex2'], [5, 1, 1], [6, 0, 0]);
  assertVersionRange(manifest.devDependencies.jsdom, [29, 1, 1], [31, 0, 0]);
  assertVersionRange(manifest.devDependencies.yaml, [2, 9, 0], [3, 0, 0]);
  assert.equal(manifest.dependencies.cors, undefined);

  const npmVersion = manifest.packageManager?.match(/^npm@(\d+\.\d+\.\d+)$/)?.[1];
  assert.ok(npmVersion, 'packageManager must pin an exact npm version');
  assertVersionRange(npmVersion, [11, 18, 0], [12, 0, 0]);

  assert.deepEqual(manifest.allowScripts, { [`better-sqlite3@${betterSqliteVersion.join('.')}`]: true });
  assert.equal(read('.npmrc').trim(), 'strict-allow-scripts=true');
});

test('Dockerfile defines a pinned production-only non-root healthy runtime', () => {
  const dockerfile = read('Dockerfile');
  const baseImage = dockerfile.match(/^FROM node:(\d+)\.(\d+)\.(\d+)-alpine(\d+\.\d+)@sha256:([a-f0-9]{64})$/m);
  assert.ok(baseImage, 'Node base image must use an exact Alpine tag and sha256 digest');
  const nodeVersion = baseImage.slice(1, 4).map(Number);
  assert.ok(compareVersions(nodeVersion, [22, 13, 0]) >= 0, 'Node runtime must be >= 22.13.0');
  assert.ok(compareVersions(nodeVersion, [23, 0, 0]) < 0, 'Node runtime must remain on supported major 22');
  assert.equal(baseImage[4], '3.24');
  assert.match(dockerfile, /^COPY package\*\.json \.npmrc \.\/$/m);

  const manifest = JSON.parse(read('package.json'));
  const npmVersion = manifest.packageManager.match(/^npm@(\d+\.\d+\.\d+)$/)[1];
  const escapedNpmVersion = npmVersion.replace(/\./g, '\\.');
  assert.match(dockerfile, new RegExp(`npm install --global --ignore-scripts npm@${escapedNpmVersion}`));
  assert.match(dockerfile, new RegExp(`test "\\$\\(npm --version\\)" = "${escapedNpmVersion}"`));
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.ok(dockerfile.indexOf(`npm@${npmVersion}`) < dockerfile.indexOf('npm ci --omit=dev'));
  assert.match(dockerfile, /(?:mkdir|install).*\/app\/data/);
  assert.match(dockerfile, /chown[^\n]*node:node[^\n]*\/app\/data/);
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^HEALTHCHECK --interval=5s .*wget .*http:\/\/127\.0\.0\.1:12306\/api\/health/m);
  assert.match(dockerfile, /^CMD \["node", "server\/index\.js"\]$/m);
});

test('.dockerignore excludes local state, secrets, and non-runtime build context', () => {
  const ignored = read('.dockerignore').split(/\r?\n/).filter(Boolean);
  for (const entry of ['.git', '.worktrees', 'node_modules', '.env', 'data', '*.key', '*.db', '*.log', 'test']) {
    assert.ok(ignored.includes(entry), `${entry} must be excluded from the Docker build context`);
  }
});

test('.gitignore excludes secret backup archives', () => {
  const ignored = read('.gitignore').split(/\r?\n/).filter(Boolean);
  assert.ok(ignored.includes('backups/'));
  assert.ok(ignored.includes('*.tar.gz'));
});

test('Compose defaults to GHCR, loopback binding, root env, persistent data, and health gating', () => {
  const compose = parseYaml('docker-compose.yml');
  const service = compose.services.mikanarr;
  assert.equal(service.image, '${IMAGE_NAME:-ghcr.io/sagehou/mikanarr-refactor:latest}');
  assert.ok([service.env_file].flat().includes('.env'));
  assert.ok(service.ports.includes('${BIND_ADDRESS:-127.0.0.1}:12306:12306'));
  assert.ok(compose.volumes && Object.hasOwn(compose.volumes, 'mikanarr-data'));
  assert.ok(service.volumes.includes('mikanarr-data:/app/data'));
  assert.ok(!service.volumes.includes('./data:/app/data'));
  assert.match([service.healthcheck.test].flat().join(' '), /wget .*\/api\/health/);
  assert.equal(service.healthcheck.interval, '5s');
  assert.deepEqual(service.logging, {
    driver: 'json-file',
    options: { 'max-size': '10m', 'max-file': '3' }
  });
  assert.equal(service.read_only, true);
  assert.deepEqual(service.tmpfs, ['/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777']);
  assert.deepEqual(service.cap_drop, ['ALL']);
  assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
  assert.equal(service.pids_limit, 128);
});

test('optional Traefik override parameterizes the host and external network', () => {
  const compose = parseYaml('docker-compose.traefik.yml');
  const service = compose.services.mikanarr;
  assert.equal(service.labels['traefik.enable'], 'true');
  assert.equal(service.labels['traefik.docker.network'], '${TRAEFIK_NETWORK:-traefik}');
  assert.equal(service.labels['traefik.http.routers.mikanarr.rule'], 'Host(`${MIKANARR_HOST:?set MIKANARR_HOST}`)');
  assert.equal(service.labels['traefik.http.routers.mikanarr.tls'], 'true');
  assert.ok(service.networks.includes('traefik'));
  assert.deepEqual(compose.networks.traefik, { external: true, name: '${TRAEFIK_NETWORK:-traefik}' });
});

test('the copied environment example fails closed until authentication is configured', () => {
  const env = dotenv.parse(read('.env.example'));
  assert.equal(env.ADMIN_USERNAME, '');
  assert.equal(env.ADMIN_PASSWORD, '');
  assert.throws(
    () => loadConfig({ ...env, NODE_ENV: 'production' }),
    error => error instanceof ConfigError && error.code === 'AUTH_NOT_CONFIGURED'
  );
});

test('backup and restore recipes protect archives and are valid shell', () => {
  const blocks = [...read('README.md').matchAll(/```bash\n([\s\S]*?)```/g)].map(match => match[1]);
  const backup = blocks.find(block => block.includes('trap') && block.includes('tar -C /app/data -czf'));
  const restore = blocks.find(block => block.includes('find /app/data -mindepth 1'));
  assert.ok(backup, 'backup command block');
  assert.ok(restore, 'restore command block');
  assert.match(backup, /umask 077/);
  assert.match(backup, /\( set -C; docker compose run[^\n]+> "\$backup" \)/);
  assert.match(backup, /test -s "\$backup"/);
  assert.match(restore, /backup="backups\/mikanarr-data-before-restore-\$\(date \+%Y%m%d-%H%M%S\)\.tar\.gz"/);
  assert.match(restore, /umask 077/);
  assert.match(restore, /test -f "\$restore"/);
  assert.match(restore, /docker compose run --rm --no-deps --user root --cap-add DAC_OVERRIDE -v "\$restore:\/backup\.tar\.gz:ro"[^\n]+tar -tzf \/backup\.tar\.gz/);
  assert.match(restore, /grep -Eq "\(\^\|\/\)database\\\.sqlite\$"/);
  assert.match(restore, /--user root --cap-add DAC_OVERRIDE --cap-add CHOWN[^\n]+chown -R node:node \/app\/data/);
  assert.match(restore, /\( set -C; docker compose run[^\n]+> "\$backup" \)/);
  assert.ok(restore.indexOf('> "$backup"') < restore.indexOf('find /app/data -mindepth 1'));
  assert.ok(restore.indexOf('tar -tzf /backup.tar.gz') < restore.indexOf('find /app/data -mindepth 1'));
  for (const block of [backup, restore]) {
    const syntax = spawnSync('bash', ['-n'], { input: block, encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
});

test('legacy migration protects its backup archive', () => {
  const blocks = [...read('UPGRADE_NOTES.md').matchAll(/```bash\n([\s\S]*?)```/g)].map(match => match[1]);
  const migration = blocks.find(block => block.includes('legacy-data-before-volume'));
  assert.ok(migration, 'legacy migration command block');
  assert.match(migration, /umask 077/);
  assert.match(migration, /--user root --cap-add DAC_OVERRIDE --cap-add CHOWN[^\n]+chown -R node:node \/app\/data/);
  const syntax = spawnSync('bash', ['-n'], { input: migration, encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test('GitHub checks gate image publishing and workflow edits trigger releases', () => {
  const check = parseYaml('.github/workflows/check.yml');
  assert.ok(check.on.workflow_call !== undefined);
  const checkJob = check.jobs.check;
  assert.equal(checkJob['runs-on'], 'ubuntu-latest');
  const setupNode = checkJob.steps.find(step => /^actions\/setup-node@v\d+$/.test(step.uses || ''));
  assert.ok(setupNode, 'check workflow must use actions/setup-node');
  assert.equal(setupNode.with['node-version'], '22.23.1');
  const commands = checkJob.steps.map(step => step.run).filter(Boolean);
  assert.ok(commands.includes('npm install --global --ignore-scripts npm@11.18.0 && test "$(npm --version)" = "11.18.0"'));
  assert.ok(commands.includes('npm ci'));
  assert.ok(commands.includes('npm run check'));
  assert.ok(commands.includes('npm audit --audit-level=high'));

  const publish = parseYaml('.github/workflows/docker-publish.yml');
  assert.equal(publish.jobs.check.uses, './.github/workflows/check.yml');
  assert.equal(publish.jobs['build-and-push'].needs, 'check');
  for (const event of ['push', 'pull_request']) {
    assert.ok(!publish.on[event]?.['paths-ignore']?.includes('.github/**'));
  }
});

test('Dependabot checks npm, GitHub Actions, and Docker every week', () => {
  const config = parseYaml('.github/dependabot.yml');
  assert.deepEqual(
    config.updates.map(update => [update['package-ecosystem'], update.directory, update.schedule.interval]),
    [['npm', '/', 'weekly'], ['github-actions', '/', 'weekly'], ['docker', '/', 'weekly']]
  );
});

test('GitLab verification gates publish and health-gated deploy with known hosts', () => {
  const config = parseYaml('.gitlab-ci.yml');
  assert.deepEqual(config.stages, ['test', 'publish', 'deploy']);
  const gitlabNode = config.test.image.match(/^node:(\d+)\.(\d+)\.(\d+)-alpine3\.24$/);
  assert.ok(gitlabNode, 'GitLab test image must use an exact Node 22 Alpine 3.24 tag');
  const gitlabNodeVersion = gitlabNode.slice(1, 4).map(Number);
  assert.ok(compareVersions(gitlabNodeVersion, [22, 13, 0]) >= 0);
  assert.ok(compareVersions(gitlabNodeVersion, [23, 0, 0]) < 0);
  assert.ok(config.test.script.includes('npm install --global --ignore-scripts npm@11.18.0'));
  assert.ok(config.test.script.includes('test "$(npm --version)" = "11.18.0"'));
  assert.ok(config.test.script.includes('npm ci'));
  assert.ok(config.test.script.includes('npm run check'));
  assert.ok(config.test.script.includes('npm audit --audit-level=high'));
  assert.ok([config['publish-arm'].needs].flat().includes('test'));
  assert.notEqual(config.deploy.image, 'alpine:latest');
  assert.match(config.deploy.image, /^alpine:\d+\.\d+\.\d+$/);
  assert.ok(config.deploy.before_script.some(command => command.includes('SSH_KNOWN_HOSTS')));
  const deployScript = config.deploy.script.join('\n');
  assert.doesNotMatch(deployScript, /StrictHostKeyChecking=no/);
  assert.match(deployScript, /docker compose up -d --wait/);
  assert.equal(config.workflow, undefined);
});

const dockerInfo = spawnSync('docker', ['info'], { encoding: 'utf8' });
const dockerSkip = dockerInfo.status === 0
  ? false
  : `Docker runtime unavailable: ${dockerInfo.error?.code || dockerInfo.stderr.trim() || `exit ${dockerInfo.status}`}`;

test('built image runs as node and reaches healthy status', { skip: dockerSkip, timeout: 180_000 }, async t => {
  const tag = `mikanarr-config-test:${process.pid}`;
  const volume = `mikanarr-config-test-${process.pid}`;
  let id;
  t.after(() => {
    if (id) spawnSync('docker', ['rm', '--force', id], { stdio: 'ignore' });
    spawnSync('docker', ['volume', 'rm', '--force', volume], { stdio: 'ignore' });
    spawnSync('docker', ['image', 'rm', '--force', tag], { cwd: root, stdio: 'ignore' });
  });

  execFileSync('docker', ['build', '--tag', tag, '.'], { cwd: root, stdio: 'inherit' });
  execFileSync('docker', ['volume', 'create', volume], { stdio: 'ignore' });

  const user = execFileSync('docker', ['image', 'inspect', '--format={{.Config.User}}', tag], { encoding: 'utf8' }).trim();
  assert.equal(user, 'node');

  id = execFileSync('docker', [
    'run', '--detach', '--mount', `type=volume,source=${volume},target=/app/data`,
    '--env', 'ADMIN_USERNAME=admin', '--env', 'ADMIN_PASSWORD=container-test-secret', tag
  ], { encoding: 'utf8' }).trim();

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = execFileSync('docker', ['inspect', '--format={{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}', id], { encoding: 'utf8' }).trim();
    if (state === 'healthy') {
      execFileSync('docker', ['exec', id, 'sh', '-c', 'test "$(id -un)" = node && touch /app/data/.container-write-test']);
      return;
    }
    if (state === 'unhealthy' || state === 'missing') assert.fail(`container health status: ${state}`);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
  }
  assert.fail('container did not become healthy within 60 seconds');
});
