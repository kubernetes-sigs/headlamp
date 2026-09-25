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

import { expect, Page, test } from '@playwright/test';
import { HeadlampPage } from './headlampPage';
const yaml = require('yaml');
const util = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const execFile = util.promisify(require('child_process').execFile);

// The kubeconfig context the e2e environment targets; setup-multicluster.sh
// creates it as the hub cluster (test2 is created afterwards, so the current
// context cannot be relied upon to point here).
const TEST_CONTEXT = 'test';

// Tests tagged with this run against kubeconfig fixtures only and skip the
// UI setup in beforeEach — they never talk to the Headlamp page.
const KUBECONFIG_ONLY_TAG = '@kubeconfig-only';

let headlampPage: HeadlampPage;

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.tags.includes(KUBECONFIG_ONLY_TAG)) {
    return;
  }

  headlampPage = new HeadlampPage(page);

  // Navigate to the test cluster page
  await headlampPage.navigateTopage('/c/test');

  // Authenticate only when the auth page appears (e.g. minikube with token auth).
  // Use a short wait to avoid racing page hydration in slower environments.
  const authHeader = page.locator('h1:has-text("Authentication")');
  const hasAuthPage = await authHeader
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (hasAuthPage) {
    await headlampPage.authenticate(process.env.HEADLAMP_TEST_TOKEN);
  }
});

test('There is cluster choose button and test cluster is selected', async () => {
  await headlampPage.pageLocatorContent(
    'button:has-text("Our Cluster Chooser button. Cluster: test")',
    'Our Cluster Chooser button. Cluster: test'
  );
});

test('Store modified kubeconfig to IndexDB and check if present', async ({ page }) => {
  const base64EncodedKubeconfig = await getBase64EncodedKubeconfig();
  await saveKubeconfigToIndexDB(page, base64EncodedKubeconfig);
  await page.waitForLoadState('load');

  const storedKubeconfig = await getKubeconfigFromIndexDB(page);
  await page.waitForLoadState('load');

  expect(storedKubeconfig).not.toBeNull();
});

test('parseKubeConfig endpoint accepts kubeconfigs array format', async ({ page }) => {
  const base64EncodedKubeconfig = await getBase64EncodedKubeconfig();

  // Call /parseKubeConfig with the correct kubeconfigs (plural, array) format
  const response = await page.evaluate(async (kubeconfig: string) => {
    const resp = await fetch('/parseKubeConfig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kubeconfigs: [kubeconfig] }),
    });
    return { status: resp.status, body: await resp.json() };
  }, base64EncodedKubeconfig);

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('clusters');
  expect(Array.isArray(response.body.clusters)).toBe(true);
  expect(response.body.clusters.length).toBeGreaterThan(0);
  expect(response.body.clusters.some((c: { name: string }) => c.name === 'dummy')).toBe(true);
});

test('parseKubeConfig endpoint rejects singular kubeconfig format', async ({ page }) => {
  const base64EncodedKubeconfig = await getBase64EncodedKubeconfig();

  // Verify the old singular kubeconfig format is rejected by the backend
  const rejectResponse = await page.evaluate(async (kubeconfig: string) => {
    const resp = await fetch('/parseKubeConfig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kubeconfig: kubeconfig }),
    });
    return { status: resp.status };
  }, base64EncodedKubeconfig);

  // The backend requires kubeconfigs (plural, array) and rejects kubeconfig (singular)
  expect(rejectResponse.status).toBe(400);
});

test('stateless cluster loads without errors after storing kubeconfig', async ({ page }) => {
  const base64EncodedKubeconfig = await getBase64EncodedKubeconfig();
  const parseKubeConfigStatuses: number[] = [];
  const browserErrors: string[] = [];

  page.on('response', response => {
    if (response.url().includes('/parseKubeConfig')) {
      parseKubeConfigStatuses.push(response.status());
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      browserErrors.push(msg.text());
    }
  });

  // Step 1: Store kubeconfig in IndexedDB (simulates the user adding a cluster)
  await saveKubeconfigToIndexDB(page, base64EncodedKubeconfig);

  // Step 2: Reload to trigger stateless startup parsing flow.
  await page.reload({ waitUntil: 'load' });
  await page.waitForResponse(response => response.url().includes('/parseKubeConfig'));

  expect(parseKubeConfigStatuses.length).toBeGreaterThan(0);
  expect(parseKubeConfigStatuses.every(status => status === 200)).toBe(true);
  expect(browserErrors.some(msg => msg.includes('kubeconfigs is required'))).toBe(false);

  // Confirm the stateless cluster can be loaded after reload.
  await headlampPage.navigateTopage('/c/dummy');
  await headlampPage.pageLocatorContent(
    'button:has-text("Our Cluster Chooser button. Cluster: dummy")',
    'Our Cluster Chooser button. Cluster: dummy'
  );
});

test('stateless cluster can start a port forward', async ({ page }) => {
  const clusterName = 'dummy';
  const userID = 'port-forward-e2e-user';
  const portForwardID = `stateless-port-forward-${Date.now()}`;
  const base64EncodedKubeconfig = await getBase64EncodedKubeconfig(clusterName);

  if (!base64EncodedKubeconfig) {
    throw new Error('Failed to generate a kubeconfig for the port-forward test');
  }

  const result = await page.evaluate(
    async ({ cluster, kubeconfig, id, user }) => {
      const headers = {
        'Content-Type': 'application/json',
        KUBECONFIG: kubeconfig,
        'X-HEADLAMP-USER-ID': user,
      };
      const podResponse = await fetch(
        `/clusters/${cluster}/api/v1/namespaces/kube-system/pods?labelSelector=app.kubernetes.io%2Fname%3Dheadlamp`,
        { headers }
      );
      const podResponseBody = await podResponse.text();

      if (!podResponse.ok) {
        return { status: podResponse.status, body: podResponseBody };
      }

      const pods = JSON.parse(podResponseBody);
      const podName = pods.items?.[0]?.metadata?.name;
      if (!podName) {
        return { status: 404, body: 'Headlamp pod not found' };
      }

      const startResponse = await fetch(`/clusters/${cluster}/portforward`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id,
          namespace: 'kube-system',
          pod: podName,
          service: '',
          serviceNamespace: '',
          targetPort: '4466',
        }),
      });
      const startResponseBody = await startResponse.text();

      if (startResponse.ok) {
        await fetch(`/clusters/${cluster}/portforward`, {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ id, stopOrDelete: false }),
        });
      }

      return { status: startResponse.status, body: startResponseBody };
    },
    {
      cluster: clusterName,
      kubeconfig: base64EncodedKubeconfig,
      id: portForwardID,
      user: userID,
    }
  );

  expect(result.status, result.body).toBe(200);
});

test('reload does not trigger stateless parsing when IndexedDB is empty', async ({ page }) => {
  await clearKubeconfigsFromIndexDB(page);

  const parseKubeConfigStatuses: number[] = [];

  page.on('response', response => {
    if (response.url().includes('/parseKubeConfig')) {
      parseKubeConfigStatuses.push(response.status());
    }
  });

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);

  expect(parseKubeConfigStatuses).toHaveLength(0);
});

test('adding another stateless cluster keeps previously added clusters available', async ({
  page,
}) => {
  await clearKubeconfigsFromIndexDB(page);

  const firstClusterName = 'dummy';
  const secondClusterName = 'dummy-two';
  const firstKubeconfig = await getBase64EncodedKubeconfig(firstClusterName);
  const secondKubeconfig = await getBase64EncodedKubeconfig(secondClusterName);

  await saveKubeconfigToIndexDB(page, firstKubeconfig);
  await saveKubeconfigToIndexDB(page, secondKubeconfig);

  await page.reload({ waitUntil: 'load' });
  await page.waitForResponse(response => response.url().includes('/parseKubeConfig'));

  await headlampPage.navigateTopage(`/c/${firstClusterName}`);
  await headlampPage.pageLocatorContent(
    `button:has-text("Our Cluster Chooser button. Cluster: ${firstClusterName}")`,
    `Our Cluster Chooser button. Cluster: ${firstClusterName}`
  );

  await headlampPage.navigateTopage(`/c/${secondClusterName}`);
  await headlampPage.pageLocatorContent(
    `button:has-text("Our Cluster Chooser button. Cluster: ${secondClusterName}")`,
    `Our Cluster Chooser button. Cluster: ${secondClusterName}`
  );
});

test('deleting a backend-managed cluster reloads the home page', async ({ page }, testInfo) => {
  const clusterName = `delete-reload-${testInfo.workerIndex}-${Date.now()}`;
  let clusterDeleted = false;

  await page.route('**/config', async route => {
    const response = await route.fetch();
    const config = await response.json();
    const clusters = clusterDeleted
      ? config.clusters
      : [
          ...config.clusters,
          {
            name: clusterName,
            auth_type: '',
            meta_data: { source: 'dynamic_cluster' },
          },
        ];
    await route.fulfill({ response, json: { ...config, clusters } });
  });

  await page.route(`**/cluster/${clusterName}`, async route => {
    if (route.request().method() !== 'DELETE') {
      await route.fallback();
      return;
    }

    clusterDeleted = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [] }),
    });
  });

  await page.goto('/');
  const clusterRow = page.locator('table tbody tr', { hasText: clusterName });
  await expect(clusterRow).toBeVisible();

  await page.evaluate(() => {
    (window as any).__clusterDeletionPageMarker = true;
  });

  await clusterRow.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.getByRole('button', { name: 'Delete' }).click(),
  ]);

  expect(await page.evaluate(() => (window as any).__clusterDeletionPageMarker)).toBeUndefined();
  await expect(page.locator('table tbody tr', { hasText: clusterName })).toHaveCount(0);
});

test('valid kubeconfig is still parsed when an invalid one is also sent', async ({ page }) => {
  const validKubeconfig = await getBase64EncodedKubeconfig();
  // A clearly invalid kubeconfig that cannot be decoded
  const invalidKubeconfig = 'not-valid-base64-!!!';

  // Send both in one request — one valid, one invalid.
  // The backend should return the valid cluster rather than discarding it entirely.
  const response = await page.evaluate(
    async ({ valid, invalid }: { valid: string; invalid: string }) => {
      const resp = await fetch('/parseKubeConfig', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kubeconfigs: [valid, invalid] }),
      });
      const body = resp.status === 200 ? await resp.json() : await resp.text();
      return { status: resp.status, body };
    },
    { valid: validKubeconfig, invalid: invalidKubeconfig }
  );

  expect(response.status).toBe(200);
  expect(Array.isArray(response.body.clusters)).toBe(true);
  expect(response.body.clusters.some((c: { name: string }) => c.name === 'dummy')).toBe(true);
});

// Produce a self-contained kubeconfig for one context. --minify keeps only
// the selected context so credentials for unrelated contexts are never
// embedded or sent to the test Headlamp instance, --context pins which one
// (the current context is whatever was last touched, e.g. test2 after
// setup-multicluster.sh), and --raw --flatten inlines certificate data, so
// kubeconfigs that embed certificates (*-data keys) or reference them with
// relative paths work without manual file handling.
const normalizeKubeconfig = async (context: string, kubeconfigPath?: string) => {
  const { stdout } = await execFile(
    'kubectl',
    ['config', 'view', '--minify', '--raw', '--flatten', '--context', context, '--output', 'json'],
    kubeconfigPath ? { env: { ...process.env, KUBECONFIG: kubeconfigPath } } : undefined
  );
  return JSON.parse(stdout);
};

const getBase64EncodedKubeconfig = async (clusterName: string = 'dummy') => {
  const kubeconfig = await normalizeKubeconfig(TEST_CONTEXT);
  // Update the existing cluster and context names to the requested test cluster.
  kubeconfig.clusters[0].name = clusterName;
  // The 10.96.0.0/12: is the CIDR used by service cluster IP’s
  // and the first service that is created is that of minikube when it bootstraps the cluster.
  // It will always get 10.96.0.1 IP assigned. For more context please check https://minikube.sigs.k8s.io/docs/handbook/vpn_and_proxy/.
  kubeconfig.clusters[0].cluster.server = 'https://10.96.0.1:443';
  kubeconfig.contexts[0].name = clusterName;
  kubeconfig.users[0].name = clusterName;
  kubeconfig.contexts[0].context.user = clusterName;
  kubeconfig.contexts[0].context.cluster = clusterName;

  // Set the current context to the generated cluster name.
  kubeconfig['current-context'] = clusterName;

  // Convert JSON back to YAML
  const kubeconfigYaml = yaml.stringify(kubeconfig);

  return Buffer.from(kubeconfigYaml).toString('base64');
};

// Regression coverage for the kubeconfig normalization itself. These run
// kubectl against on-disk fixtures, so they need no cluster and no UI.
test.describe('kubeconfig normalization', () => {
  let fixtureDir: string;

  const writeFixture = (kubeconfig: object) => {
    const kubeconfigPath = path.join(fixtureDir, 'kubeconfig');
    fs.writeFileSync(kubeconfigPath, yaml.stringify(kubeconfig));
    return kubeconfigPath;
  };

  test.beforeEach(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-kubeconfig-'));
  });

  test.afterEach(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  test(
    'keeps embedded certificate data and excludes unrelated contexts',
    { tag: KUBECONFIG_ONLY_TAG },
    async () => {
      const caData = Buffer.from('FIXTURE-CA').toString('base64');
      const unrelatedSecret = Buffer.from('UNRELATED-SECRET').toString('base64');
      const kubeconfigPath = writeFixture({
        apiVersion: 'v1',
        kind: 'Config',
        // The unrelated context is current — normalization must not follow it.
        'current-context': 'unrelated',
        clusters: [
          {
            name: 'target',
            cluster: { server: 'https://127.0.0.1:65535', 'certificate-authority-data': caData },
          },
          {
            name: 'unrelated',
            cluster: {
              server: 'https://127.0.0.2:65535',
              'certificate-authority-data': unrelatedSecret,
            },
          },
        ],
        users: [
          { name: 'target', user: { token: 'target-token' } },
          { name: 'unrelated', user: { token: 'unrelated-token' } },
        ],
        contexts: [
          { name: 'target', context: { cluster: 'target', user: 'target' } },
          { name: 'unrelated', context: { cluster: 'unrelated', user: 'unrelated' } },
        ],
      });

      const normalized = await normalizeKubeconfig('target', kubeconfigPath);

      expect(normalized.clusters).toHaveLength(1);
      expect(normalized.clusters[0].name).toBe('target');
      expect(normalized.clusters[0].cluster['certificate-authority-data']).toBe(caData);
      expect(normalized['current-context']).toBe('target');

      // Nothing from the unrelated context may leak into the output.
      const serialized = JSON.stringify(normalized);
      expect(serialized).not.toContain('unrelated');
      expect(serialized).not.toContain(unrelatedSecret);
    }
  );

  test(
    'inlines certificates referenced with kubeconfig-relative paths',
    { tag: KUBECONFIG_ONLY_TAG },
    async () => {
      const caContent = 'FIXTURE-RELATIVE-CA\n';
      const certContent = 'FIXTURE-RELATIVE-CERT\n';
      const keyContent = 'FIXTURE-RELATIVE-KEY\n';
      fs.writeFileSync(path.join(fixtureDir, 'ca.crt'), caContent);
      fs.writeFileSync(path.join(fixtureDir, 'client.crt'), certContent);
      fs.writeFileSync(path.join(fixtureDir, 'client.key'), keyContent);
      const kubeconfigPath = writeFixture({
        apiVersion: 'v1',
        kind: 'Config',
        'current-context': 'target',
        clusters: [
          {
            name: 'target',
            cluster: { server: 'https://127.0.0.1:65535', 'certificate-authority': 'ca.crt' },
          },
        ],
        users: [
          {
            name: 'target',
            user: { 'client-certificate': 'client.crt', 'client-key': 'client.key' },
          },
        ],
        contexts: [{ name: 'target', context: { cluster: 'target', user: 'target' } }],
      });

      const normalized = await normalizeKubeconfig('target', kubeconfigPath);

      const cluster = normalized.clusters[0].cluster;
      const user = normalized.users[0].user;
      expect(cluster['certificate-authority-data']).toBe(
        Buffer.from(caContent).toString('base64')
      );
      expect(cluster['certificate-authority']).toBeUndefined();
      expect(user['client-certificate-data']).toBe(Buffer.from(certContent).toString('base64'));
      expect(user['client-key-data']).toBe(Buffer.from(keyContent).toString('base64'));
      expect(user['client-certificate']).toBeUndefined();
      expect(user['client-key']).toBeUndefined();
    }
  );
});

const saveKubeconfigToIndexDB = async (page: Page, base64EncodedKubeconfig: string) => {
  await page.evaluate(base64EncodedKubeconfig => {
    return new Promise<void>((resolve, reject) => {
      // Open or create an IndexDB database
      const request = indexedDB.open('kubeconfigs', 1);

      // Handle database creation or upgrade
      request.onupgradeneeded = function (event: any) {
        const db = event.target ? event.target.result : null;
        // Create the object store if it doesn't exist
        if (!db.objectStoreNames.contains('kubeconfigStore')) {
          db.createObjectStore('kubeconfigStore', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      };

      request.onsuccess = (event: any) => {
        const db = event.target.result;
        const transaction = db.transaction(['kubeconfigStore'], 'readwrite');
        const store = transaction.objectStore('kubeconfigStore');

        // Add the base64 encoded kubeconfig to the IndexDB store
        const addRequest = store.add({ kubeconfig: base64EncodedKubeconfig });

        transaction.oncomplete = () => {
          db.close();
          resolve();
        };

        transaction.onerror = () => {
          db.close();
          reject(new Error('Error committing kubeconfig transaction'));
        };

        transaction.onabort = () => {
          db.close();
          reject(new Error('Kubeconfig transaction aborted'));
        };

        addRequest.onerror = () => {
          console.error('Error adding kubeconfig to IndexDB');
          db.close();
          reject(new Error('Error adding kubeconfig to IndexDB'));
        };
      };

      request.onerror = function (event: any) {
        console.error('Error opening the database:', event.target.error);
        reject(event.target.error);
      };
    });
  }, base64EncodedKubeconfig);
};

const getKubeconfigFromIndexDB = async (page: Page) => {
  const storedKubeconfig = await page.evaluate(() => {
    return new Promise<string | null>((resolve, reject) => {
      const request = indexedDB.open('kubeconfigs', 1);

      request.onsuccess = (event: any) => {
        const db = event.target.result;
        const transaction = db.transaction(['kubeconfigStore'], 'readwrite');
        const store = transaction.objectStore('kubeconfigStore');

        const getRequest = store.getAll();

        getRequest.onsuccess = () => {
          const storedItems = getRequest.result;
          if (storedItems.length > 0) {
            resolve(storedItems[0].kubeconfig);
          } else {
            resolve(null);
          }
        };

        getRequest.onerror = () => {
          reject('Error getting kubeconfig from IndexDB');
        };

        transaction.oncomplete = () => {
          db.close();
        };
      };

      request.onerror = (event: any) => {
        reject(`Error opening the database: ${event.target.error}`);
      };
    });
  });

  return storedKubeconfig;
};

const clearKubeconfigsFromIndexDB = async (page: Page) => {
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('kubeconfigs', 1);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('kubeconfigStore')) {
          db.createObjectStore('kubeconfigStore', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      };

      request.onsuccess = (event: any) => {
        const db = event.target.result;
        const transaction = db.transaction(['kubeconfigStore'], 'readwrite');
        const store = transaction.objectStore('kubeconfigStore');
        store.clear();

        transaction.oncomplete = () => {
          db.close();
          resolve();
        };

        transaction.onerror = () => {
          db.close();
          reject(new Error('Error clearing kubeconfig store'));
        };

        transaction.onabort = () => {
          db.close();
          reject(new Error('Aborted clearing kubeconfig store'));
        };
      };

      request.onerror = (event: any) => {
        reject(event.target.error);
      };
    });
  });
};
