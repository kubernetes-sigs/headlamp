const assert = require('node:assert/strict');
const test = require('node:test');
const { eventYaml } = require('./create-events');

test('eventYaml creates a DNS-compatible Kubernetes resource name', () => {
  const yaml = eventYaml(12, new Date('2026-07-27T01:02:03.456Z'));
  const name = yaml.match(/^  name: (.+)$/m)?.[1];

  assert.equal(name, 'lorem-event-12-1785114123456');
  assert.match(name, /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/);
});
