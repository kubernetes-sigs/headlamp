const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  compareVersions,
  evaluateDocCheck,
  parseGoMod,
  versionSatisfies,
} = require('./check-contributor-env');

test('parseGoMod returns both language and toolchain versions', () => {
  const parsed = parseGoMod('module example.com/test\n\ngo 1.26.0\n\ntoolchain go1.26.5\n');

  assert.deepEqual(parsed, {
    languageVersion: '1.26.0',
    toolchainVersion: '1.26.5',
  });
});

test('compareVersions normalizes prefixes and missing patch numbers', () => {
  assert.equal(compareVersions('v26.4.0', '26.4'), 0);
  assert.equal(compareVersions('go1.26.5', '1.26.4'), 1);
  assert.equal(compareVersions('1.25.9', '1.26.0'), -1);
});

test('versionSatisfies supports minimum and exact requirements', () => {
  assert.equal(versionSatisfies('11.18.0', '>=11.0.0'), true);
  assert.equal(versionSatisfies('1.26.5', '>=1.26.5'), true);
  assert.equal(versionSatisfies('1.26.4', '>=1.26.5'), false);
  assert.equal(versionSatisfies('22.0.0', '22.0.0'), true);
  assert.equal(versionSatisfies('23.0.0', '22.0.0'), false);
});

test('evaluateDocCheck reports drift clearly', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-env-check-'));
  const docPath = path.join(repoRoot, 'AGENTS.md');

  fs.writeFileSync(docPath, 'Node.js >=20.11.1 (specified in `/package.json` engines field)\n');

  const result = evaluateDocCheck(repoRoot, {
    label: 'AGENTS runtime Node.js version',
    file: 'AGENTS.md',
    pattern: /Node\.js ([^ ]+) \(specified in `\/package\.json` engines field\)/,
    expected: '>=22.0.0',
  });

  assert.equal(result.ok, false);
  assert.equal(result.actual, '>=20.11.1');
  assert.equal(result.expected, '>=22.0.0');
});
