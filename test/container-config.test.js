const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const yaml = require('yaml');

const root = resolve(__dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const parseYaml = file => yaml.parse(read(file));

test('production dependency floors and exact test dependencies stay patched', () => {
  const manifest = JSON.parse(read('package.json'));
  assert.deepEqual(
    {
      axios: manifest.dependencies.axios,
      betterSqlite3: manifest.dependencies['better-sqlite3'],
      dotenv: manifest.dependencies.dotenv,
      hpm: manifest.dependencies['http-proxy-middleware']
    },
    {
      axios: '^1.18.1',
      betterSqlite3: '^12.11.1',
      dotenv: '^17.4.2',
      hpm: '^3.0.7'
    }
  );
  assert.equal(manifest.dependencies['openid-client'], '6.8.4');
  assert.equal(manifest.dependencies.safeRegex2, undefined);
  assert.equal(manifest.dependencies['safe-regex2'], '5.1.1');
  assert.equal(manifest.devDependencies.jsdom, '29.1.1');
  assert.equal(manifest.devDependencies.yaml, '2.9.0');
  assert.equal(manifest.dependencies.cors, undefined);
});

test('Dockerfile defines a pinned production-only non-root healthy runtime', () => {
  const dockerfile = read('Dockerfile');
  assert.match(dockerfile, /^FROM node:22\.23\.1-alpine3\.24$/m);
  assert.match(dockerfile, /^RUN npm ci --omit=dev$/m);
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
});

test('GitHub checks gate image publishing and workflow edits trigger releases', () => {
  const check = parseYaml('.github/workflows/check.yml');
  assert.ok(check.on.workflow_call !== undefined);
  const checkJob = check.jobs.check;
  assert.equal(checkJob['runs-on'], 'ubuntu-latest');
  const setupNode = checkJob.steps.find(step => step.uses === 'actions/setup-node@v4');
  assert.equal(setupNode.with['node-version'], '22.23.1');
  const commands = checkJob.steps.map(step => step.run).filter(Boolean);
  assert.ok(commands.includes('npm ci'));
  assert.ok(commands.includes('npm run check'));
  assert.ok(commands.includes('npm audit --omit=dev --audit-level=high'));

  const publish = parseYaml('.github/workflows/docker-publish.yml');
  assert.equal(publish.jobs.check.uses, './.github/workflows/check.yml');
  assert.equal(publish.jobs['build-and-push'].needs, 'check');
  for (const event of ['push', 'pull_request']) {
    assert.ok(!publish.on[event]?.['paths-ignore']?.includes('.github/**'));
  }
});

test('Dependabot checks npm and GitHub Actions every week', () => {
  const config = parseYaml('.github/dependabot.yml');
  assert.deepEqual(
    config.updates.map(update => [update['package-ecosystem'], update.directory, update.schedule.interval]),
    [['npm', '/', 'weekly'], ['github-actions', '/', 'weekly']]
  );
});

test('GitLab verification gates publish and health-gated deploy with known hosts', () => {
  const config = parseYaml('.gitlab-ci.yml');
  assert.deepEqual(config.stages, ['test', 'publish', 'deploy']);
  assert.equal(config.test.image, 'node:22.23.1-alpine3.24');
  assert.ok(config.test.script.includes('npm ci'));
  assert.ok(config.test.script.includes('npm run check'));
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
