import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';

// Dynamically inject REACT_APP_ environment variables
const reactAppEnvVars = Object.entries(process.env)
  .filter(([key, value]) => key.startsWith('REACT_APP_') && value !== undefined)
  .reduce((env, [key, value]) => {
    env[`import.meta.env.${key}`] = JSON.stringify(value);
    return env;
  }, { 'import.meta.env': '{}' });

// Use environment variable for backend port, defaulting to 4466
const backendPort = process.env.HEADLAMP_PORT || '4466';
const backendTarget = `http://localhost:${backendPort}`;

export default defineConfig({
  source: {
    entry: {
      index: './src/index.tsx',
    },
    define: {
      global: 'globalThis',
      'import.meta.env.BASE_URL': JSON.stringify(process.env.BASE_URL || './'), // Define BASE_URL with a default value
      ...reactAppEnvVars, // Inject REACT_APP_ environment variables
    },
  },
  html: {
    template: './index.html',
    templateParameters: {
      BASE_URL: process.env.BASE_URL || '/',
    },
  },
  server: {
    port: 3000,
    cors: true,
    proxy: {
      '/api': { target: backendTarget, changeOrigin: true },
      '/clusters': { target: backendTarget, changeOrigin: true },
      '/plugins': { target: backendTarget, changeOrigin: true },
      '/config': { target: backendTarget, changeOrigin: true },
      '/auth': { target: backendTarget, changeOrigin: true },
      '/oidc': { target: backendTarget, changeOrigin: true },
      '/oidc-callback': { target: backendTarget, changeOrigin: true },
      '/wsMultiplexer': { target: backendTarget, changeOrigin: true, ws: true },
      '/externalproxy': { target: backendTarget, changeOrigin: true },
      '/drain-node': { target: backendTarget, changeOrigin: true },
      '/drain-node-status': { target: backendTarget, changeOrigin: true },
      '/parseKubeConfig': { target: backendTarget, changeOrigin: true },
      '/cluster': { target: backendTarget, changeOrigin: true },
      '/metrics': { target: backendTarget, changeOrigin: true },
    },
  },
  // dev: {
  //   hmr: false,
  // },
  output: {
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
    },
  },

  plugins: [
    pluginReact({
      swcReactOptions: {
        throwIfNamespace: false,
      }
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
