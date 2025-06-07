/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import svgr from 'vite-plugin-svgr';
import { resolve } from 'path';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { fileURLToPath } from 'url';

const externalModules = {
  '@mui/material': 'pluginLib.MuiMaterial',
  '@monaco-editor/react': 'pluginLib.ReactMonacoEditor',
  'monaco-editor': 'pluginLib.MonacoEditor',
  '@mui/lab': 'pluginLib.MuiLab',
  '@mui/styles': 'pluginLib.MuiStyles',
  react: 'pluginLib.React',
  'react/jsx-runtime': 'pluginLib.ReactJSX',
  recharts: 'pluginLib.Recharts',
  'react-router': 'pluginLib.ReactRouter',
  'react-router-dom': 'pluginLib.ReactRouter',
  'react-redux': 'pluginLib.ReactRedux',
  'react-dom': 'pluginLib.ReactDOM',
  '@iconify/react': 'pluginLib.Iconify',
  lodash: 'pluginLib.Lodash',
  notistack: 'pluginLib.Notistack',
  '@kinvolk/headlamp-plugin/lib/ApiProxy': 'pluginLib.ApiProxy',
  '@kinvolk/headlamp-plugin/lib/Crd': 'pluginLib.Crd',
  '@kinvolk/headlamp-plugin/lib/lib/k8s/crd': 'pluginLib.Crd',
  '@kinvolk/headlamp-plugin/lib/k8s/crd': 'pluginLib.Crd',
  '@kinvolk/headlamp-plugin/lib/K8s/crd': 'pluginLib.Crd',
  '@kinvolk/headlamp-plugin/lib/K8s': 'pluginLib.K8s',
  '@kinvolk/headlamp-plugin/lib/CommonComponents': 'pluginLib.CommonComponents',
  '@kinvolk/headlamp-plugin/lib/Router': 'pluginLib.Router',
  '@kinvolk/headlamp-plugin/lib/Utils': 'pluginLib.Utils',
  '@kinvolk/headlamp-plugin/lib/Notification': 'pluginLib.Notification',
  // We also point k8s (lowercase) to it, since users may use it instead as it's closer to
  // how it's used in Headlamp's source code.
  '@kinvolk/headlamp-plugin/lib/k8s': 'pluginLib.K8s',
  '@kinvolk/headlamp-plugin/lib': 'pluginLib',
  '@kinvolk/headlamp-plugin/lib/components/common': 'pluginLib.CommonComponents',
};

const noSubmodules = [
  'react',
  'react-redux',
  'react-router',
  'react-router-dom',
  'react-dom',
  'react/jsx-runtime',
];

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  plugins: [
    nodePolyfills({
      include: ['process', 'buffer', 'stream'],
    }),
    svgr({
      svgrOptions: {
        prettier: false,
        svgo: false,
        svgoConfig: {
          plugins: [{ removeViewBox: false }],
        },
        titleProp: true,
        ref: true,
      },
      include: '**/*.svg',
    }),
    cssInjectedByJsPlugin(),
    react(),
  ],
  resolve: {
    alias: [
      {
        find: /^(vite-plugin-node-polyfills\/shims\/.+)/,
        replacement: '$1',
        customResolver(source) {
          const resolved = import.meta.resolve(source);
          return fileURLToPath(resolved);
        },
      },
    ],
  },
  optimizeDeps: {
    exclude: ['monaco-editor'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: import.meta.dirname + '/setupTests.js',
  },
  build: {
    lib: {
      entry: resolve('src/index.tsx'),
      name: 'main',
      fileName: 'main',
      formats: ['umd'],
    },
    rollupOptions: {
      // Workaround for https://github.com/vitejs/vite/issues/19410
      maxParallelFileOps: 500,
      external: Object.keys(externalModules).map(key =>
        noSubmodules.includes(key) ? key : new RegExp(`^${key}`)
      ),
      output: {
        interop: 'compat',
        entryFileNames: 'main.js',
        globals: request => {
          // For cases like: import { Grid } from '@mui/material'
          if (externalModules[request]) {
            return externalModules[request];
          }

          // For cases like:
          // import Grid from '@mui/material/Grid' -> const Grid = pluginLib.MuiMaterial["Grid"];
          for (const importModule of Object.keys(externalModules)) {
            const modulePrefix = importModule + '/';
            if (request.startsWith(modulePrefix)) {
              const submodule = request.replace(modulePrefix, '').replace(/\/+/g, '');
              return `${externalModules[importModule]}.${submodule}`;
            }
          }

          return request;
        },
      },
    },
  },
});
