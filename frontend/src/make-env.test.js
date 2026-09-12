/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');

const frontendDirectory = path.resolve(__dirname, '..');
const repositoryDirectory = path.resolve(frontendDirectory, '..');
const appInfo = JSON.parse(fs.readFileSync(path.join(frontendDirectory, '../app/package.json')));

function parseEnvFile(envFile) {
  const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('REACT_APP_'))
  );
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { loadEnv } from 'vite'; process.stdout.write(JSON.stringify(loadEnv('test', process.argv[1], 'REACT_APP_')));",
        path.dirname(envFile),
      ],
      { cwd: frontendDirectory, encoding: 'utf8', env: childEnv }
    )
  );
}

async function createEnv({ manifest, manifestFile, sourceCommit, gitDirectory } = {}) {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-make-env-'));
  const envFile = path.join(tempDirectory, '.env');
  const generatedManifestFile = path.join(tempDirectory, 'app-build-manifest.json');
  const previousOutputFile = process.argv[2];
  const previousManifest = process.env.HEADLAMP_BUILD_MANIFEST;
  const previousSourceCommit = process.env.HEADLAMP_SOURCE_COMMIT;
  const previousGitDirectory = process.env.GIT_DIR;

  if (manifest !== undefined) {
    fs.writeFileSync(generatedManifestFile, JSON.stringify(manifest));
  }

  process.argv[2] = envFile;
  if (manifest === undefined && manifestFile === undefined) {
    delete process.env.HEADLAMP_BUILD_MANIFEST;
  } else {
    process.env.HEADLAMP_BUILD_MANIFEST = manifestFile ?? generatedManifestFile;
  }
  if (sourceCommit === undefined) {
    delete process.env.HEADLAMP_SOURCE_COMMIT;
  } else {
    process.env.HEADLAMP_SOURCE_COMMIT = sourceCommit;
  }
  if (gitDirectory === undefined) {
    delete process.env.GIT_DIR;
  } else {
    process.env.GIT_DIR = gitDirectory;
  }

  try {
    vi.resetModules();
    await import('../make-env.js');
    return parseEnvFile(envFile);
  } finally {
    process.argv[2] = previousOutputFile;
    restoreEnv('HEADLAMP_BUILD_MANIFEST', previousManifest);
    restoreEnv('HEADLAMP_SOURCE_COMMIT', previousSourceCommit);
    restoreEnv('GIT_DIR', previousGitDirectory);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function createStandaloneEnv({ manifest, manifestPath = 'app-build-manifest.json' } = {}) {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-standalone-env-'));
  const tempFrontend = path.join(tempDirectory, 'frontend');
  const tempApp = path.join(tempDirectory, 'app');
  const envFile = path.join(tempDirectory, '.env');
  const selectedManifest = path.join(tempApp, manifestPath);
  fs.mkdirSync(tempFrontend);
  fs.mkdirSync(tempApp);
  fs.copyFileSync(
    path.join(frontendDirectory, 'make-env.js'),
    path.join(tempFrontend, 'make-env.mjs')
  );
  fs.writeFileSync(
    path.join(tempApp, 'package.json'),
    JSON.stringify({ productName: 'Headlamp', version: '0.0.0' })
  );
  if (manifest !== undefined) {
    fs.mkdirSync(path.dirname(selectedManifest), { recursive: true });
    fs.writeFileSync(selectedManifest, JSON.stringify(manifest));
  }

  try {
    const env = { ...process.env, HEADLAMP_SOURCE_COMMIT: 'source-commit' };
    if (manifestPath !== 'app-build-manifest.json') {
      env.HEADLAMP_BUILD_MANIFEST = `./${manifestPath}`;
    } else {
      delete env.HEADLAMP_BUILD_MANIFEST;
    }
    execFileSync(process.execPath, [path.join(tempFrontend, 'make-env.mjs'), envFile], {
      cwd: tempDirectory,
      env,
    });
    return parseEnvFile(envFile);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

test('writes the default product metadata without requiring Git', async () => {
  const env = await createEnv({ sourceCommit: 'source-commit' });

  expect(env).toMatchObject({
    REACT_APP_HEADLAMP_VERSION: appInfo.version,
    REACT_APP_HEADLAMP_GIT_VERSION: 'source-commit',
    REACT_APP_HEADLAMP_PRODUCT_NAME: appInfo.productName,
  });
  expect(env).not.toHaveProperty('REACT_APP_HEADLAMP_PRODUCT_VERSION');
});

test('reads product metadata from the default manifest', async () => {
  const env = await createStandaloneEnv({
    manifest: { product: { productName: 'Default Product', version: '2.3.4' } },
  });

  expect(env).toMatchObject({
    REACT_APP_HEADLAMP_VERSION: '0.0.0',
    REACT_APP_HEADLAMP_PRODUCT_NAME: 'Default Product',
    REACT_APP_HEADLAMP_PRODUCT_VERSION: '2.3.4',
  });
});

test('falls back to package metadata when the default manifest is absent', async () => {
  const env = await createStandaloneEnv();

  expect(env).toMatchObject({
    REACT_APP_HEADLAMP_VERSION: '0.0.0',
    REACT_APP_HEADLAMP_PRODUCT_NAME: 'Headlamp',
  });
  expect(env).not.toHaveProperty('REACT_APP_HEADLAMP_PRODUCT_VERSION');
});

test('resolves a relative custom manifest from the app directory', async () => {
  const env = await createStandaloneEnv({
    manifest: { product: { productName: 'Relative Product', version: '3.4.5' } },
    manifestPath: 'product/app-build-manifest.json',
  });

  expect(env).toMatchObject({
    REACT_APP_HEADLAMP_VERSION: '0.0.0',
    REACT_APP_HEADLAMP_PRODUCT_NAME: 'Relative Product',
    REACT_APP_HEADLAMP_PRODUCT_VERSION: '3.4.5',
  });
});

test('uses custom product metadata and the source commit', async () => {
  const env = await createEnv({
    manifest: {
      product: {
        version: '1.2.3',
        productName: 'Example Desktop',
      },
    },
    sourceCommit: '0123456789abcdef',
  });

  expect(env).toMatchObject({
    REACT_APP_HEADLAMP_VERSION: appInfo.version,
    REACT_APP_HEADLAMP_GIT_VERSION: '0123456789abcdef',
    REACT_APP_HEADLAMP_PRODUCT_NAME: 'Example Desktop',
    REACT_APP_HEADLAMP_PRODUCT_VERSION: '1.2.3',
  });
});

test('falls back to package metadata for omitted product fields', async () => {
  const env = await createEnv({
    manifest: { product: { productName: 'Example Desktop' } },
    sourceCommit: 'source-commit',
  });

  expect(env).toMatchObject({
    REACT_APP_HEADLAMP_VERSION: appInfo.version,
    REACT_APP_HEADLAMP_PRODUCT_NAME: 'Example Desktop',
  });
  expect(env).not.toHaveProperty('REACT_APP_HEADLAMP_PRODUCT_VERSION');
});

test('falls back to package metadata for empty product fields', async () => {
  const env = await createEnv({
    manifest: { product: { productName: '', version: '' } },
    sourceCommit: 'source-commit',
  });

  expect(env).toMatchObject({
    REACT_APP_HEADLAMP_VERSION: appInfo.version,
    REACT_APP_HEADLAMP_PRODUCT_NAME: appInfo.productName,
  });
  expect(env).not.toHaveProperty('REACT_APP_HEADLAMP_PRODUCT_VERSION');
});

test('falls back to package metadata when a manifest has no product', async () => {
  const env = await createEnv({
    manifest: {},
    sourceCommit: 'source-commit',
  });

  expect(env).toMatchObject({
    REACT_APP_HEADLAMP_VERSION: appInfo.version,
    REACT_APP_HEADLAMP_PRODUCT_NAME: appInfo.productName,
  });
  expect(env).not.toHaveProperty('REACT_APP_HEADLAMP_PRODUCT_VERSION');
});

test('omits a whitespace-only product version', async () => {
  const env = await createEnv({
    manifest: { product: { productName: 'Example Desktop', version: ' \t' } },
    sourceCommit: 'source-commit',
  });

  expect(env).not.toHaveProperty('REACT_APP_HEADLAMP_PRODUCT_VERSION');
});

test.each([
  ['a non-object manifest', []],
  ['a non-object product', { product: 'Example Desktop' }],
  ['a non-string version', { product: { version: 123 } }],
  ['a non-string product name', { product: { productName: ['Example Desktop'] } }],
])('rejects %s', async (_description, manifest) => {
  await expect(createEnv({ manifest, sourceCommit: 'source-commit' })).rejects.toThrow();
});

test('preserves dotenv-sensitive characters through Vite', async () => {
  const env = await createEnv({
    manifest: {
      product: {
        productName: 'C# $HOME O\'Reilly "Desktop" \\path',
        version: '1.2.3=build',
      },
    },
    sourceCommit: 'source=commit',
  });

  expect(env).toMatchObject({
    REACT_APP_HEADLAMP_VERSION: appInfo.version,
    REACT_APP_HEADLAMP_GIT_VERSION: 'source=commit',
    REACT_APP_HEADLAMP_PRODUCT_NAME: 'C# $HOME O\'Reilly "Desktop" \\path',
    REACT_APP_HEADLAMP_PRODUCT_VERSION: '1.2.3=build',
  });
});

test.each([
  ['all quote delimiters', '\'"`# Desktop'],
  ['matching outer delimiters', "'a\"`b'"],
  ['a leading double quote with an escaped newline', '"a\\nb\'`'],
])('rejects values dotenv cannot represent safely: %s', async (_description, productName) => {
  await expect(
    createEnv({
      manifest: { product: { productName } },
      sourceCommit: 'source-commit',
    })
  ).rejects.toThrow(/represented safely/);
});

test.each([
  ['the product name', { manifest: { product: { productName: 'Example\nInjected' } } }],
  ['the product version', { manifest: { product: { version: '1.2.3\rInjected' } } }],
  ['the source commit', { sourceCommit: 'source\nREACT_APP_INJECTED=value' }],
])('rejects newlines in %s', async (_description, options) => {
  await expect(createEnv(options)).rejects.toThrow(/newlines/);
});

test('uses an unknown Git version outside a repository', async () => {
  const env = await createEnv({ gitDirectory: path.join(os.tmpdir(), 'missing-headlamp-git') });

  expect(env.REACT_APP_HEADLAMP_GIT_VERSION).toBe('unknown');
});

test('container build entry points pass the source revision', () => {
  const sourceCommit = '0123456789abcdef';
  const makeOutput = execFileSync(
    'make',
    [
      '--dry-run',
      'image',
      'DOCKER_CMD=echo',
      'DOCKER_BUILDX_CMD=buildx',
      `HEADLAMP_SOURCE_COMMIT=${sourceCommit}`,
    ],
    { cwd: repositoryDirectory, encoding: 'utf8' }
  );
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(repositoryDirectory, 'package.json'), 'utf8')
  );
  const dockerfile = fs.readFileSync(path.join(repositoryDirectory, 'Dockerfile'), 'utf8');
  const dependencyInstall = dockerfile.indexOf('RUN cd ./frontend && npm ci --only=prod');
  const sourceCommitArgument = dockerfile.indexOf('ARG HEADLAMP_SOURCE_COMMIT');

  expect(makeOutput).toContain(`--build-arg HEADLAMP_SOURCE_COMMIT=${sourceCommit}`);
  expect(rootPackage.scripts['image:build']).toContain(
    '--build-arg HEADLAMP_SOURCE_COMMIT=$(git rev-parse HEAD)'
  );
  expect(dependencyInstall).toBeGreaterThan(-1);
  expect(sourceCommitArgument).toBeGreaterThan(dependencyInstall);
  expect(dockerfile).not.toMatch(/^COPY (?:\.\/)?app(?:\/| )/m);
  expect(dockerfile).toContain(
    'RUN --mount=type=bind,source=app,target=/headlamp/app,ro \\\n    cd ./frontend && npm run build'
  );
});

test('container workflows pass the checked-out source revision', () => {
  const workflowsDirectory = path.join(repositoryDirectory, '.github/workflows');
  const dockerWorkflows = fs
    .readdirSync(workflowsDirectory)
    .filter(fileName => /\.ya?ml$/.test(fileName))
    .map(fileName => ({
      fileName,
      contents: fs.readFileSync(path.join(workflowsDirectory, fileName), 'utf8'),
    }))
    .filter(({ contents }) => contents.includes('docker/build-push-action@'));

  expect(dockerWorkflows.map(({ fileName }) => fileName).sort()).toEqual([
    'build-other-arch.yml',
    'container-publish.yml',
    'nightly-build.yml',
  ]);
  for (const { fileName, contents } of dockerWorkflows) {
    expect(contents, fileName).toMatch(
      /build-args:\s*\|?\s*\n\s+HEADLAMP_SOURCE_COMMIT=\$\{\{ (?:github\.sha|env\.HEADLAMP_SOURCE_COMMIT) \}\}/
    );
  }

  const publishWorkflow = dockerWorkflows.find(
    ({ fileName }) => fileName === 'container-publish.yml'
  ).contents;
  expect(publishWorkflow.indexOf('git checkout ${{ env.BUILD_TAG }}')).toBeLessThan(
    publishWorkflow.indexOf('HEADLAMP_SOURCE_COMMIT=$(git rev-parse HEAD)')
  );
});
