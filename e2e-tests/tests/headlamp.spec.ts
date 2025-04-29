import { expect, test } from '@playwright/test';
import { HeadlampPage } from './headlampPage';
import { SecurityPage } from './securityPage';
import { ServicesPage } from './servicesPage';

let headlampPage: HeadlampPage;
let securityPage: SecurityPage;
let servicesPage: ServicesPage;

test.beforeEach(async ({ page }) => {
  headlampPage = new HeadlampPage(page);
  securityPage = new SecurityPage(page);
  servicesPage = new ServicesPage(page);

  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
});

// --- Plugins tests start --- //
test('GET /plugins/list returns plugins list', async ({ page }) => {
  const response: any = await page.goto('/plugins');
  expect(response).toBeTruthy();

  const json = await response.json();
  expect(json.length).toBeGreaterThan(0);
  expect(json.some(str => str.includes('plugins/'))).toBeTruthy();
});
// --- Plugin tests end --- //

// --- Headlamp tests start --- //
test('headlamp is there and so is minikube', async () => {
  await headlampPage.hasURLContaining(/.*test/);
});

test('main page should have Network tab', async () => {
  await headlampPage.hasNetworkTab();
});

test('main page should have global search along with react-hotkey hint text', async () => {
  const globalSearch = await headlampPage.hasGlobalSearch();

  const searchHintContainer = globalSearch.locator('xpath=following-sibling::div');
  const pressTextExists = await searchHintContainer.getByText(/^Press/).isVisible();
  const slashHotKeyExists = await searchHintContainer
    .locator('div')
    .filter({ hasText: /^\/$/ })
    .isVisible();
  const toSearchTextExists = await searchHintContainer.getByText(/to search$/).isVisible();

  expect(pressTextExists && slashHotKeyExists && toSearchTextExists).toBeTruthy();
});

test('react-hotkey for global search', async ({ page }) => {
  await page.keyboard.press('/');

  const focusedSearch = page.getByPlaceholder(/^Search resources, pages, clusters by name$/);
  await expect(focusedSearch).toBeVisible();
  await expect(focusedSearch).toBeFocused();
});

test('service page should have headlamp service', async () => {
  await servicesPage.navigateToServices();
  await servicesPage.clickOnServicesSection();

  // Check if there is text "headlamp" on the page
  await headlampPage.checkPageContent('headlamp');
});

test('headlamp service page should contain port', async () => {
  await servicesPage.navigateToServices();
  await servicesPage.clickOnServicesSection();
  await servicesPage.goToParticularService('headlamp');

  // Check if there is text "TCP" on the page
  await headlampPage.checkPageContent('TCP');
});

test('main page should have Security tab', async () => {
  await headlampPage.hasSecurityTab();
});

test('Service account tab should have headlamp-admin', async () => {
  await securityPage.navigateToSecurity();
  await securityPage.clickOnServiceAccountsSection();

  // Check if there is text "headlamp-admin" on the page
  await headlampPage.checkPageContent('headlamp-admin');
});

test('Logout the user', async () => {
  await headlampPage.logout();
});

test('404 page is present', async () => {
  await headlampPage.navigateTopage('/404test', /Whoops! This page doesn't exist/);
});

test('pagination goes to next page', async () => {
  await securityPage.navigateToSecurity();
  await securityPage.clickOnRolesSection();

  // Check if there is text "Rows per page" on the page
  await headlampPage.checkPageContent('Rows per page');

  // Check working of pagination
  await headlampPage.checkRows();
});

// --- Headlamp tests end --- //
