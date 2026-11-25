/*
 * Copyright 2026 The Kubernetes Authors
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

import { expect, type Locator, test as base, type WebSocketRoute } from '@playwright/test';

const cluster = process.env.HEADLAMP_TEST_CLUSTER || 'test';
const token = process.env.HEADLAMP_TEST_TOKEN;
const clusterPath = `/clusters/${encodeURIComponent(cluster)}`;
const headers = {
  'X-HEADLAMP_BACKEND-TOKEN': process.env.HEADLAMP_TEST_BACKEND_TOKEN || 'headlamp',
  Authorization: `Bearer ${token}`,
};

const test = base.extend<{ logsNamespace: string }>({
  logsNamespace: async ({ request }, use, testInfo) => {
    expect(
      token,
      'Set HEADLAMP_TEST_TOKEN to a token with access to the real test cluster'
    ).toBeTruthy();
    const namespace = `log-stream-${testInfo.workerIndex}-${testInfo.retry}-${Date.now().toString(
      36
    )}`;
    const created = await request.post(`${clusterPath}/api/v1/namespaces`, {
      headers,
      data: { apiVersion: 'v1', kind: 'Namespace', metadata: { name: namespace } },
    });
    expect(created.status(), await created.text()).toBe(201);
    try {
      await use(namespace);
    } finally {
      const deleted = await request.delete(`${clusterPath}/api/v1/namespaces/${namespace}`, {
        headers,
      });
      expect(deleted.ok(), await deleted.text()).toBe(true);
    }
  },
});

test.use({ actionTimeout: 15_000, screenshot: 'only-on-failure' });

function latestSequence(text: string) {
  return Math.max(-1, ...Array.from(text.matchAll(/log-seq-(\d+)/g), match => Number(match[1])));
}

async function expectStreaming(terminal: Locator) {
  await expect(terminal).toContainText('log-seq-');
  const sequence = latestSequence(await terminal.innerText());
  await expect
    .poll(async () => latestSequence(await terminal.innerText()))
    .toBeGreaterThan(sequence);
}

for (const viewer of ['pod', 'workload (all pods)', 'workload (selected pod)']) {
  test(`${viewer} logs keep streaming across Since changes and Reconnect`, async ({
    page,
    logsNamespace: namespace,
  }, testInfo) => {
    test.setTimeout(120_000);
    const namespacePath = `${clusterPath}/api/v1/namespaces/${namespace}`;
    const deploymentPath = `${clusterPath}/apis/apps/v1/namespaces/${namespace}/deployments`;
    const authenticated = await page.request.post(`${clusterPath}/set-token`, {
      headers,
      data: { token },
    });
    expect(authenticated.ok(), await authenticated.text()).toBe(true);
    const deployment = await page.request.post(deploymentPath, {
      headers,
      data: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'log-stream', namespace },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: 'log-stream' } },
          template: {
            metadata: { labels: { app: 'log-stream' } },
            spec: {
              containers: [
                {
                  name: 'logger',
                  image: 'nginx:1.27',
                  command: [
                    '/bin/sh',
                    '-c',
                    'i=0; while true; do echo "log-seq-$i"; i=$((i + 1)); sleep 1; done',
                  ],
                },
              ],
            },
          },
        },
      },
    });
    expect(deployment.status(), await deployment.text()).toBe(201);
    await expect
      .poll(
        async () => {
          const response = await page.request.get(`${deploymentPath}/log-stream`, { headers });
          expect(response.ok(), await response.text()).toBe(true);
          return (await response.json()).status?.availableReplicas ?? 0;
        },
        { timeout: 60_000 }
      )
      .toBe(1);
    const pods = await page.request.get(`${namespacePath}/pods?labelSelector=app%3Dlog-stream`, {
      headers,
    });
    expect(pods.ok(), await pods.text()).toBe(true);
    const { items } = await pods.json();
    expect(items).toHaveLength(1);
    const podName: string = items[0].metadata.name;

    const streams: Array<{
      client: WebSocketRoute;
      server: WebSocketRoute;
      url: URL;
      closed: boolean;
    }> = [];
    await page.routeWebSocket(
      url => url.pathname === `${namespacePath}/pods/${podName}/log`,
      client => {
        // Forward real Kubernetes log traffic, intercepting only connection closure.
        const server = client.connectToServer();
        const stream = { client, server, url: new URL(client.url()), closed: false };
        streams.push(stream);
        client.onClose((code, reason) => {
          stream.closed = true;
          return server.close({ code, reason });
        });
        server.onClose((code, reason) => {
          stream.closed = true;
          return client.close({ code, reason });
        });
      }
    );

    const resource =
      viewer === 'pod' ? `pods/${namespace}/${podName}` : `deployments/${namespace}/log-stream`;
    await page.goto(`/c/${encodeURIComponent(cluster)}/${resource}`);
    await expect(page.getByRole('button', { name: /^Show logs$/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: /^Show logs$/i }).click();
    const terminal = page.locator('#xterm-container .xterm-rows');
    await expectStreaming(terminal);
    await expect.poll(() => streams.filter(stream => !stream.closed).length).toBe(1);
    expect(streams[streams.length - 1].url.searchParams.has('sinceSeconds')).toBe(false);

    async function changeSince(label: string, sinceSeconds: string | null) {
      const previous = streams[streams.length - 1];
      const count = streams.length;
      const since = page.getByRole('combobox', { name: /^Since\b/ });
      await since.focus();
      await since.press('ArrowDown');
      await page.getByRole('option', { name: label, exact: true }).click();
      await expect.poll(() => streams.length).toBe(count + 1);
      await expect.poll(() => previous.closed).toBe(true);
      const current = streams[streams.length - 1];
      expect(current.url.searchParams.get('sinceSeconds')).toBe(sinceSeconds);
      expect(current.url.searchParams.get('tailLines')).toBe('100');
      expect(current.url.searchParams.get('follow')).toBe('true');
      await expectStreaming(terminal);
      await expect.poll(() => streams.filter(stream => !stream.closed).length).toBe(1);
    }

    await changeSince('Last 15 minutes', '900');
    if (viewer === 'workload (selected pod)') {
      const previous = streams[streams.length - 1];
      const count = streams.length;
      const pod = page.getByRole('combobox', { name: /^Select Pod\b/ });
      await pod.focus();
      await pod.press('ArrowDown');
      await page.getByRole('option', { name: podName, exact: true }).click();
      await expect.poll(() => streams.length).toBe(count + 1);
      await expect.poll(() => previous.closed).toBe(true);
      expect(streams[streams.length - 1].url.searchParams.get('sinceSeconds')).toBe('900');
      await expectStreaming(terminal);
    }

    const disconnected = streams[streams.length - 1];
    await disconnected.client.close({ code: 1011, reason: 'E2E connection interruption' });
    await disconnected.server.close();
    disconnected.closed = true;
    const reconnect = page.getByRole('button', { name: 'Reconnect', exact: true });
    await expect(reconnect).toBeVisible();
    const count = streams.length;
    await reconnect.focus();
    await reconnect.press('Enter');
    await expect.poll(() => streams.length).toBe(count + 1);
    expect(streams[streams.length - 1].url.searchParams.get('sinceSeconds')).toBe('900');
    await expect(reconnect).toBeHidden();
    await expectStreaming(terminal);
    await page.screenshot({ path: testInfo.outputPath('streaming-reconnected.png') });

    await changeSince('Last 5 minutes', '300');
    await changeSince('All time', null);
  });
}
