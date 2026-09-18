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

const selector = 'team=headlamp';

function namespaceList(names: string[]) {
  return {
    apiVersion: 'v1',
    kind: 'NamespaceList',
    metadata: { resourceVersion: '1' },
    items: names.map(name => ({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name, resourceVersion: '1' },
      status: { phase: 'Active' },
    })),
  };
}

async function mockHeadlamp(
  page: Page,
  clusters: string[],
  resolveSelector: (cluster: string) => Promise<string[]>
) {
  await page.route('**/config', route =>
    route.fulfill({
      json: {
        clusters: clusters.map(name => ({ name, auth_type: '', useToken: false })),
      },
    })
  );
  await page.route('**/plugins', route => route.fulfill({ json: [] }));
  await page.route('**/clusters/**', async route => {
    const url = new URL(route.request().url());
    const [cluster, ...clusterPathParts] = url.pathname.split('/clusters/')[1].split('/');
    const clusterPath = `/${clusterPathParts.join('/')}`;

    if (clusterPath === '/api') {
      await route.fulfill({
        json: {
          items: [
            {
              metadata: {},
              versions: [
                {
                  version: 'v1',
                  resources: [
                    {
                      resource: 'namespaces',
                      verbs: ['list'],
                      responseKind: { kind: 'Namespace' },
                      scope: 'Cluster',
                    },
                    {
                      resource: 'pods',
                      verbs: ['list'],
                      responseKind: { kind: 'Pod' },
                      scope: 'Namespaced',
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
      return;
    }

    if (clusterPath === '/apis') {
      await route.fulfill({ json: { items: [] } });
      return;
    }

    if (
      clusterPath === '/api/v1/namespaces' &&
      url.searchParams.get('labelSelector') === selector
    ) {
      await route.fulfill({ json: namespaceList(await resolveSelector(cluster)) });
      return;
    }

    const projectSelector = url.searchParams.get('labelSelector');
    if (
      clusterPath === '/api/v1/namespaces' &&
      projectSelector?.startsWith('headlamp.dev/project-id=')
    ) {
      const project = projectSelector.slice('headlamp.dev/project-id='.length);
      await route.fulfill({
        json: {
          ...namespaceList([`${project}-namespace`]),
          items: [
            {
              apiVersion: 'v1',
              kind: 'Namespace',
              metadata: {
                name: `${project}-namespace`,
                labels: { 'headlamp.dev/project-id': project },
                resourceVersion: '1',
              },
            },
          ],
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        apiVersion: 'v1',
        kind: 'List',
        metadata: { resourceVersion: '1' },
        items: [],
      },
    });
  });
}

test('an empty namespace selector suppresses namespaced requests', async ({ page }) => {
  const podRequests: string[] = [];

  await page.addInitScript(selector => {
    localStorage.setItem(
      'cluster_settings.test',
      JSON.stringify({ allowedNamespacesSelector: selector })
    );
    localStorage.setItem(
      'cluster_allowed_namespaces_selector_cache.test',
      JSON.stringify({ selector, namespaces: [], resolvedAt: Date.now() })
    );
  }, selector);
  await mockHeadlamp(page, ['test'], async () => []);
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/api\/v1\/(?:namespaces\/[^/]+\/)?pods$/.test(url.pathname)) {
      podRequests.push(`${url.pathname}${url.search}`);
    }
  });

  await page.goto('/c/test/pods?namespace=default');
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('cluster_allowed_namespaces_selector_cache.test'))
    )
    .not.toBeNull();

  await expect(page).toHaveTitle(/Pods/);
  await expect(page.getByText('No data to be shown.').first()).toBeVisible();
  expect(podRequests).toEqual([]);
});

test('an empty namespace selector suppresses the unrestricted Namespaces query', async ({
  page,
}) => {
  const unrestrictedNamespaceRequests: string[] = [];

  await page.addInitScript(selector => {
    localStorage.setItem(
      'cluster_settings.test',
      JSON.stringify({ allowedNamespacesSelector: selector })
    );
    localStorage.setItem(
      'cluster_allowed_namespaces_selector_cache.test',
      JSON.stringify({ selector, namespaces: [], resolvedAt: Date.now() })
    );
  }, selector);
  await mockHeadlamp(page, ['test'], async () => []);
  page.on('request', request => {
    const url = new URL(request.url());
    if (
      url.pathname.endsWith('/clusters/test/api/v1/namespaces') &&
      !url.searchParams.has('labelSelector')
    ) {
      unrestrictedNamespaceRequests.push(`${url.pathname}${url.search}`);
    }
  });

  await page.goto('/c/test/namespaces');
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('cluster_allowed_namespaces_selector_cache.test'))
    )
    .not.toBeNull();

  await expect(page).toHaveTitle(/Namespaces/);
  await expect(page.getByText('No data to be shown.').first()).toBeVisible();
  expect(unrestrictedNamespaceRequests).toEqual([]);
});

test('a disjoint cluster allow-list does not become a cluster-wide request', async ({ page }) => {
  const podRequests: string[] = [];

  await page.addInitScript(selector => {
    for (const [cluster, namespaces] of [
      ['test', ['team-a']],
      ['test2', ['team-b']],
    ] as const) {
      localStorage.setItem(
        `cluster_settings.${cluster}`,
        JSON.stringify({ allowedNamespacesSelector: selector })
      );
      localStorage.setItem(
        `cluster_allowed_namespaces_selector_cache.${cluster}`,
        JSON.stringify({ selector, namespaces, resolvedAt: Date.now() })
      );
    }
  }, selector);
  await mockHeadlamp(page, ['test', 'test2'], async cluster =>
    cluster === 'test' ? ['team-a'] : ['team-b']
  );
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/api\/v1\/(?:namespaces\/[^/]+\/)?pods$/.test(url.pathname)) {
      podRequests.push(`${url.pathname}${url.search}`);
    }
  });

  await page.goto('/c/test+test2/pods?namespace=team-a');

  await expect(page).toHaveTitle(/Pods/);
  await expect
    .poll(() =>
      podRequests.some(request => request.includes('/clusters/test/api/v1/namespaces/team-a/pods'))
    )
    .toBe(true);
  expect(podRequests.some(request => /\/api\/v1\/pods(?:\?|$)/.test(request))).toBe(false);
});

test('all selected cluster selectors start resolving before routes render', async ({ page }) => {
  const selectorRequests = new Set<string>();
  let releaseFirstSelector!: () => void;
  const firstSelectorReleased = new Promise<void>(resolve => {
    releaseFirstSelector = resolve;
  });

  await page.addInitScript(selector => {
    for (const cluster of ['test', 'test2']) {
      localStorage.setItem(
        `cluster_settings.${cluster}`,
        JSON.stringify({ allowedNamespacesSelector: selector })
      );
    }
  }, selector);
  await mockHeadlamp(page, ['test', 'test2'], async cluster => {
    selectorRequests.add(cluster);
    if (cluster === 'test') {
      await firstSelectorReleased;
    }
    return [];
  });

  try {
    await page.goto('/c/test+test2/pods', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => [...selectorRequests].sort()).toEqual(['test', 'test2']);
    await expect(page).toHaveTitle('Headlamp');
  } finally {
    releaseFirstSelector();
  }

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          ['test', 'test2'].every(cluster =>
            localStorage.getItem(`cluster_allowed_namespaces_selector_cache.${cluster}`)
          )
        ),
      { timeout: 10_000 }
    )
    .toBe(true);
  await expect(page).toHaveTitle(/Pods/);
});

test('a global project route resolves configured cluster selectors', async ({ page }) => {
  const selectorRequests = new Set<string>();

  await page.addInitScript(selector => {
    for (const cluster of ['test', 'test2']) {
      localStorage.setItem(
        `cluster_settings.${cluster}`,
        JSON.stringify({ allowedNamespacesSelector: selector })
      );
    }
  }, selector);
  await mockHeadlamp(page, ['test', 'test2'], async cluster => {
    selectorRequests.add(cluster);
    return ['project-namespace'];
  });

  await page.goto('/project/example');

  await expect
    .poll(() => [...selectorRequests].sort(), { timeout: 10_000 })
    .toEqual(['test', 'test2']);
  await expect(page).toHaveTitle(/Project Details/);
});

test('the home Projects view resolves configured cluster selectors', async ({ page }) => {
  const selectorRequests = new Set<string>();

  await page.addInitScript(selector => {
    for (const cluster of ['test', 'test2']) {
      localStorage.setItem(
        `cluster_settings.${cluster}`,
        JSON.stringify({ allowedNamespacesSelector: selector })
      );
    }
  }, selector);
  await mockHeadlamp(page, ['test', 'test2'], async cluster => {
    selectorRequests.add(cluster);
    return ['project-namespace'];
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Projects' }).click();

  await expect
    .poll(() => [...selectorRequests].sort(), { timeout: 10_000 })
    .toEqual(['test', 'test2']);
});

test('a cluster route does not resolve unselected cluster selectors', async ({ page }) => {
  const selectorRequests = new Set<string>();

  await page.addInitScript(selector => {
    for (const cluster of ['test', 'test2']) {
      localStorage.setItem(
        `cluster_settings.${cluster}`,
        JSON.stringify({ allowedNamespacesSelector: selector })
      );
    }
  }, selector);
  await mockHeadlamp(page, ['test', 'test2'], async cluster => {
    selectorRequests.add(cluster);
    return [];
  });

  await page.goto('/c/test/pods');

  await expect(page).toHaveTitle(/Pods/);
  expect([...selectorRequests]).toEqual(['test']);
});

test('a selector refresh preserves routed page state', async ({ page }) => {
  const podRequests: string[] = [];
  let releaseSelector!: () => void;
  const selectorReleased = new Promise<void>(resolve => {
    releaseSelector = resolve;
  });

  await page.addInitScript(selector => {
    localStorage.setItem(
      'cluster_settings.test',
      JSON.stringify({ allowedNamespacesSelector: selector })
    );
    localStorage.setItem(
      'cluster_allowed_namespaces_selector_cache.test',
      JSON.stringify({
        selector,
        namespaces: ['stale'],
        resolvedAt: Date.now(),
      })
    );
  }, selector);
  await mockHeadlamp(page, ['test'], async () => {
    await selectorReleased;
    return ['fresh'];
  });
  await page.route('**/clusters/test/api/v1/namespaces/*/pods**', route => {
    const namespace = new URL(route.request().url()).pathname
      .split('/namespaces/')[1]
      .split('/')[0];
    return route.fulfill({
      json: {
        apiVersion: 'v1',
        kind: 'PodList',
        metadata: { resourceVersion: '1' },
        items: [
          {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: `keep-state-visible-${namespace}`,
              namespace,
              resourceVersion: '1',
              creationTimestamp: '2026-01-01T00:00:00Z',
            },
            spec: { containers: [{ name: 'main', image: 'busybox' }] },
            status: { phase: 'Running' },
          },
        ],
      },
    });
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/api\/v1\/namespaces\/[^/]+\/pods$/.test(url.pathname)) {
      podRequests.push(`${url.pathname}${url.search}`);
    }
  });

  try {
    await page.goto('/c/test/pods', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Pods/);
    await page.getByRole('button', { name: 'Show/Hide search' }).click();
    const search = page.locator('#table-search-field');
    await search.fill('keep this filter');

    releaseSelector();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const cache = localStorage.getItem('cluster_allowed_namespaces_selector_cache.test');
          return cache ? JSON.parse(cache).namespaces : null;
        })
      )
      .toEqual(['fresh']);
    await expect
      .poll(() =>
        podRequests.some(request => request.includes('/clusters/test/api/v1/namespaces/fresh/pods'))
      )
      .toBe(true);
    await expect(search).toHaveValue('keep this filter');
  } finally {
    releaseSelector();
  }
});
