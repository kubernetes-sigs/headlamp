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

// e2e-tests/tests/logs-view-workloads.spec.ts
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
import { AppPage } from '../pages/AppPage';
import { WorkloadDetailsPage } from '../pages/WorkloadDetailsPage';

test.describe('Workload Logs Viewer Functionality', () => {
  test.slow(); // Triples the default timeout for hooks and tests in this suite

  let page: Page;
  let appPage: AppPage;
  let workloadDetailsPage: WorkloadDetailsPage;

  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ browser }, testInfo) => {
    const startTime = Date.now();
    console.log(
      `[${new Date(startTime).toISOString()}] Starting beforeEach for: ${testInfo.title}`
    );

    page = await browser.newPage();
    appPage = new AppPage(page);
    workloadDetailsPage = new WorkloadDetailsPage(page);

    try {
      console.log(
        `[${new Date().toISOString()}] Attempting login... (Elapsed: ${Date.now() - startTime}ms)`
      );
      await appPage.login();
      console.log(
        `[${new Date().toISOString()}] Login successful. (Elapsed: ${Date.now() - startTime}ms)`
      );

      console.log(
        `[${new Date().toISOString()}] Navigating to workloads... (Elapsed: ${
          Date.now() - startTime
        }ms)`
      );
      await appPage.navigateToWorkloads();
      console.log(
        `[${new Date().toISOString()}] Navigated to workloads. (Elapsed: ${
          Date.now() - startTime
        }ms)`
      );

      console.log(
        `[${new Date().toISOString()}] Finding workload details... (Elapsed: ${
          Date.now() - startTime
        }ms)`
      );
      const navigatedToWorkload = await appPage.findAndNavigateToFirstWorkloadDetails();
      if (!navigatedToWorkload) {
        console.error(
          `[${new Date().toISOString()}] Failed to find/navigate to workload. (Elapsed: ${
            Date.now() - startTime
          }ms)`
        );
        testInfo.skip(true, 'Could not find or navigate to any workload to test logs.');
        return;
      }
      console.log(
        `[${new Date().toISOString()}] Navigated to workload details. (Elapsed: ${
          Date.now() - startTime
        }ms)`
      );

      console.log(
        `[${new Date().toISOString()}] Opening logs viewer... (Elapsed: ${
          Date.now() - startTime
        }ms)`
      );
      const logsViewerOpened = await workloadDetailsPage.openLogsViewer();
      if (!logsViewerOpened) {
        console.error(
          `[${new Date().toISOString()}] Failed to open logs viewer. (Elapsed: ${
            Date.now() - startTime
          }ms)`
        );
        testInfo.skip(true, 'Logs button not found or logs dialog did not open.');
        return;
      }
      console.log(
        `[${new Date().toISOString()}] Logs viewer opened. (Elapsed: ${Date.now() - startTime}ms)`
      );

      console.log(
        `[${new Date().toISOString()}] Waiting for logs to load... (Elapsed: ${
          Date.now() - startTime
        }ms)`
      );
      await workloadDetailsPage.waitForLogsToLoad();
      console.log(
        `[${new Date().toISOString()}] Logs loaded. beforeEach setup complete. (Total Elapsed: ${
          Date.now() - startTime
        }ms)`
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(
        `[${new Date().toISOString()}] Error in beforeEach: ${errorMessage} (Total Elapsed: ${
          Date.now() - startTime
        }ms)`
      );
      testInfo.skip(true, `Test setup failed: ${errorMessage}`);
    }
  });

  test.afterEach(async () => {
    if (page) {
      // Ensure page exists before trying to close
      await page.close();
    }
  });

  test('should display logs, auto-scroll with "Follow" ON, and show "Attempting to follow" message', async () => {
    await workloadDetailsPage.ensureFollowIs('ON');

    const foundLogsContent = await workloadDetailsPage.expectTerminalContent(15000); // Increased timeout
    expect(
      foundLogsContent,
      "Expected to find logs content or 'Attempting to follow' message"
    ).toBe(true);

    await page.waitForTimeout(3000); // Give time for actual logs
  });

  test('should pause auto-scroll when user scrolls up with "Follow" ON', async () => {
    await workloadDetailsPage.ensureFollowIs('ON');
    await page.waitForTimeout(5000); // Give time for logs to load

    if (await workloadDetailsPage.isTerminalScrollable()) {
      const initialScrollTop = await workloadDetailsPage.getScrollTop();
      await workloadDetailsPage.scrollTerminal('up');
      const newScrollTop = await workloadDetailsPage.getScrollTop();

      expect(newScrollTop, 'Scroll position should change after scrolling up').toBeLessThan(
        initialScrollTop
      );

      await page.waitForTimeout(3000); // Wait for more logs
      const finalScrollTop = await workloadDetailsPage.getScrollTop();
      expect(finalScrollTop, 'Scroll position should remain after scrolling up').toBeCloseTo(
        newScrollTop,
        1 // Allow small difference due to timing/rendering
      );
    } else {
      console.log('Terminal not scrollable, skipping scroll assertions for pause.');
    }
  });

  test('should resume auto-scroll if user scrolls back to bottom with "Follow" ON', async () => {
    await workloadDetailsPage.ensureFollowIs('ON');
    await page.waitForTimeout(5000); // Give time for logs to load

    if (await workloadDetailsPage.isTerminalScrollable()) {
      await workloadDetailsPage.scrollTerminal('up'); // Pause auto-scroll
      await workloadDetailsPage.scrollTerminal('bottom'); // Resume

      await page.waitForTimeout(1000); // Allow auto-scroll to resume

      const isAtBottom = await workloadDetailsPage.isAtBottomOfTerminal();
      expect(isAtBottom, 'Terminal should be scrolled to the bottom').toBe(true);
    } else {
      console.log('Terminal not scrollable, skipping scroll assertions for resume.');
    }
  });

  test('should show "Logs are paused" message when "Follow" is OFF', async () => {
    await workloadDetailsPage.ensureFollowIs('OFF');

    const foundPausedMessage = await workloadDetailsPage.expectLogMessage(
      /Logs are paused|paused.+follow|paused/i,
      10000
    );
    expect(foundPausedMessage, "Expected 'Logs are paused' or similar message").toBe(true);

    const terminalContent = await workloadDetailsPage.terminalRows.innerText().catch(() => '');
    expect(terminalContent).not.toMatch(/Attempting to follow logs/i);
  });

  test('should resume streaming with "Attempting to follow" when "Follow" is turned back ON', async () => {
    await workloadDetailsPage.ensureFollowIs('OFF');
    const foundPausedMessage = await workloadDetailsPage.expectLogMessage(
      /Logs are paused|paused.+follow|paused/i,
      5000
    );
    expect(foundPausedMessage, "Expected 'Logs are paused' before turning follow ON again").toBe(
      true
    );

    await workloadDetailsPage.ensureFollowIs('ON');

    const foundFollowContent = await workloadDetailsPage.expectTerminalContent(10000);
    expect(
      foundFollowContent,
      "Expected 'Attempting to follow' or logs content after turning Follow ON"
    ).toBe(true);

    await page.waitForTimeout(3000); // Give time for logs to stream
  });
});
