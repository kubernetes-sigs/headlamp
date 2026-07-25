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

import { AxeBuilder } from '@axe-core/playwright';
import { expect, Locator, Page, test } from '@playwright/test';
import { HeadlampPage } from './headlampPage';

type ThemeName = 'light' | 'dark';
type XtermRoute = 'logs' | 'exec' | 'nodeShell';

const themes: ThemeName[] = ['light', 'dark'];
const routes: XtermRoute[] = ['logs', 'exec', 'nodeShell'];

/**
 * Parse a CSS color string like `rgb(245, 245, 245)` or `rgba(51, 51, 51, 1)`
 * and return its perceptual luminance in the range [0, 1] (Rec. 709 luma).
 *
 * Used to assert "looks light/dark" without pinning a specific palette value,
 * so the test stays valid if the MUI theme tokens are tweaked.
 */
function luminanceOf(cssColor: string): number {
  const match = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) {
    throw new Error(`Could not parse color: ${cssColor}`);
  }
  const [r, g, b] = [match[1], match[2], match[3]].map(v => Number(v) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Seed the theme preference in localStorage before any app code runs, so that
 * the Redux theme slice picks it up at init.
 */
async function seedTheme(page: Page, themeName: ThemeName) {
  await page.addInitScript(name => {
    try {
      window.localStorage.setItem('headlampThemePreference', name);
    } catch {
      // Some test contexts may not have localStorage available; the test
      // assertion below will surface the issue as a luminance mismatch.
    }
  }, themeName);
}

/**
 * Navigate to the first pod's details page. Skips the test gracefully if the
 * cluster has no pods permission (matches the RBAC-tolerant pattern used by
 * other specs in this directory).
 */
async function openFirstPodDetails(page: Page): Promise<{ podName: string }> {
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  const content = await page.content();
  if (!content.includes('Pods') || !content.includes('href="/c/test/pods')) {
    test.skip(true, 'No pods permission on this cluster.');
  }

  await headlampPage.navigateTopage('/c/test/pods', /Pods/);

  const podsTable = page.getByRole('table');
  await expect(podsTable).toBeVisible();

  // Skip when the cluster is reachable but has no pods to open — otherwise we
  // would fall through to a non-existent `tbody > tr:nth(0)` row and fail.
  const podRowCount = await podsTable.locator('tbody > tr').count();
  if (podRowCount === 0) {
    test.skip(true, 'No pods on this cluster to open.');
  }

  const podLink = podsTable
    .locator('tbody')
    .nth(0)
    .locator('tr')
    .nth(0)
    .locator('td')
    .nth(1)
    .locator('a');
  const podName = (await podLink.textContent()) ?? '';
  await podLink.click();

  await expect(
    page.getByRole('heading', { level: 1, name: new RegExp(`^Pod: ${podName}$`) })
  ).toBeVisible();

  return { podName };
}

/**
 * Open the LogViewer for the first pod and return the `.xterm-viewport`
 * locator (the element whose background is the theme-derived color).
 */
async function openLogs(page: Page): Promise<Locator> {
  await openFirstPodDetails(page);

  const showLogsButton = page.getByRole('button', { name: /^Show Logs$/ });
  await showLogsButton.click();

  const terminal = page.locator('#xterm-container');
  await expect(terminal).toBeVisible();

  const viewport = terminal.locator('.xterm-viewport');
  await expect(viewport).toBeVisible();
  return viewport;
}

/**
 * Open the Terminal (exec) dialog for the first pod and return its
 * `.xterm-viewport` locator. Skips when the test cluster doesn't grant `exec`
 * (the action button is rendered behind `<AuthVisible authVerb="create"
 * subresource="exec">`).
 */
async function openExecTerminal(page: Page): Promise<Locator> {
  await openFirstPodDetails(page);

  const execButton = page.getByRole('button', { name: 'Terminal / Exec' });
  if (!(await execButton.isVisible().catch(() => false))) {
    test.skip(true, 'No exec permission on this cluster.');
  }
  await execButton.click();

  const terminal = page.locator('#xterm-container');
  await expect(terminal).toBeVisible();

  const viewport = terminal.locator('.xterm-viewport');
  await expect(viewport).toBeVisible();
  return viewport;
}

async function openXtermRoute(page: Page, route: XtermRoute): Promise<Locator> {
  if (route === 'logs') return openLogs(page);
  if (route === 'exec') return openExecTerminal(page);
  return openNodeShell(page);
}

/**
 * Open a node-shell terminal on the first node and return its
 * `.xterm-viewport` locator. The action button is gated by AuthVisible
 * (`create pod` + `get exec` on the node-shell namespace) and by the node's
 * OS being Linux, so we skip gracefully when the cluster doesn't satisfy
 * those preconditions.
 */
async function openNodeShell(page: Page): Promise<Locator> {
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  const content = await page.content();
  if (!content.includes('href="/c/test/nodes')) {
    test.skip(true, 'No nodes permission on this cluster.');
  }

  await headlampPage.navigateTopage('/c/test/nodes', /Nodes/);

  const nodesTable = page.getByRole('table');
  await expect(nodesTable).toBeVisible();

  const nodeRowCount = await nodesTable.locator('tbody > tr').count();
  if (nodeRowCount === 0) {
    test.skip(true, 'No nodes on this cluster to open.');
  }

  const nodeLink = nodesTable
    .locator('tbody')
    .nth(0)
    .locator('tr')
    .nth(0)
    .locator('td')
    .nth(1)
    .locator('a');
  await nodeLink.click();

  const debugButton = page.getByRole('button', { name: 'Debug Node' });
  if (!(await debugButton.isVisible().catch(() => false)) || (await debugButton.isDisabled())) {
    test.skip(true, 'Node shell unavailable (non-Linux node or missing RBAC).');
  }
  await debugButton.click();

  const terminal = page.locator('#xterm-container');
  await expect(terminal).toBeVisible();

  const viewport = terminal.locator('.xterm-viewport');
  await expect(viewport).toBeVisible();
  return viewport;
}

test.describe('xterm routes are theme-aware and a11y-clean', () => {
  for (const route of routes) {
    for (const theme of themes) {
      test(`${route} viewer in ${theme} theme: background matches theme + axe clean`, async ({
        page,
      }) => {
        await seedTheme(page, theme);

        const viewport = await openXtermRoute(page, route);

        const bg = await viewport.evaluate(
          el => getComputedStyle(el as HTMLElement).backgroundColor
        );
        const luminance = luminanceOf(bg);
        if (theme === 'light') {
          expect(luminance, `expected light background, got ${bg}`).toBeGreaterThan(0.7);
        } else {
          expect(luminance, `expected dark background, got ${bg}`).toBeLessThan(0.3);
        }

        // a11y: scan the whole open xterm activity (toolbar, container/shell
        // selectors, reconnect button, search popover for logs) — not just
        // the inner `#xterm-container` element, which would miss regressions
        // in the surrounding chrome that this PR also re-themes. xterm.js
        // renders its own canvas/decoration nodes, so we exclude those
        // (color-contrast on a `<canvas>` is not meaningful) along with the
        // surrounding sidebar/topbar that other specs already cover.
        const results = await new AxeBuilder({ page })
          .exclude('.xterm-screen')
          .exclude('.xterm-text-layer')
          .exclude('.xterm-helpers')
          .exclude('nav')
          .exclude('header')
          .analyze();
        expect(results.violations).toStrictEqual([]);
      });
    }
  }
});
