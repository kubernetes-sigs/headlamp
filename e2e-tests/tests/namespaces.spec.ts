import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { HeadlampPage } from './headlampPage';
import { NamespacesPage } from './namespacesPage';

test('create a namespace with the minimal editor then delete it', async ({ page }) => {
  const name = 'testing-e2e';
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  // If there's no namespaces permission, then we return
  const content = await page.content();
  if (!content.includes('Namespaces') || !content.includes('href="/c/test/namespaces')) {
    return;
  }

  const namespacesPage = new NamespacesPage(page);
  await namespacesPage.navigateToNamespaces();

  const axeBuilder = new AxeBuilder({ page });

  const accessibilityResults = await axeBuilder.analyze();

  expect(accessibilityResults.violations.length).toBe(0);

  await namespacesPage.createNamespace(name);
  const postCreationScanResults = await axeBuilder.analyze();

  expect(postCreationScanResults.violations.length).toBe(0);

  await namespacesPage.deleteNamespace(name);
});
