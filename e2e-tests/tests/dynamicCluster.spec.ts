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

  // Authenticate only if the auth page is shown (e.g. minikube with token auth).
  // When using cert-based auth (e.g. KWOK), no auth page appears.
  const hasAuthPage = await page.locator('h1:has-text("Authentication")').isVisible();
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

  // Step 1: Store kubeconfig in IndexedDB (simulates the user adding a cluster)
  await saveKubeconfigToIndexDB(page, base64EncodedKubeconfig);

  // Step 2: Read it back from IndexedDB (simulates fetchStatelessClusterKubeConfigs reading it)
  const storedKubeconfig = await getKubeconfigFromIndexDB(page);
  expect(storedKubeconfig).not.toBeNull();

  // Step 3: Call /parseKubeConfig with the stored kubeconfig — exactly as
  // fetchStatelessClusterKubeConfigs does — and verify it returns 200.
  // This catches the bug where the wrong field name (kubeconfig vs kubeconfigs)
  // would cause a 400 "kubeconfigs is required" error.
  const response = await page.evaluate(async (kubeconfig: string) => {
    const resp = await fetch('/parseKubeConfig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kubeconfigs: [kubeconfig] }),
    });
    return { status: resp.status };
  }, storedKubeconfig as string);

  expect(response.status).toBe(200);
});

const getBase64EncodedKubeconfig = async () => {
  // Use kubectl command-line tool to get the kubeconfig
  const { stdout, stderr } = await exec('kubectl config view --output json');
  if (stderr) {
    console.error('Error fetching Minikube kubeconfig:', stderr);
    return;
  }

  // Parse the kubeconfig JSON
  const kubeconfig = JSON.parse(stdout);
  // Update the existing cluster and context names to "dummy"
  kubeconfig.clusters[0].name = 'dummy';
  // The 10.96.0.0/12: is the CIDR used by service cluster IP’s
  // and the first service that is created is that of minikube when it bootstraps the cluster.
  // It will always get 10.96.0.1 IP assigned. For more context please check https://minikube.sigs.k8s.io/docs/handbook/vpn_and_proxy/.
  kubeconfig.clusters[0].cluster.server = 'https://10.96.0.1:443';
  kubeconfig.contexts[0].name = 'dummy';
  kubeconfig.users[0].name = 'dummy';
  kubeconfig.contexts[0].context.user = 'dummy';
  kubeconfig.contexts[0].context.cluster = 'dummy';

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

  // Set the current context to "minikubedummy"
  kubeconfig['current-context'] = 'dummy';

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

        addRequest.onsuccess = () => {
          console.log('Kubeconfig added to IndexDB');
          db.close();
          resolve();
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
