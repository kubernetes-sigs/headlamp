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

import * as fs from 'fs';
import * as path from 'path';

// Get the path to the frontend locales directory
let frontendLocalesPath: string;
const isDev = process.env.ELECTRON_DEV || false;
// Check if we're running in a normal Node.js process (for i18next-parser)
// or in an Electron environment
const isRunningInNode = !(process as any).resourcesPath;

if (isDev || isRunningInNode) {
  // When running as a normal Node.js process (i18next parser) or in dev mode
  frontendLocalesPath = path.resolve(__dirname, '../../frontend/src/i18n/locales');
} else {
  // When running in Electron production mode
  frontendLocalesPath = path.join((process as any).resourcesPath, 'frontend/i18n/locales');
}

// Read available locales from the frontend locales directory
const currentLocales: string[] = [];
if (fs.existsSync(frontendLocalesPath)) {
  fs.readdirSync(frontendLocalesPath).forEach(file => {
    // Only include directories, not files
    if (fs.statSync(path.join(frontendLocalesPath, file)).isDirectory()) {
      currentLocales.push(file);
    }
  });
}

// If no locales found, default to English
export const CURRENT_LOCALES = currentLocales.length > 0 ? currentLocales : ['en'];
export const LOCALES_DIR = frontendLocalesPath;
