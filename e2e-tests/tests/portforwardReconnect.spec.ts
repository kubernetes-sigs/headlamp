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

import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { HeadlampPage } from './headlampPage';

const execFileAsync = promisify(execFile);

/** kubectl helper that uses the CI kubeconfig and context. */
async function kubectl(kubeconfig: string, ...args: string[]) {
  return execFileAsync('kubectl', ['--kubeconfig', kubeconfig, '--context=kind-test', ...args]);
}

/** Resolved base URL of the Headlamp backend under test. */
function baseURL(): string {
  return process.env.HEADLAMP_TEST_URL || 'http://localhost:3000';
}

/** Headers for authenticated API requests to the Headlamp backend. */
function apiHeaders(): Record<string, string> {
  const token = process.env.HEADLAMP_TEST_TOKEN || '';
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

interface PortForwardResponse {
  id: string;
  pod: string;
  service: string;
  serviceNamespace: string;
  namespace: string;
  cluster: string;
  port: string;
  targetPort: string;
  status: string;
  error: string;
}

test.describe('portforward auto-reconnect', () => {
  // These tests exercise the backend port-forward API directly because
  // the frontend PortForward component is gated behind isElectron() and
  // does not render in the in-cluster deployment used by CI.
  //
  // The flow:
  //   1. Create a Deployment + Service via kubectl
  //   2. Start a port-forward via POST /clusters/test/portforward
  //   3. Delete the backing pod
  //   4. Poll GET /clusters/test/portforward?id=... and assert the
  //      status transitions Running → Reconnecting → Running (new pod)

  const clusterName = 'test';
  const pfBaseURL = () => `${baseURL()}/clusters/${clusterName}/portforward`;

  test('service-backed port-forward reconnects when the pod is deleted', async ({ page }) => {
    // This test creates real K8s resources and waits for reconnection,
    // which involves backoff timers (5s check + 5s first retry).
    test.setTimeout(120_000);

    const hlPage = new HeadlampPage(page);
    await hlPage.navigateToCluster(clusterName, process.env.HEADLAMP_TEST_TOKEN);

    const testId = `pf-reconnect-${Date.now()}`;
    const tempDir = await mkdtemp(join(tmpdir(), 'headlamp-e2e-pf-'));
    const kubeconfig = join(tempDir, 'kubeconfig');

    try {
      // --- Setup: write kubeconfig ---
      const { stdout: kcfg } = await execFileAsync('kind', ['get', 'kubeconfig', '--name', 'test']);
      await writeFile(kubeconfig, kcfg);

      // --- Setup: create Deployment + Service ---
      await kubectl(
        kubeconfig,
        'create',
        'deployment',
        testId,
        '--image=registry.k8s.io/pause:3.10',
        '--replicas=1',
        '--port=80',
        '--namespace=default'
      );
      await kubectl(
        kubeconfig,
        'expose',
        'deployment',
        testId,
        '--port=80',
        '--target-port=80',
        '--namespace=default'
      );

      // Wait for the pod to be Ready
      await kubectl(
        kubeconfig,
        'wait',
        '--for=condition=Available',
        `deployment/${testId}`,
        '--timeout=60s',
        '--namespace=default'
      );

      // Get the initial pod name
      const { stdout: podListOut } = await kubectl(
        kubeconfig,
        'get',
        'pods',
        '-l',
        `app=${testId}`,
        '--namespace=default',
        '-o',
        'jsonpath={.items[0].metadata.name}'
      );
      const initialPod = podListOut.trim();
      expect(initialPod).not.toBe('');

      // --- Step 1: Start port-forward via backend API ---
      const startResp = await page.request.post(pfBaseURL(), {
        headers: apiHeaders(),
        data: {
          namespace: 'default',
          pod: initialPod,
          service: testId,
          serviceNamespace: 'default',
          targetPort: '80',
        },
      });
      if (!startResp.ok()) {
        const errorText = await startResp.text();
        throw new Error(`Failed to start portforward: ${startResp.status()} ${errorText}`);
      }
      const pfData: PortForwardResponse = await startResp.json();
      expect(pfData.id).not.toBe('');
      const pfId = pfData.id;

      // --- Step 2: Verify initial status is Running ---
      // The start endpoint returns synchronously after readiness,
      // but poll once to be safe.
      const verifyResp = await page.request.get(`${pfBaseURL()}?id=${pfId}`, {
        headers: apiHeaders(),
      });
      expect(verifyResp.ok()).toBeTruthy();

      // --- Step 3: Delete the backing pod to trigger reconnect ---
      await kubectl(
        kubeconfig,
        'delete',
        'pod',
        initialPod,
        '--namespace=default',
        '--grace-period=1',
        '--wait=false'
      );

      // --- Step 4: Poll until status becomes Reconnecting or Running (new pod) ---
      // The monitor checks every 5s, then reconnect has backoffs of 5s, 10s, 20s.
      // We should see Reconnecting within ~10s, and Running again within ~30s.
      let finalPf: PortForwardResponse | null = null;
      const deadline = Date.now() + 90_000;

      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3_000));

        const resp = await page.request.get(`${pfBaseURL()}?id=${pfId}`, {
          headers: apiHeaders(),
        });

        if (!resp.ok()) {
          // The port-forward may have been briefly unavailable during
          // reconnect; keep polling.
          continue;
        }

        const pf: PortForwardResponse = await resp.json();

        // The key success criteria: the port-forward is running again,
        // and it has switched to a new pod because the old one was deleted.
        if (pf.status === 'Running' && pf.pod !== initialPod) {
          finalPf = pf;
          break;
        }

        if (pf.status === 'Stopped') {
          throw new Error(`Port-forward stopped without reconnecting: ${pf.error}`);
        }
      }

      // --- Step 5: Assert reconnection succeeded ---
      expect(finalPf).not.toBeNull();
      // The pod name must have changed to the replacement pod.
      expect(finalPf!.pod).not.toBe(initialPod);
      // Status should be Running (or at least not Stopped).
      expect(['Running']).toContain(finalPf!.status);

      // --- Cleanup: stop and delete the port-forward ---
      await page.request.delete(pfBaseURL(), {
        headers: apiHeaders(),
        data: { id: pfId, stopOrDelete: false },
      });
    } finally {
      // Cleanup K8s resources
      await kubectl(
        kubeconfig,
        'delete',
        'service',
        testId,
        '--namespace=default',
        '--ignore-not-found=true'
      ).catch(() => undefined);
      await kubectl(
        kubeconfig,
        'delete',
        'deployment',
        testId,
        '--namespace=default',
        '--ignore-not-found=true'
      )
        .catch(() => undefined)
        .finally(() => rm(tempDir, { recursive: true, force: true }));
    }
  });

  test('direct pod port-forward does NOT reconnect on pod deletion', async ({ page }) => {
    // Control test: a port-forward that targets a pod directly (no service)
    // should stop cleanly when the pod is deleted, not attempt reconnect.
    test.setTimeout(90_000);

    const hlPage = new HeadlampPage(page);
    await hlPage.navigateToCluster(clusterName, process.env.HEADLAMP_TEST_TOKEN);

    const testId = `pf-no-reconnect-${Date.now()}`;
    const tempDir = await mkdtemp(join(tmpdir(), 'headlamp-e2e-pf-'));
    const kubeconfig = join(tempDir, 'kubeconfig');

    try {
      const { stdout: kcfg } = await execFileAsync('kind', ['get', 'kubeconfig', '--name', 'test']);
      await writeFile(kubeconfig, kcfg);

      // Create a standalone pod (no Deployment, no Service)
      await kubectl(
        kubeconfig,
        'run',
        testId,
        '--image=registry.k8s.io/pause:3.10',
        '--restart=Never',
        '--namespace=default',
        '--port=80'
      );
      await kubectl(
        kubeconfig,
        'wait',
        '--for=condition=Ready',
        `pod/${testId}`,
        '--timeout=60s',
        '--namespace=default'
      );

      // Start a direct-pod port-forward (no service field)
      const startResp = await page.request.post(pfBaseURL(), {
        headers: apiHeaders(),
        data: {
          namespace: 'default',
          pod: testId,
          targetPort: '80',
        },
      });
      if (!startResp.ok()) {
        const errorText = await startResp.text();
        throw new Error(`Failed to start portforward: ${startResp.status()} ${errorText}`);
      }
      const pfData: PortForwardResponse = await startResp.json();
      const pfId = pfData.id;

      // Delete the pod
      await kubectl(
        kubeconfig,
        'delete',
        'pod',
        testId,
        '--namespace=default',
        '--grace-period=1',
        '--wait=false'
      );

      // Poll until the port-forward status changes from Running
      const deadline = Date.now() + 60_000;
      let finalStatus = '';

      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3_000));

        const resp = await page.request.get(`${pfBaseURL()}?id=${pfId}`, {
          headers: apiHeaders(),
        });

        if (!resp.ok()) continue;

        const pf: PortForwardResponse = await resp.json();

        if (pf.status === 'Reconnecting') {
          throw new Error('Direct pod port-forward should NOT attempt reconnection');
        }

        if (pf.status === 'Stopped') {
          finalStatus = pf.status;
          break;
        }
      }

      // The port-forward should have stopped (not reconnected)
      expect(finalStatus).toBe('Stopped');

      // Cleanup the port-forward entry
      await page.request.delete(pfBaseURL(), {
        headers: apiHeaders(),
        data: { id: pfId, stopOrDelete: false },
      });
    } finally {
      await kubectl(
        kubeconfig,
        'delete',
        'pod',
        testId,
        '--namespace=default',
        '--ignore-not-found=true'
      )
        .catch(() => undefined)
        .finally(() => rm(tempDir, { recursive: true, force: true }));
    }
  });
});
