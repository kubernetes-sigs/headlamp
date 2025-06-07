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

// Because tsc doesn't copy css and svg files, we need to copy them manually.
// shx didn't quite work for this, therefore this script.
// Used by npm run build

const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');

const sourceDir = path.resolve(__dirname, '../../../frontend/src/components');
const destDir = path.resolve(__dirname, '../lib/components');
const verbose = false;

function copyStaticFiles(src, dest) {
  fs.readdirSync(src, { withFileTypes: true }).forEach(entry => {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    const staticExtensions = ['.css', '.svg'];

    if (entry.isDirectory()) {
      copyStaticFiles(srcPath, destPath);
    } else if (staticExtensions.some(ext => entry.name.endsWith(ext))) {
      fse.ensureDirSync(dest);
      fse.copyFileSync(srcPath, destPath);
      if (verbose) {
        console.log(`Copied: ${srcPath} → ${destPath}`);
      }
    }
  });
}

try {
  copyStaticFiles(sourceDir, destDir);
  if (verbose) {
    console.log(`✅ All .css and .svg files copied from ${sourceDir} to ${destDir} successfully`);
  }
} catch (error) {
  console.error(`❌ Error copying .css and .svg files: ${error.message}`);
  process.exit(1);
}
