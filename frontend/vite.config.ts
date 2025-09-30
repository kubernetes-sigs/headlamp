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

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import svgr from 'vite-plugin-svgr';
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  envPrefix: 'REACT_APP_',
  base: process.env.PUBLIC_URL,
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4466',
        changeOrigin: true,
      },
      '/clusters': {
        target: 'http://localhost:4466',
        changeOrigin: true,
      },
      '/plugins': {
        target: 'http://localhost:4466',
        changeOrigin: true,
      },
    },
    cors: true,
  },
  plugins: [
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
    }),
    react(),
    nodePolyfills({
      include: ['process', 'buffer', 'stream'],
    }),
    // Make sure we copy the minified monaco-editor source into the static folder
    // since it's loaded dynamically and not bundled via ESM. We do it this way
    // to support setting the localization language
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/monaco-editor/min/vs",
          dest: "assets", // copies to assets/vs
        },
      ],
    }),
  ],
  build: {
    outDir: 'build',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      // Exclude @axe-core from production bundle
      external: ['@axe-core/react'],
      output: {
        manualChunks(id: string) {
          // Build smaller chunks for @mui, lodash, xterm, recharts
          if (id.includes('node_modules')) {
            if (id.includes('lodash')) {
              return 'vendor-lodash';
            }

            if (id.includes('@mui/material')) {
              return 'vendor-mui';
            }

            if (id.includes('xterm')) {
              return 'vendor-xterm';
            }

            if (id.includes('recharts')) {
              return 'vendor-recharts';
            }
          }
        },
      },
    },
  },
});
