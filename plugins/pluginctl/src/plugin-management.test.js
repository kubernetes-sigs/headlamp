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

const pluginManagement = require('./plugin-management.js');
const tmp = require('tmp');
const fs = require('fs');
const path = require('path');

const PluginManager = pluginManagement.PluginManager;
const validateArchiveURL = pluginManagement.validateArchiveURL;


// Mocking progressCallback function for testing
// eslint-disable-next-line
const mockProgressCallback = jest.fn(args => {
  // console.log("Progress Callback:", args);  // Uncomment for debugging
});

const FLUX_URL = 'https://artifacthub.io/packages/headlamp/headlamp-plugins/headlamp_flux';

describe('PluginManager Test Cases', () => {
  let tempDir;

  beforeAll(async () => {
    // Create a temporary directory and install the plugin once for the entire suite.
    // Pass null so installation errors are thrown and fail test setup immediately.
    tempDir = tmp.dirSync({ unsafeCleanup: true }).name;
    await PluginManager.install(FLUX_URL, tempDir, '', null);
  }, 30000);

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Install Plugin', async () => {
    // Verify that installing to a fresh directory emits the success callback.
    const freshDir = tmp.dirSync({ unsafeCleanup: true }).name;
    try {
      await PluginManager.install(FLUX_URL, freshDir, '', mockProgressCallback);
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'success',
        message: 'Plugin Installed',
      });
    } finally {
      fs.rmSync(freshDir, { recursive: true, force: true });
    }
  }, 30000);

  describe('with installed plugin', () => {
    // Each test receives its own isolated copy of the pre-installed plugin so
    // tests are fully independent — no shared mutation, no order dependency.
    // The copy is cheap (local fs) so there are no extra network calls.
    let workDir;

    beforeEach(() => {
      workDir = tmp.dirSync({ unsafeCleanup: true }).name;
      for (const entry of fs.readdirSync(tempDir)) {
        fs.cpSync(path.join(tempDir, entry), path.join(workDir, entry), { recursive: true });
      }
    });

    afterEach(() => {
      fs.rmSync(workDir, { recursive: true, force: true });
    });

    test('List Plugins', () => {
      PluginManager.list(workDir, mockProgressCallback);
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'success',
        message: 'Plugins Listed',
        data: expect.any(Array),
      });
    });

    test('No Update available for Plugin', async () => {
      const packageJSONPath = `${workDir}/headlamp_flux/package.json`;
      const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath));
      packageJSON.artifacthub.version = '9999.0.0';
      fs.writeFileSync(packageJSONPath, JSON.stringify(packageJSON, null, 2));

      await PluginManager.update('@headlamp-k8s/flux', workDir, '', mockProgressCallback);
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'error',
        message: 'No updates available',
      });
    }, 30000);

    test('Update Plugin', async () => {
      // Downgrade the recorded version so an update is detected.
      const packageJSONPath = `${workDir}/headlamp_flux/package.json`;
      const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath));
      packageJSON.artifacthub.version = '0.0.0'; // Guarantee a strictly lower version
      fs.writeFileSync(packageJSONPath, JSON.stringify(packageJSON, null, 2));

      await PluginManager.update('@headlamp-k8s/flux', workDir, '', mockProgressCallback);
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'success',
        message: 'Plugin Updated',
      });
    }, 30000);

    test('Uninstall Plugin', () => {
      PluginManager.uninstall('@headlamp-k8s/flux', workDir, mockProgressCallback);
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'success',
        message: 'Plugin Uninstalled',
      });
    });
  });
});

describe('validateArchiveURL', () => {
  test('valid GitHub release URL', () => {
    expect(validateArchiveURL('https://github.com/kubernetes-sigs/headlamp/releases/download/v0.24.1/Headlamp-0.24.1-win-x64.exe')).toBe(true);
  });

  test('valid GitHub archive URL', () => {
    expect(validateArchiveURL('https://github.com/owner/repo/archive/refs/tags/v1.0.0.zip')).toBe(true);
  });

  test('valid Bitbucket download URL', () => {
    expect(validateArchiveURL('https://bitbucket.org/owner/repo/downloads/package-1.0.0.zip')).toBe(true);
  });

  test('valid Bitbucket get archive URL', () => {
    expect(validateArchiveURL('https://bitbucket.org/owner/repo/get/v1.0.0.tar.gz')).toBe(true);
  });

  test('valid GitLab release URL', () => {
    expect(validateArchiveURL('https://gitlab.com/gitlab-org/gitlab/-/archive/v17.2.0-ee/gitlab-v17.2.0-ee.tar.gz')).toBe(true);
  });

  test('invalid URL', () => {
    expect(validateArchiveURL('https://example.com/some/invalid/url')).toBe(false);
  });

  test('invalid GitHub URL', () => {
    expect(validateArchiveURL('https://github.com/owner/repo/invalid/path')).toBe(false);
  });

  test('invalid Bitbucket URL', () => {
    expect(validateArchiveURL('https://bitbucket.org/owner/repo/invalid/path')).toBe(false);
  });

  test('invalid GitLab URL', () => {
    expect(validateArchiveURL('https://gitlab.com/owner/repo/invalid/path')).toBe(false);
  });
});

const fetchWithRetry = pluginManagement.fetchWithRetry;

describe('fetchWithRetry', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => cb());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('recovers after transient failures and network rejections', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 500 }) // 1st try fails (HTTP error)
      .mockRejectedValueOnce(new Error('Network connection dropped')) // 2nd try fails (Network error)
      .mockResolvedValueOnce({ ok: true, status: 200 }); // 3rd try succeeds

    const response = await fetchWithRetry('https://example.com/api', {}, 3);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  test('exhausts retry budget on network rejections and throws last error', async () => {
    global.fetch.mockRejectedValue(new Error('Persistent network failure'));

    await expect(fetchWithRetry('https://example.com/api', {}, 3)).rejects.toThrow('Persistent network failure');
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  test('returns immediately on non-transient client errors', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 }); // 1st try returns 404

    const response = await fetchWithRetry('https://example.com/api', {}, 3);

    expect(global.fetch).toHaveBeenCalledTimes(1); // Should not retry 404
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });

  test('exhausts retry budget and returns last failed response for transient statuses', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503 });

    const response = await fetchWithRetry('https://example.com/api', {}, 3);

    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(response.ok).toBe(false);
    expect(response.status).toBe(503);

    expect(global.setTimeout).toHaveBeenCalledTimes(3);
    expect(global.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), 1000);
    expect(global.setTimeout).toHaveBeenNthCalledWith(2, expect.any(Function), 2000);
    expect(global.setTimeout).toHaveBeenNthCalledWith(3, expect.any(Function), 4000);
  });

  test('throws AbortError immediately during a request', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch.mockRejectedValue(abortError);

    await expect(fetchWithRetry('https://example.com/api', {}, 3)).rejects.toThrow('The operation was aborted');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('throws AbortError immediately during backoff', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    
    // For this test, we actually want setTimeout to block so we can abort it.
    // We'll restore setTimeout specifically for this test.
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => {
      // Don't call cb, let it hang so we can test cancellation.
      return 123; // fake timeout ID
    });
    jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});
    
    const controller = new AbortController();
    const fetchPromise = fetchWithRetry('https://example.com/api', { signal: controller.signal }, 3);

    await Promise.resolve(); // flush fetch promise
    
    // Abort while it's "waiting" in the mocked setTimeout
    controller.abort();

    await expect(fetchPromise).rejects.toThrow('The operation was aborted');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.clearTimeout).toHaveBeenCalled();
  });
});
