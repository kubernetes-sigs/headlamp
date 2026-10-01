#!/usr/bin/env node

const usage = `
Usage: node tools/install-golangci-lint.js [--help]

Installs the pinned golangci-lint release binary into backend/tools/.

This downloads the same prebuilt release archive that CI's golangci-lint-action
uses (install-mode: binary). Building the linter from source with 'go install'
instead makes it inherit the host toolchain, and golangci-lint refuses to lint a
module whose targeted Go version is newer than the Go it was built with -- which
breaks 'npm run backend:lint' on any machine whose Go is older than the version
backend/go.mod targets.

The archive is verified against a sha256 pinned in this file before it is
installed, and the install aborts on any mismatch.

Re-running is a no-op once the pinned version is present.

To bump the version, update VERSION and regenerate DIGESTS with:

  curl -sL https://github.com/golangci/golangci-lint/releases/download/v<VER>/golangci-lint-<VER>-checksums.txt
`;

// Single source of truth for the pinned linter version. Keep in sync with the
// 'version:' input of golangci-lint-action in .github/workflows/backend-test.yml.
const VERSION = '2.12.2';

// Expected sha256 of each release asset, pinned here rather than read from the
// release's own checksums.txt: that file ships from the same host as the
// archive, so it detects a corrupted download but not a tampered one. Pinning
// in-repo keeps an independent trust anchor for a binary the lint step then
// executes, matching how this repo pins image digests and action SHAs.
const DIGESTS = {
  'linux-amd64': '8df580d2670fed8fa984aac0507099af8df275e665215f5c7a2ae3943893a553',
  'linux-arm64': '44cd40a8c76c86755375adfeea52cfd3533cb43d7bd647771e0ae065e166df3a',
  'darwin-amd64': 'f6f06d94b6241521c53d15450c5209b028270bf966f842afb11c030c79f5bc16',
  'darwin-arm64': 'a9c54498731b3128f79e090be6110f3e5fffccc617b08142ed244d4126c73f29',
  'windows-amd64': 'bd42e3ebc8cb4ececb86941983baaf1dc221bbb04d838e94ce63b49cc91e02bb',
  'windows-arm64': '947b9a5bf762d465710b376c156f0184abb2168378b0826af1899e0ee7183742',
};

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BASE_URL = `https://github.com/golangci/golangci-lint/releases/download/v${VERSION}`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

/**
 * Map Node's process.platform/process.arch onto golangci-lint release asset names.
 *
 * @returns {{ key: string, os: string, arch: string, ext: string, exeSuffix: string }}
 */
function detectTarget() {
  const osNames = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
  const archNames = { x64: 'amd64', arm64: 'arm64' };

  const osName = osNames[process.platform];
  const archName = archNames[process.arch];

  if (!osName || !archName) {
    throw new Error(
      `No golangci-lint release asset for ${process.platform}/${process.arch}. ` +
        `Supported: linux, darwin, windows on x64 (amd64) or arm64.`
    );
  }

  // Guards against a platform being added above without a matching pin, which
  // would otherwise install an unverified binary.
  const key = `${osName}-${archName}`;
  if (!DIGESTS[key]) {
    throw new Error(`No pinned sha256 for ${key} in DIGESTS; refusing to install unverified.`);
  }

  return {
    key,
    os: osName,
    arch: archName,
    ext: osName === 'windows' ? 'zip' : 'tar.gz',
    exeSuffix: osName === 'windows' ? '.exe' : '',
  };
}

/**
 * Report the golangci-lint version an already-installed binary claims, if any.
 *
 * @param {string} binPath - Path to the candidate binary.
 * @returns {string|null} The version string, or null if absent or unrunnable.
 */
function installedVersion(binPath) {
  if (!fs.existsSync(binPath)) {
    return null;
  }

  try {
    const out = execFileSync(binPath, ['--version'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/version\s+v?(\d+\.\d+\.\d+)/i);
    return m ? m[1] : null;
  } catch {
    // A truncated or foreign-architecture binary is treated as "not installed"
    // so that a re-run replaces it rather than failing.
    return null;
  }
}

/**
 * Fetch a URL into memory, following redirects.
 *
 * @param {string} url - The URL to fetch.
 * @returns {Promise<Buffer>} The response body.
 */
async function download(url) {
  // Bounded so a hung connection fails the lint step instead of stalling it.
  // Generous, since the archive is ~40MB and this runs on developer links.
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extract a release archive using the platform's native extractor.
 *
 * @param {string} archivePath - Path to the downloaded archive.
 * @param {string} destDir - Directory to extract into.
 * @param {string} ext - Archive extension, 'zip' or 'tar.gz'.
 */
function extract(archivePath, destDir, ext) {
  if (ext === 'zip') {
    // PowerShell single-quoted strings escape a quote by doubling it; repo paths
    // on Windows can contain apostrophes (e.g. C:\Users\O'Brien\...).
    const q = s => `'${s.replace(/'/g, "''")}'`;
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath ${q(archivePath)} -DestinationPath ${q(destDir)} -Force`,
      ],
      { stdio: 'inherit' }
    );
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' });
  }
}

async function main() {
  const target = detectTarget();
  const repoRoot = path.resolve(__dirname, '..');
  const toolsDir = path.join(repoRoot, 'backend', 'tools');
  const binName = `golangci-lint${target.exeSuffix}`;
  const binPath = path.join(toolsDir, binName);

  const have = installedVersion(binPath);
  if (have === VERSION) {
    console.log(`golangci-lint ${VERSION} already installed at ${binPath}`);
    return;
  }

  const stem = `golangci-lint-${VERSION}-${target.os}-${target.arch}`;
  const assetName = `${stem}.${target.ext}`;

  console.log(`Downloading ${assetName} from ${BASE_URL}`);
  const archive = await download(`${BASE_URL}/${assetName}`);

  // The archive is executed by the lint step, so a mismatch must abort the
  // install rather than warn.
  const want = DIGESTS[target.key];
  const got = crypto.createHash('sha256').update(archive).digest('hex');
  if (got !== want) {
    throw new Error(`Checksum mismatch for ${assetName}:\n  expected ${want}\n  got      ${got}`);
  }
  console.log(`Verified sha256 ${got}`);

  // Staged inside the destination directory so the final rename stays on one
  // filesystem; /tmp is frequently a separate mount, which would fail EXDEV.
  fs.mkdirSync(toolsDir, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(toolsDir, '.tmp-golangci-lint-'));
  try {
    const archivePath = path.join(tmpDir, assetName);
    fs.writeFileSync(archivePath, archive);
    extract(archivePath, tmpDir, target.ext);

    const extracted = path.join(tmpDir, stem, binName);
    if (!fs.existsSync(extracted)) {
      throw new Error(`Expected ${binName} at ${extracted} after extracting ${assetName}`);
    }
    fs.chmodSync(extracted, 0o755);

    // Move into place only after a successful verify+extract, so an interrupted
    // run never leaves a half-written binary behind.
    fs.rmSync(binPath, { force: true });
    fs.renameSync(extracted, binPath);

    // The archive carries the release's own build time, which would leave the
    // binary permanently older than make's prerequisites and re-trigger the
    // install target on every run.
    const now = new Date();
    fs.utimesSync(binPath, now, now);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`Installed golangci-lint ${VERSION} to ${binPath}`);
}

main().catch(err => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
