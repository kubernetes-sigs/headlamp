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
const yaml = require('yaml');

const execFileAsync = promisify(execFile);

let headlampPage: HeadlampPage;
const KUBECONFIG_ONLY_TAG = '@kubeconfig-only';

test.describe('dynamic cluster UI', () => {
  test.beforeEach(async ({ page }) => {
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
});

const makeKubeconfig = (cluster: Record<string, string>, user: Record<string, string>) => ({
  apiVersion: 'v1',
  kind: 'Config',
  clusters: [
    {
      name: 'source',
      cluster: { server: 'https://127.0.0.1:6443', ...cluster },
    },
  ],
  contexts: [{ name: 'source', context: { cluster: 'source', user: 'source' } }],
  users: [{ name: 'source', user }],
  'current-context': 'source',
});

test('normalizes embedded kubeconfig certificates', { tag: KUBECONFIG_ONLY_TAG }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'headlamp-kubeconfig-'));
  const kubeconfigPath = join(directory, 'config');

  try {
    await writeFile(
      kubeconfigPath,
      yaml.stringify(
        makeKubeconfig(
          {
            'certificate-authority-data': Buffer.from('embedded-ca').toString('base64'),
          },
          {
            'client-certificate-data': Buffer.from('embedded-cert').toString('base64'),
            'client-key-data': Buffer.from('embedded-key').toString('base64'),
          }
        )
      )
    );

    const encoded = await getBase64EncodedKubeconfig('embedded', kubeconfigPath);
    const normalized = yaml.parse(Buffer.from(encoded, 'base64').toString());

    expect(normalized.clusters[0].cluster).toMatchObject({
      'certificate-authority-data': 'ZW1iZWRkZWQtY2E=',
    });
    expect(normalized.users[0].user).toMatchObject({
      'client-certificate-data': 'ZW1iZWRkZWQtY2VydA==',
      'client-key-data': 'ZW1iZWRkZWQta2V5',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  'normalizes certificate paths relative to the kubeconfig',
  { tag: KUBECONFIG_ONLY_TAG },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'headlamp-kubeconfig-'));
    const kubeconfigPath = join(directory, 'config');

    try {
      await Promise.all([
        writeFile(join(directory, 'ca.crt'), 'relative-ca'),
        writeFile(join(directory, 'client.crt'), 'relative-cert'),
        writeFile(join(directory, 'client.key'), 'relative-key'),
      ]);
      await writeFile(
        kubeconfigPath,
        yaml.stringify(
          makeKubeconfig(
            { 'certificate-authority': 'ca.crt' },
            { 'client-certificate': 'client.crt', 'client-key': 'client.key' }
          )
        )
      );

      const encoded = await getBase64EncodedKubeconfig('relative', kubeconfigPath);
      const normalized = yaml.parse(Buffer.from(encoded, 'base64').toString());

      expect(normalized.clusters[0].cluster).toMatchObject({
        'certificate-authority-data': 'cmVsYXRpdmUtY2E=',
      });
      expect(normalized.clusters[0].cluster).not.toHaveProperty('certificate-authority');
      expect(normalized.users[0].user).toMatchObject({
        'client-certificate-data': 'cmVsYXRpdmUtY2VydA==',
        'client-key-data': 'cmVsYXRpdmUta2V5',
      });
      expect(normalized.users[0].user).not.toHaveProperty('client-certificate');
      expect(normalized.users[0].user).not.toHaveProperty('client-key');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

const getBase64EncodedKubeconfig = async (
  clusterName: string = 'dummy',
  kubeconfigPath?: string
): Promise<string> => {
  // Use kubectl command-line tool to get the kubeconfig
  const { stdout } = await execFileAsync('kubectl', [
    ...(kubeconfigPath ? ['--kubeconfig', kubeconfigPath] : []),
    'config',
    'view',
    '--raw',
    '--flatten',
    '--output',
    'json',
  ]);

  // Parse the kubeconfig JSON
  const kubeconfig = JSON.parse(stdout);
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

const saveKubeconfigToIndexDB = async (page, base64EncodedKubeconfig) => {
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

const getKubeconfigFromIndexDB = async page => {
  const storedKubeconfig = await page.evaluate(() => {
    return new Promise((resolve, reject) => {
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

const clearKubeconfigsFromIndexDB = async page => {
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
