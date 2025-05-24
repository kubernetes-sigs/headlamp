/**
 * Integration test for plugin reloading on non-cluster pages
 * 
 * This test simulates the full plugin reloading flow, including:
 * 1. Loading plugins initially
 * 2. Navigating to a non-cluster page (settings)
 * 3. Modifying a plugin
 * 4. Verifying the plugin is reloaded
 * 
 * To run this test:
 * 1. Start Headlamp in development mode
 * 2. Run this script with Node.js
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const puppeteer = require('puppeteer');

// Configuration
const HEADLAMP_URL = 'http://localhost:3000';
const PLUGIN_PATH = path.join(__dirname, '..', '..', '..', 'plugins', 'examples', 'podcounter');
const PLUGIN_FILE = path.join(PLUGIN_PATH, 'src', 'index.tsx');

// Test function
async function testPluginReloading() {
  console.log('Starting plugin reloading integration test...');
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null
  });
  
  try {
    // Open Headlamp
    const page = await browser.newPage();
    await page.goto(HEADLAMP_URL, { waitUntil: 'networkidle2' });
    console.log('Opened Headlamp');
    
    // Wait for plugins to load
    await page.waitForFunction(() => {
      return window.plugins && Object.keys(window.plugins).length > 0;
    }, { timeout: 10000 });
    console.log('Initial plugins loaded');
    
    // Navigate to settings page
    await page.click('a[href="/settings"]');
    await page.waitForSelector('[data-testid="settings-page"]', { timeout: 5000 });
    console.log('Navigated to settings page');
    
    // Get initial plugin state
    const initialPlugins = await page.evaluate(() => {
      return Object.keys(window.plugins);
    });
    console.log('Initial plugins:', initialPlugins);
    
    // Backup original plugin file
    const originalContent = fs.readFileSync(PLUGIN_FILE, 'utf8');
    
    try {
      // Modify plugin file
      const modifiedContent = originalContent.replace(
        'const PodCounter = {',
        'console.log("PLUGIN_RELOADED_MARKER");\nconst PodCounter = {'
      );
      fs.writeFileSync(PLUGIN_FILE, modifiedContent);
      console.log('Modified plugin file');
      
      // Build the plugin
      await new Promise((resolve, reject) => {
        exec('npm run build', { cwd: PLUGIN_PATH }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      console.log('Rebuilt plugin');
      
      // Wait for plugin to reload
      await page.waitForFunction(() => {
        return window.pluginReloadedMarker === true;
      }, { timeout: 10000 });
      console.log('Plugin reloaded successfully!');
      
      // Verify plugin functionality still works
      await page.goto(`${HEADLAMP_URL}/pods`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.pod-counter', { timeout: 5000 });
      console.log('Plugin functionality verified');
      
      console.log('TEST PASSED: Plugin reloading works on non-cluster pages!');
    } finally {
      // Restore original plugin file
      fs.writeFileSync(PLUGIN_FILE, originalContent);
      console.log('Restored original plugin file');
      
      // Rebuild the plugin
      await new Promise((resolve) => {
        exec('npm run build', { cwd: PLUGIN_PATH }, () => resolve());
      });
      console.log('Rebuilt plugin with original content');
    }
  } catch (error) {
    console.error('TEST FAILED:', error);
    process.exit(1);
  } finally {
    // Close browser
    await browser.close();
  }
}

// Run the test
testPluginReloading().catch(console.error);