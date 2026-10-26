import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ArmBridgeError, requestArm } from './arm.mjs';

const subscription = '00000000-0000-0000-0000-000000000000';
const cluster = `/subscriptions/${subscription}/resourceGroups/demo/providers/Microsoft.ContainerService/managedClusters/test`;
const path = `${cluster}/upgradeInsights?api-version=2026-08-02-preview`;
const token = 'synthetic-token-never-returned-to-the-browser';
function transport(response = new Response(JSON.stringify({ value: [] }))) {
  return {
    azureCli: 'operator-selected-az',
    run: mock.fn(async () => ({ stdout: token + '\n' })),
    fetchImpl: mock.fn(async () => response),
  };
}

test('selects authentication subscription explicitly and keeps bearer tokens out of the result', async () => {
  const dependencies = transport();
  const result = await requestArm({ method: 'GET', path }, dependencies);
  assert.deepEqual(dependencies.run.mock.calls[0].arguments.slice(0, 2), [
    'operator-selected-az',
    ['account', 'get-access-token', '--subscription', subscription, '--resource',
      'https://management.azure.com/', '--query', 'accessToken', '--output', 'tsv', '--only-show-errors'],
  ]);
  const [url, options] = dependencies.fetchImpl.mock.calls[0].arguments;
  assert.equal(url, `https://management.azure.com${path}`);
  assert.equal(options.headers.Authorization, `Bearer ${token}`);
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.AKSHTTPCustomFeatures, undefined);
  assert.equal(JSON.stringify(result).includes(token), false);
});
test('only operator opt-in adds the exact preview header to every insight route', async () => {
  for (const [method, requestPath, body] of [
    ['GET', path],
    ['GET', path + '&$skipToken=next'],
    ['GET', `${cluster}/upgradeInsights/server-name?api-version=2026-08-02-preview`],
    ['POST', `${cluster}/generateUpgradeInsights?api-version=2026-08-02-preview`,
      { upgradeType: 'NodeImage', agentPoolName: 'system' }],
  ]) {
    const dependencies = { ...transport(), previewOptIn: true };
    await requestArm({ method, path: requestPath, body }, dependencies);
    const options = dependencies.fetchImpl.mock.calls[0].arguments[1];
    assert.equal(options.headers.AKSHTTPCustomFeatures, 'Microsoft.ContainerService/AKSUpgradeInsightsPreview');
    if (body) assert.deepEqual(JSON.parse(options.body), body);
  }
  for (const profilePath of [
    `${cluster}/upgradeProfiles/default?api-version=2024-10-01`,
    `${cluster}/agentPools/system/upgradeProfiles/default?api-version=2024-10-01`,
  ]) {
    const dependencies = { ...transport(), previewOptIn: true };
    await requestArm({ method: 'GET', path: profilePath }, dependencies);
    assert.equal(dependencies.fetchImpl.mock.calls[0].arguments[1].headers.AKSHTTPCustomFeatures, undefined);
  }
});
for (const status of [400, 403, 404, 429, 500]) {
  test(`preserves ARM HTTP ${status}, structured body and safe diagnostics`, async () => {
    const body = { error: { code: 'ArmFailure', message: 'Read the ARM error instead of a generic 502.' } };
    const dependencies = transport(new Response(JSON.stringify(body), {
      status, headers: {
        'x-ms-request-id': 'request-id', 'x-ms-correlation-request-id': 'correlation-id',
        'retry-after': '30', Authorization: 'must-not-be-forwarded',
      },
    }));
    const result = await requestArm({ method: 'GET', path }, dependencies);
    assert.equal(result.status, status);
    assert.deepEqual(result.body, body);
    assert.deepEqual(result.headers, {
      'x-ms-request-id': 'request-id', 'x-ms-correlation-request-id': 'correlation-id', 'retry-after': '30',
    });
  });
}
test('preserves Failed readiness as a successful ARM response', async () => {
  const body = { name: 'server-name', properties: { evaluation: { status: 'Failed' } } };
  const result = await requestArm({ method: 'GET', path }, transport(new Response(JSON.stringify(body))));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, body);
});
test('forwards bare RP errors unchanged instead of requiring an ARM error envelope', async () => {
  const body = { code: 'NotFound', message: 'The insight was not found.', subcode: 'MissingInsight' };
  const result = await requestArm({ method: 'GET', path }, transport(new Response(JSON.stringify(body), { status: 404 })));
  assert.equal(result.status, 404);
  assert.deepEqual(result.body, body);
});
test('reports explicit authentication failure without calling ARM or leaking stdout', async () => {
  const dependencies = transport();
  dependencies.run = mock.fn(async () => { throw Object.assign(new Error('CLI failure'), { stderr: 'Sign in required.', stdout: token }); });
  await assert.rejects(requestArm({ method: 'GET', path }, dependencies), error =>
    error instanceof ArmBridgeError && error.status === 401 && error.code === 'AzureAuthenticationFailed' &&
    !error.message.includes(token) && error.message.includes('Sign in required'));
  assert.equal(dependencies.fetchImpl.mock.callCount(), 0);
});
test('does not send an empty credential to ARM', async () => {
  const dependencies = transport();
  dependencies.run = mock.fn(async () => ({ stdout: '\n' }));
  await assert.rejects(requestArm({ method: 'GET', path }, dependencies), { status: 401, code: 'AzureAuthenticationFailed' });
  assert.equal(dependencies.fetchImpl.mock.callCount(), 0);
});
test('preserves the bridge response-size bound after moving away from CLI REST output', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8 * 1024 * 1024));
      controller.enqueue(new Uint8Array(8 * 1024 * 1024));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  await assert.rejects(requestArm({ method: 'GET', path }, transport(new Response(body))),
    { status: 502, code: 'ArmResponseTooLarge' });
});
test('surfaces network failure, cancellation, and invalid ARM JSON explicitly', async () => {
  const dependencies = transport();
  dependencies.fetchImpl = mock.fn(async () => { throw new Error('Network failed'); });
  await assert.rejects(requestArm({ method: 'GET', path }, dependencies), { status: 502, code: 'ArmConnectionFailed' });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requestArm({ method: 'GET', path }, { ...dependencies, signal: controller.signal }),
    { status: 504, code: 'ArmRequestTimeout' });
  await assert.rejects(requestArm({ method: 'GET', path }, transport(new Response('not-json'))),
    { status: 502, code: 'InvalidArmResponse' });
  await assert.rejects(requestArm({ method: 'GET', path },
    transport(new Response('upstream error', { status: 500, headers: { 'x-ms-request-id': 'invalid-json-request' } }))),
  { status: 500, code: 'InvalidArmResponse', headers: { 'x-ms-request-id': 'invalid-json-request' } });
});
