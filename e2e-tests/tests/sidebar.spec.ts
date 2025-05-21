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

let headlampPage: HeadlampPage;

test.beforeEach(async ({ page }) => {
  headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
});

test.describe('Sidebar Toggle Button Accessibility', () => {
  test('should be accessible and properly positioned', async ({ page }) => {
    // Get the sidebar toggle button
    const toggleButton = await page.locator('button[aria-label="Collapse Sidebar"]');
    await expect(toggleButton).toBeVisible();
    
    // Get the button's position
    const box = await toggleButton.boundingBox();
    expect(box).toBeTruthy();
    
    if (box) {
      // Get the viewport size
      const viewport = page.viewportSize();
      expect(viewport).toBeTruthy();
      
      if (viewport) {
        // Check that the button is at least 40px from the bottom of the viewport
        // This ensures it won't be hidden by auto-hiding taskbar
        expect(viewport.height - (box.y + box.height)).toBeGreaterThanOrEqual(40);
      }
    }

    // Check accessibility
    await headlampPage.a11y();
  });

  test('should maintain functionality in both states', async ({ page }) => {
    const toggleButton = await page.locator('button[aria-label="Collapse Sidebar"]');
    const sidebar = await page.locator('nav[aria-label="Navigation"]');
    
    // Test initial expanded state
    const initialSidebarBox = await sidebar.boundingBox();
    expect(initialSidebarBox?.width).toBeGreaterThan(200);
    await headlampPage.a11y();
    
    // Test collapsing
    await toggleButton.click();
    await page.waitForTimeout(500); // Wait for animation
    const collapsedSidebarBox = await sidebar.boundingBox();
    expect(collapsedSidebarBox?.width).toBeLessThan(100);
    await headlampPage.a11y();
    
    // Test expanding
    await toggleButton.click();
    await page.waitForTimeout(500); // Wait for animation
    const expandedSidebarBox = await sidebar.boundingBox();
    expect(expandedSidebarBox?.width).toBeGreaterThan(200);
    await headlampPage.a11y();

    // Verify navigation still works in both states
    await headlampPage.hasNetworkTab();
    await headlampPage.hasSecurityTab();
  });

  test('should be responsive across viewport sizes', async ({ page }) => {
    const toggleButton = await page.locator('button[aria-label="Collapse Sidebar"]');
    
    // Test at different viewport sizes
    const viewportSizes = [
      { width: 1920, height: 1080 }, // Desktop
      { width: 1366, height: 768 },  // Laptop
      { width: 1024, height: 768 },  // Tablet Landscape
      { width: 768, height: 1024 },  // Tablet Portrait
      { width: 375, height: 812 }    // Mobile
    ];

    for (const size of viewportSizes) {
      await page.setViewportSize(size);
      await page.waitForTimeout(500); // Wait for resize
      
      // Verify button is visible
      await expect(toggleButton).toBeVisible();
      
      // Verify button position
      const box = await toggleButton.boundingBox();
      expect(box).toBeTruthy();
      if (box && size.height) {
        expect(size.height - (box.y + box.height)).toBeGreaterThanOrEqual(40);
      }
      
      // Test accessibility at each viewport size
      await headlampPage.a11y();
      
      // Verify functionality
      await toggleButton.click();
      await page.waitForTimeout(500);
      await toggleButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('should work with other UI elements', async ({ page }) => {
    // Get both the toggle button and version button
    const toggleButton = await page.locator('button[aria-label="Collapse Sidebar"]');
    const versionButton = await page.locator('button:has-text("Version")');
    
    // Verify both buttons are visible and accessible
    await expect(toggleButton).toBeVisible();
    await expect(versionButton).toBeVisible();
    
    // Verify proper spacing between buttons
    const toggleBox = await toggleButton.boundingBox();
    const versionBox = await versionButton.boundingBox();
    
    if (toggleBox && versionBox) {
      // Ensure there's no overlap
      expect(Math.abs(toggleBox.y - versionBox.y)).toBeGreaterThan(0);
    }

    // Test interaction with navigation
    await toggleButton.click(); // Collapse
    await headlampPage.hasNetworkTab();
    await headlampPage.hasSecurityTab();
    await toggleButton.click(); // Expand
    await headlampPage.hasNetworkTab();
    await headlampPage.hasSecurityTab();
    
    // Check accessibility
    await headlampPage.a11y();
  });

  test('should handle window resize events', async ({ page }) => {
    const toggleButton = await page.locator('button[aria-label="Collapse Sidebar"]');
    
    // Start with a large viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    
    // Verify initial state
    await expect(toggleButton).toBeVisible();
    await headlampPage.a11y();
    
    // Resize to smaller viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    
    // Verify button remains accessible
    await expect(toggleButton).toBeVisible();
    const box = await toggleButton.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      const viewport = page.viewportSize();
      expect(viewport).toBeTruthy();
      if (viewport) {
        expect(viewport.height - (box.y + box.height)).toBeGreaterThanOrEqual(40);
      }
    }
    
    // Test functionality after resize
    await toggleButton.click();
    await page.waitForTimeout(500);
    await toggleButton.click();
    await page.waitForTimeout(500);
    
    // Check accessibility after resize
    await headlampPage.a11y();
  });
});