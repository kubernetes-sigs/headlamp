/*
 * Copyright 2026 The Kubernetes Authors
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

import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const installer = fs.readFileSync(
  new URL('../scripts/install-electron.js', import.meta.url),
  'utf8'
);

function runInstaller(env: NodeJS.ProcessEnv) {
  const loadInstaller = vi.fn((name: string) => {
    expect(name).toBe('electron/install.js');
    return { ...env };
  });
  vm.runInNewContext(installer, { process: { env }, require: loadInstaller });
  expect(loadInstaller).toHaveBeenCalledOnce();
  return loadInstaller.mock.results[0].value;
}

describe('Electron installer proxy compatibility', () => {
  it('maps the legacy HTTP proxy to both protocols before loading the installer', () => {
    const env = {
      ELECTRON_GET_USE_PROXY: '1',
      GLOBAL_AGENT_HTTP_PROXY: 'http://proxy.example:8080',
      GLOBAL_AGENT_NO_PROXY: 'localhost,*.internal.example',
    };

    expect(runInstaller(env)).toEqual({
      ...env,
      HTTP_PROXY: env.GLOBAL_AGENT_HTTP_PROXY,
      HTTPS_PROXY: env.GLOBAL_AGENT_HTTP_PROXY,
      NO_PROXY: env.GLOBAL_AGENT_NO_PROXY,
    });
  });

  it('preserves a separate legacy HTTPS proxy', () => {
    expect(
      runInstaller({
        ELECTRON_GET_USE_PROXY: '1',
        GLOBAL_AGENT_HTTP_PROXY: 'http://http.example:8080',
        GLOBAL_AGENT_HTTPS_PROXY: 'http://https.example:8080',
      })
    ).toMatchObject({
      HTTP_PROXY: 'http://http.example:8080',
      HTTPS_PROXY: 'http://https.example:8080',
    });
  });

  it.each(['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'])(
    'does not override explicit %s, including an empty value',
    name => {
      for (const value of ['explicit.example', '']) {
        const env = {
          ELECTRON_GET_USE_PROXY: '1',
          GLOBAL_AGENT_HTTP_PROXY: 'http://legacy.example:8080',
          GLOBAL_AGENT_HTTPS_PROXY: 'http://legacy-https.example:8080',
          GLOBAL_AGENT_NO_PROXY: 'legacy.example',
          [name]: value,
        };
        const installedEnv = runInstaller(env);

        expect(installedEnv[name]).toBe(value);
        if (name !== name.toUpperCase()) {
          expect(installedEnv[name.toUpperCase()]).toBeUndefined();
        }
      }
    }
  );

  it.each([undefined, ''])('does not enable legacy proxy settings without opt-in (%s)', flag => {
    const env = {
      ELECTRON_GET_USE_PROXY: flag,
      GLOBAL_AGENT_HTTP_PROXY: 'http://proxy.example:8080',
      GLOBAL_AGENT_NO_PROXY: 'localhost',
    };

    expect(runInstaller(env)).toEqual(env);
    expect(env).not.toHaveProperty('HTTP_PROXY');
  });

  it.each(['HTTP_PROXY', 'http_proxy'])(
    'preserves standard %s as the HTTPS fallback, including an explicit empty value',
    name => {
      for (const value of ['http://standard.example:8080', '']) {
        const installedEnv = runInstaller({
          ELECTRON_GET_USE_PROXY: '1',
          GLOBAL_AGENT_HTTP_PROXY: 'http://legacy.example:8080',
          GLOBAL_AGENT_HTTPS_PROXY: 'http://legacy-https.example:8080',
          [name]: value,
        });

        expect(installedEnv[name]).toBe(value);
        expect(installedEnv.HTTPS_PROXY).toBeUndefined();
        expect(installedEnv.https_proxy).toBeUndefined();
      }
    }
  );

  it('leaves standard-only proxy settings unchanged', () => {
    const env = { ELECTRON_GET_USE_PROXY: '1', HTTPS_PROXY: 'http://proxy.example:8080' };

    expect(runInstaller(env)).toEqual(env);
    expect(env).not.toHaveProperty('HTTP_PROXY');
  });

  it('propagates installer failures', () => {
    const error = new Error('Electron download failed');

    expect(() =>
      vm.runInNewContext(installer, {
        process: { env: {} },
        require: () => {
          throw error;
        },
      })
    ).toThrow(error);
  });
});
