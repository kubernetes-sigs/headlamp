import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareAsset, evaluateReleaseTag } from './github.js';

describe('evaluateReleaseTag', () => {
  it('accepts a verified tag', () => {
    const result = evaluateReleaseTag('1.0.0', { verified: true, reason: 'valid' }, false);
    assert.equal(result.level, 'ok');
  });

  it('only reports a missing tag on a draft release', () => {
    assert.equal(evaluateReleaseTag('1.0.0', null, true).level, 'info');
  });

  it('rejects a missing tag on a published release', () => {
    assert.equal(evaluateReleaseTag('1.0.0', null, false).level, 'error');
  });

  it('rejects unsigned and lightweight tags', () => {
    for (const reason of ['unsigned', 'lightweight']) {
      const result = evaluateReleaseTag('1.0.0', { verified: false, reason }, false);
      assert.equal(result.level, 'error', reason);
    }
  });

  it('rejects tags whose signature is invalid, cannot be parsed, or comes from an unusable key', () => {
    const reasons = [
      'invalid',
      'malformed_signature',
      'unknown_signature_type',
      'bad_cert',
      'ocsp_revoked',
      'expired_key',
      'not_signing_key',
      'unknown'
    ];
    for (const reason of reasons) {
      const result = evaluateReleaseTag('1.0.0', { verified: false, reason }, false);
      assert.equal(result.level, 'error', reason);
      assert.match(result.message, new RegExp(reason));
    }
  });

  it('warns about signed tags that GitHub cannot attribute to the tagger', () => {
    for (const reason of ['unknown_key', 'no_user', 'unverified_email', 'bad_email']) {
      const result = evaluateReleaseTag('1.0.0', { verified: false, reason }, false);
      assert.equal(result.level, 'warn', reason);
      assert.match(result.message, new RegExp(reason));
    }
  });

  it('warns when GitHub could not check the signature right now', () => {
    for (const reason of ['gpgverify_error', 'gpgverify_unavailable', 'ocsp_pending', 'ocsp_error']) {
      const result = evaluateReleaseTag('1.0.0', { verified: false, reason }, false);
      assert.equal(result.level, 'warn', reason);
      assert.match(result.message, /again later/);
    }
  });
});

describe('compareAsset', () => {
  it('accepts an attached copy that matches the local file', () => {
    assert.equal(compareAsset(Buffer.from('signature'), Buffer.from('signature')), 'ok');
  });

  it('rejects a file that is not attached', () => {
    assert.equal(compareAsset(Buffer.from('signature'), null), 'missing');
  });

  it('rejects an attached copy that differs from the local file', () => {
    assert.equal(compareAsset(Buffer.from('signature'), Buffer.from('tampered')), 'mismatch');
  });
});
