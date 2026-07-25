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
import { HeadlampPage } from './headlampPage';
const yaml = require('yaml');
const fs = require('fs').promises;
const util = require('util');
const exec = util.promisify(require('child_process').exec);

let headlampPage: HeadlampPage;

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

const getBase64EncodedKubeconfig = async (clusterName: string = 'dummy') => {
  // Use kubectl command-line tool to get the kubeconfig
  const { stdout, stderr } = await exec('kubectl config view --output json');
  if (stderr) {
    console.error('Error fetching Minikube kubeconfig:', stderr);
    return;
  }

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

  // Get the contents of certificate-authority file and convert to base64
  const caFilePath = kubeconfig.clusters[0].cluster['certificate-authority'];
  const caFileContent = await fs.readFile(caFilePath, 'utf-8');
  kubeconfig.clusters[0].cluster['certificate-authority-data'] =
    Buffer.from(caFileContent).toString('base64');

  // Get the contents of client-certificate file and convert to base64
  const clientCertFilePath = kubeconfig.users[0].user['client-certificate'];
  const clientCertFileContent = await fs.readFile(clientCertFilePath, 'utf-8');
  kubeconfig.users[0].user['client-certificate-data'] =
    Buffer.from(clientCertFileContent).toString('base64');

  // Get the contents of client-key file and convert to base64
  const clientKeyFilePath = kubeconfig.users[0].user['client-key'];
  const clientKeyFileContent = await fs.readFile(clientKeyFilePath, 'utf-8');
  kubeconfig.users[0].user['client-key-data'] =
    Buffer.from(clientKeyFileContent).toString('base64');

  // Remove client-key, client-certificate, and certificate-authority keys
  delete kubeconfig.users[0].user['client-key'];
  delete kubeconfig.users[0].user['client-certificate'];
  delete kubeconfig.clusters[0].cluster['certificate-authority'];

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
