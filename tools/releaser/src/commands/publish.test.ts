import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateReleaseTag, TagVerification } from '../utils/github.js';
import { shouldStopPublishing } from './publish.js';

function stops(verification: TagVerification | null, allowUnsigned: boolean): boolean {
  return shouldStopPublishing(verification, evaluateReleaseTag('1.0.0', verification, false), allowUnsigned);
}

describe('shouldStopPublishing', () => {
  it('continues with a verified tag', () => {
    assert.equal(stops({ verified: true, reason: 'valid' }, false), false);
  });

  it('stops when the signature is invalid', () => {
    for (const reason of ['invalid', 'malformed_signature', 'expired_key', 'not_signing_key']) {
      assert.equal(stops({ verified: false, reason }, false), true, reason);
    }
  });

  it('stops when the tag is unsigned', () => {
    assert.equal(stops({ verified: false, reason: 'unsigned' }, false), true);
    assert.equal(stops({ verified: false, reason: 'lightweight' }, false), true);
  });

  it('continues when GitHub only cannot attribute or check the signature', () => {
    for (const reason of ['unknown_key', 'no_user', 'gpgverify_unavailable', 'ocsp_pending']) {
      assert.equal(stops({ verified: false, reason }, false), false, reason);
    }
  });

  it('continues with an unsigned or invalid tag when --allow-unsigned is passed', () => {
    assert.equal(stops({ verified: false, reason: 'unsigned' }, true), false);
    assert.equal(stops({ verified: false, reason: 'invalid' }, true), false);
  });

  it('stops when the tag is not on GitHub, even with --allow-unsigned', () => {
    assert.equal(stops(null, false), true);
    assert.equal(stops(null, true), true);
  });
});
