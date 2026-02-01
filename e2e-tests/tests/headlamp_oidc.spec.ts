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
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

class MockOIDCProvider {
  server: Server;
  url!: string;
  authRequests: string[] = [];

  constructor() {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url?.startsWith('/.well-known/openid-configuration')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            issuer: this.url,
            authorization_endpoint: `${this.url}/auth`,
            token_endpoint: `${this.url}/token`,
            jwks_uri: `${this.url}/jwks`,
          })
        );
      } else if (req.url?.startsWith('/jwks')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [] }));
      } else if (req.url?.startsWith('/auth')) {
        this.authRequests.push(req.url);
        // Extract redirect_uri and state
        const urlParams = new URL(req.url, this.url).searchParams;
        const redirectUri = urlParams.get('redirect_uri');
        const state = urlParams.get('state');

        if (redirectUri && state) {
          // Redirect back to callback
          res.writeHead(302, { Location: `${redirectUri}?code=mock_code&state=${state}` });
          res.end();
        } else {
          res.writeHead(400);
          res.end('Missing redirect_uri or state');
        }
      } else if (req.url?.startsWith('/token')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: 'mock_access_token',
            token_type: 'Bearer',
            id_token: 'mock_id_token',
          })
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  }

  async start(): Promise<void> {
    return new Promise(resolve => {
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server.address() as AddressInfo;
        this.url = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise(resolve => {
      this.server.close(() => resolve());
    });
  }
}

test.describe('OIDC Integration', () => {
  let oidcServer: MockOIDCProvider;

  test.beforeAll(async () => {
    oidcServer = new MockOIDCProvider();
    await oidcServer.start();
  });

  test.afterAll(async () => {
    await oidcServer.stop();
  });

  test('should redirect to OIDC provider and handle callback', async ({ page, request }) => {
    const contextName = 'oidc-e2e-cluster';
    const clusterName = 'oidc-e2e-cluster';
    const userName = 'oidc-e2e-user';

    const kubeconfigYaml = `
apiVersion: v1
clusters:
- cluster:
    server: https://test-cluster.com
    insecure-skip-tls-verify: true
  name: ${clusterName}
contexts:
- context:
    cluster: ${clusterName}
    user: ${userName}
  name: ${contextName}
current-context: ${contextName}
users:
- name: ${userName}
  user:
    auth-provider:
      config:
        client-id: test-client
        client-secret: test-secret
        idp-issuer-url: ${oidcServer.url}
      name: oidc
`;

    const kubeConfigBase64 = Buffer.from(kubeconfigYaml).toString('base64');

    const newCluster = await request.post('/cluster', {
      headers: {
        'X-HEADLAMP_BACKEND-TOKEN': 'headlamp',
      },
      data: {
        name: contextName,
        server: 'https://test-cluster.com',
        kubeconfig: kubeConfigBase64,
        meta_data: { source: 'dynamic_cluster' },
      },
    });

    console.log(`Cluster creation status: ${newCluster.status()}`);
    if (!newCluster.ok()) {
      console.log(`Cluster creation failed: ${await newCluster.text()}`);
    }
    expect(newCluster.status()).toBe(201);

    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page.getByText(contextName)).toBeVisible();

    await page.getByText(contextName).click();

    await page.waitForTimeout(2000);

    expect(oidcServer.authRequests.length).toBeGreaterThan(0);
    const authReq = oidcServer.authRequests[oidcServer.authRequests.length - 1];
    expect(authReq).toContain('response_type=code');
    expect(authReq).toContain('client_id=test-client');
  });
});
