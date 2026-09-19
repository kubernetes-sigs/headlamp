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

import { defineConfig, type RsbuildPlugin } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';

// Dynamically inject REACT_APP_ environment variables
const reactAppEnvVars = Object.entries(process.env)
  .filter(([key, value]) => key.startsWith('REACT_APP_') && value !== undefined)
  .reduce<Record<string, string>>((env, [key, value]) => {
    env[`import.meta.env.${key}`] = JSON.stringify(value);
    return env;
  }, {});

// Use environment variable for backend port, defaulting to 4466
const backendPort = process.env.HEADLAMP_PORT || '4466';
const backendTarget = `http://localhost:${backendPort}`;
const frontendBaseUrl = process.env.PUBLIC_URL || process.env.BASE_URL || './';
const serverBase = frontendBaseUrl.startsWith('/') ? frontendBaseUrl : undefined;

const withServerBase = (paths: string[]) =>
  serverBase && serverBase !== '/'
    ? [...paths, ...paths.map(path => `${serverBase}${path}`)]
    : paths;

const removeViteEntryPlugin = (): RsbuildPlugin => ({
  name: 'remove-vite-entry',
  setup(api) {
    api.modifyHTML(html => {
      const viteEntry = '<script type="module" src="/src/index.tsx"></script>';
      if (!html.includes(viteEntry)) {
        throw new Error('Expected the Vite source entry in the HTML template');
      }
      return html.replace(viteEntry, '');
    });
  },
});

const useRelativeStaticAssetsPlugin = (): RsbuildPlugin => ({
  name: 'use-relative-static-assets',
  setup(api) {
    api.modifyHTML(html =>
      html.replace(
        /((?:src|href)=")\/(favicon\.ico|apple-touch-icon\.png|favicon-32x32\.png|favicon-16x16\.png|safari-pinned-tab\.svg|manifest\.json)(")/g,
        '$1./$2$3'
      )
    );
  },
});

const useRuntimeBasePlugin = (): RsbuildPlugin => ({
  name: 'use-runtime-base',
  apply: 'build',
  setup(api) {
    api.modifyHTML(html => html.replace('<head>', '<head>\n    <base href="./">'));
  },
});

export default defineConfig({
  source: {
    entry: {
      index: './src/index.tsx',
    },
    define: {
      global: 'globalThis',
      'import.meta.env.BASE_URL': JSON.stringify(frontendBaseUrl),
      'import.meta.env.UNDER_TEST': JSON.stringify(process.env.UNDER_TEST === 'true'), // Define UNDER_TEST as a boolean literal
      ...reactAppEnvVars, // Inject REACT_APP_ environment variables
    },
  },
  html: {
    template: './index.html',
    templateParameters: {
      BASE_URL: frontendBaseUrl,
    },
  },
  server: {
    base: serverBase,
    port: 3000,
    cors: true,
    // Combine routes into one proxy instance to avoid Node's MaxListeners warning (>10 routes)
    proxy: [
      {
        pathFilter: withServerBase([
          '/api',
          '/clusters',
          '/plugins',
          '/config',
          '/auth/',
          '/oidc',
          '/oidc-callback',
          '/externalproxy',
          '/drain-node',
          '/drain-node-status',
          '/parseKubeConfig',
          '/cluster',
          '/metrics',
        ]),
        target: backendTarget,
        changeOrigin: true,
      },
      {
        pathFilter: withServerBase(['/wsMultiplexer']),
        target: backendTarget,
        changeOrigin: true,
        ws: true,
      },
    ],
  },
  // dev: {
  //   hmr: false,
  // },
  output: {
    assetPrefix: 'auto',
    distPath: {
      root: 'build',
    },
    overrideBrowserslist: ['>0.2%', 'not dead', 'not op_mini all'],
    copy: [
      {
        from: 'node_modules/monaco-editor/min/vs',
        to: 'assets/vs',
      },
    ],
  },
  tools: {
    rspack: {
      module: {
        rules: [
          {
            // Handle ?url imports (e.g. elkjs worker) as asset URLs, matching Vite's ?url behavior
            resourceQuery: /url/,
            type: 'asset/resource',
          },
        ],
      },
      optimization: {
        splitChunks: {
          cacheGroups: {
            vendorLodash: {
              test: /[\\/]node_modules[\\/]lodash[\\/]/,
              name: 'vendor-lodash',
              chunks: 'all',
            },
            vendorMui: {
              test: /[\\/]node_modules[\\/]@mui[\\/]material[\\/]/,
              name: 'vendor-mui',
              chunks: 'all',
            },
            vendorXterm: {
              test: /[\\/]node_modules[\\/]xterm[\\/]/,
              name: 'vendor-xterm',
              chunks: 'all',
            },
            vendorRecharts: {
              test: /[\\/]node_modules[\\/]recharts[\\/]/,
              name: 'vendor-recharts',
              chunks: 'all',
            },
          },
        },
      },
      externals: {
        '@axe-core/react': 'commonjs @axe-core/react',
        // 'monaco-editor': 'commonjs monaco-editor',
        // 'monaco-editor/esm/vs/editor/common/services/editorSimpleWorker': 'commonjs monaco-editor/esm/vs/editor/common/services/editorSimpleWorker',
      },
      // Ignore monaco-editor's dynamic require() warning (unreachable in ESM build)
      ignoreWarnings: [
        {
          module:
            /monaco-editor[\\/]esm[\\/]vs[\\/]editor[\\/]common[\\/]services[\\/]editorSimpleWorker\.js/,
          message:
            /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
        },
      ],
    },
  },

  plugins: [
    removeViteEntryPlugin(),
    useRelativeStaticAssetsPlugin(),
    useRuntimeBasePlugin(),
    pluginReact({
      swcReactOptions: {
        throwIfNamespace: false,
      },
    }),
    pluginSvgr({
      svgrOptions: {
        prettier: false,
        svgo: false,
        svgoConfig: {
          plugins: [{ name: 'preset-default', params: { overrides: { removeViewBox: false } } }],
        },
        titleProp: true,
        ref: true,
        // support svg with namespace
      },
    }),
    pluginNodePolyfill({
      include: ['process', 'buffer', 'stream', 'https', 'http', 'require', 'path'],
    }),
    // replaceBaseUrlPlugin(),
  ],
});
