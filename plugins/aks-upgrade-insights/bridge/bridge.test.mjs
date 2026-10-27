import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { validateRequest } from './validation.mjs';

const subscription = '00000000-0000-0000-0000-000000000000';
let child, base, key;
before(async () => {
  child = spawn(process.execPath, ['bridge/server.mjs', '--subscriptions', subscription], {
    env: { ...process.env, BRIDGE_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Bridge startup timed out')), 15_000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      base = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      key = output.match(/never commit\): ([a-f0-9]{64})/)?.[1];
      if (base && key) { clearTimeout(timer); resolve(); }
    });
    child.on('error', reject);
    child.on('exit', code => { if (!base) { clearTimeout(timer); reject(new Error(`Bridge exited: ${code}`)); } });
  });
});
after(async () => {
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
});
const headers = () => ({ 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5178', 'X-Bridge-Key': key });
async function request(body, customHeaders = headers()) {
  return fetch(`${base}/arm`, { method: 'POST', headers: customHeaders, body: JSON.stringify(body) });
}
test('health endpoint is responsive and does not expose credentials', async () => {
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: 'aks-upgrade-insights', mode: 'read-only' });
});
test('rejects unpaired callers', async () => {
  const response = await request({}, { ...headers(), 'X-Bridge-Key': 'wrong' });
  assert.equal(response.status, 401);
});
test('rejects unapproved browser origins', async () => {
  const response = await request({}, { ...headers(), Origin: 'https://evil.example' });
  assert.equal(response.status, 403);
});
test('requires origin even with pairing key', async () => {
  const { Origin, ...rest } = headers();
  const response = await request({}, rest);
  assert.equal(response.status, 403);
});
test('supports scoped preflight', async () => {
  const response = await fetch(`${base}/arm`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5178' } });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5178');
});
test('exposes only the ARM diagnostics needed by the paired browser', async () => {
  const response = await request({}, { ...headers(), 'X-Bridge-Key': 'wrong' });
  assert.equal(response.headers.get('access-control-expose-headers'), 'x-ms-request-id, x-ms-correlation-request-id, retry-after');
});
test('rejects live generation in default read-only mode', async () => {
  const response = await request({
    method: 'POST', path: `/subscriptions/${subscription}/resourceGroups/demo/providers/Microsoft.ContainerService/managedClusters/test/generateUpgradeInsights?api-version=2026-08-02-preview`,
    body: { upgradeType: 'ControlPlane', targetKubernetesVersion: '1.34.2' },
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /read-only/);
});
test('rejects any cluster upgrade or resource modification endpoint', async () => {
  const response = await request({ method: 'POST', path: `/subscriptions/${subscription}/resourceGroups/demo/providers/Microsoft.ContainerService/managedClusters/test/upgrade?api-version=2026-08-02-preview` });
  assert.equal(response.status, 400);
});
test('rejects requests to other subscriptions', async () => {
  const response = await request({ method: 'GET', path: '/subscriptions/11111111-1111-1111-1111-111111111111/providers/Microsoft.ContainerService/managedClusters?api-version=2026-08-02-preview' });
  assert.equal(response.status, 400);
});
test('allows read-only Fleet inventory and member endpoints without issuing cloud requests', () => {
  for (const path of [
    `/subscriptions/${subscription}/providers/Microsoft.ContainerService/fleets?api-version=2025-03-01`,
    `/subscriptions/${subscription}/resourceGroups/demo/providers/Microsoft.ContainerService/fleets/production/members?api-version=2025-03-01`,
    `/subscriptions/${subscription}/resourceGroups/demo/providers/Microsoft.ContainerService/managedClusters/test/upgradeProfiles/default?api-version=2024-10-01`,
    `/subscriptions/${subscription}/resourceGroups/demo/providers/Microsoft.ContainerService/managedClusters/test/agentPools/system/upgradeProfiles/default?api-version=2024-10-01`,
  ]) {
    assert.deepEqual(validateRequest({ method: 'GET', path }, [subscription]), { method: 'GET', path });
  }
  assert.throws(() => validateRequest({
    method: 'POST',
    path: `/subscriptions/${subscription}/resourceGroups/demo/providers/Microsoft.ContainerService/fleets/production/members/member?api-version=2025-03-01`,
  }, [subscription]), /read-only/);
});
test('rejects absolute URLs and other API versions', async () => {
  for (const path of ['https://evil.example', `/subscriptions/${subscription}/providers/Microsoft.ContainerService/managedClusters?api-version=2025-01-01`]) {
    assert.equal((await request({ method: 'GET', path })).status, 400);
  }
});
test('allows opaque named insight GETs and continuation tokens only within the allowlisted scope', () => {
  const cluster = `/subscriptions/${subscription}/resourceGroups/demo/providers/Microsoft.ContainerService/managedClusters/test`;
  for (const path of [
    `${cluster}/upgradeInsights/server-controlled-name?api-version=2026-08-02-preview`,
    `${cluster}/upgradeInsights?api-version=2026-08-02-preview&$skipToken=opaque`,
  ]) {
    assert.deepEqual(validateRequest({ method: 'GET', path }, [subscription]), { method: 'GET', path });
  }
  for (const suffix of ['name/child', 'name%2fchild', 'name%5cchild', '%2e%2e/upgrade']) {
    assert.throws(() => validateRequest({
      method: 'GET', path: `${cluster}/upgradeInsights/${suffix}?api-version=2026-08-02-preview`,
    }, [subscription]));
  }
  assert.throws(() => validateRequest({
    method: 'GET', path: `${cluster}/upgradeInsights/name?api-version=2026-08-02-preview`,
    headers: { AKSHTTPCustomFeatures: 'unapproved-client-value' },
  }, [subscription]));
});
test('rejects unknown request fields and incomplete generation bodies', async () => {
  const response = await request({ method: 'POST', path: '/subscriptions/test', body: { upgradeType: 'AgentPool' }, unexpected: true });
  assert.equal(response.status, 400);
});
