import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createReleaseTag, isReleaseTagSigned } from './git.js';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf-8', stdio: 'pipe' });

describe('release tag signing', () => {
  const originalCwd = process.cwd();
  let tmp: string;

  before(() => {
    // Keep the tests independent of the developer's own git configuration.
    process.env.GIT_CONFIG_GLOBAL = os.devNull;
    process.env.GIT_CONFIG_NOSYSTEM = '1';

    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'releaser-test-'));
    const key = path.join(tmp, 'signing-key');
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);

    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo);
    process.chdir(repo);
    git('init', '-q');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    git('config', 'gpg.format', 'ssh');
    git('config', 'user.signingkey', `${key}.pub`);
    git('config', 'gpg.ssh.allowedSignersFile', path.join(tmp, 'allowed_signers'));
    fs.writeFileSync(
      path.join(tmp, 'allowed_signers'),
      `test@example.com ${fs.readFileSync(`${key}.pub`, 'utf-8')}`
    );
    git('commit', '-q', '--allow-empty', '-m', 'init');
  });

  after(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('signs release tags by default', () => {
    createReleaseTag('1.0.0');
    assert.equal(isReleaseTagSigned('1.0.0'), true);
    assert.doesNotThrow(() => git('tag', '-v', 'v1.0.0'));
  });

  it('creates an unsigned annotated tag when signing is turned off', () => {
    createReleaseTag('1.1.0', false);
    assert.equal(git('cat-file', '-t', 'v1.1.0').trim(), 'tag');
    assert.equal(isReleaseTagSigned('1.1.0'), false);
  });

  it('does not treat lightweight tags as signed', () => {
    git('tag', 'v1.2.0');
    assert.equal(isReleaseTagSigned('1.2.0'), false);
  });

  it('does not treat a lightweight tag on a signed commit as signed', () => {
    git('commit', '-q', '--allow-empty', '-S', '-m', 'signed commit');
    git('tag', 'v1.3.0');
    assert.equal(isReleaseTagSigned('1.3.0'), false);
  });

  it('does not treat a missing tag as signed', () => {
    assert.equal(isReleaseTagSigned('9.9.9'), false);
  });
});
