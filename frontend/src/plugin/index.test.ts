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

import { beforePluginStartupDeadline, fetchAndExecutePlugins } from './index';

describe('private GitHub OAuth loader injection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([true, false])(
    'executes plugins with only the exact grant receiving OAuth (desktop=%s)',
    async desktop => {
      const probes: Record<string, unknown> = {};
      const pending: Promise<unknown>[] = [];
      vi.stubGlobal('oauthLoaderProbes', probes);
      vi.stubGlobal('oauthLoaderPending', pending);
      const tokens = {
        success: true,
        accessToken: 'ghu_private',
        refreshToken: 'ghr_private',
        expiresAt: '2030-01-01T00:00:00Z',
      };
      const plugins = ['granted', 'other'].map(name => ({
        name,
        source: 'shipped',
        type: 'shipped',
        path: `static-plugins/${name}`,
      }));
      const pluginSource = (name: string) => `
      window.oauthLoaderProbes[${JSON.stringify(name)}] = typeof pluginGitHubOAuth;
      window.oauthLoaderProbes.globalCallback = typeof window.desktopApi?.onGitHubOAuthCallback;
      if (typeof pluginGitHubOAuth !== 'undefined') {
        pluginGitHubOAuth.onGitHubOAuthCallback(result => { window.oauthLoaderProbes.tokens = result; });
        window.oauthLoaderPending.push(pluginGitHubOAuth.startGitHubOAuth().then(status => { window.oauthLoaderProbes.status = status; }));
      }
    `;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL | Request) => {
          const url = new URL(
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
            'http://localhost'
          );
          if (url.pathname === '/plugins') return new Response(JSON.stringify(plugins));
          const name = url.pathname.includes('/granted/') ? 'granted' : 'other';
          if (url.pathname.endsWith('/main.js')) return new Response(pluginSource(name));
          if (url.pathname.endsWith('/package.json'))
            return new Response(
              JSON.stringify({
                name: `@example/${name}`,
                version: '1.0.0',
                devDependencies: { '@kinvolk/headlamp-plugin': '1.0.0' },
              })
            );
          throw new Error(`Unexpected plugin fixture URL: ${url}`);
        })
      );
      vi.stubGlobal(
        'desktopApi',
        desktop
          ? {
              receive: (channel: string, callback: (value: object) => void) => {
                if (channel === 'plugin-permission-secrets') callback({});
              },
              send: vi.fn(),
              commandCapabilities: {
                register: async () =>
                  plugins.map(({ name }) => ({
                    bundleName: name,
                    packageName: `@example/${name}`,
                    source: 'shipped',
                    capability: (name === 'granted' ? 'a' : 'b').repeat(64),
                    clusterRegistrationProviders: [],
                    ...(name === 'granted' && { githubOAuth: true }),
                  })),
              },
              githubOAuth: { start: async () => tokens, refresh: async () => tokens },
            }
          : undefined
      );

      await fetchAndExecutePlugins([], vi.fn(), vi.fn());
      await Promise.all(pending);

      expect(probes.granted).toBe(desktop ? 'object' : 'undefined');
      expect(probes.other).toBe('undefined');
      expect(probes.globalCallback).toBe('undefined');
      if (desktop) {
        expect(probes.tokens).toEqual(tokens);
        expect(probes.status).toEqual({ success: true });
      } else {
        expect(probes).not.toHaveProperty('tokens');
      }
    }
  );
});

describe('beforePluginStartupDeadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects work that does not finish within the remaining startup budget', async () => {
    vi.useFakeTimers();
    const result = beforePluginStartupDeadline(new Promise(() => {}), Date.now() + 100);
    const rejection = expect(result).rejects.toThrow('Plugin startup timed out');

    await vi.advanceTimersByTimeAsync(100);

    await rejection;
  });
});
