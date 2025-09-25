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

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

/**
 * Copies the package-lock.json file to the template folder and modifies its contents.
 */
function copyPackageLock() {
  console.log('copy_package_lock: Copying package-lock.json to template folder...');
  
  // Create a temporary directory outside the workspace to avoid workspace interference
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-'));
  const packageName = 'mypkgtmp';
  const packagePath = path.join(tmpDir, packageName);
  const headlampPluginBin = path.join(__dirname, '..', 'bin', 'headlamp-plugin.js');
  
  console.log(`copy_package_lock: Creating temporary plugin in ${packagePath}...`);
  child_process.spawnSync('node', [headlampPluginBin, 'create', packageName, '--noinstall'], {
    cwd: tmpDir,
    stdio: 'inherit',
  });

  // Remove the package-lock.json from the template to force npm to generate a clean one
  console.log('copy_package_lock: Removing template package-lock.json to ensure clean generation...');
  const tempPackageLock = path.join(packagePath, 'package-lock.json');
  if (fs.existsSync(tempPackageLock)) {
    fs.unlinkSync(tempPackageLock);
  }

  // Go into the folder and run "npm install"
  console.log('copy_package_lock: Installing dependencies in temporary folder to make sure everything is up to date...');
  child_process.spawnSync('npm', ['install'], {
    cwd: packagePath,
    stdio: 'inherit',
  });

  // Remove the node_modules inside packageName, and run npm install again.
  // This is necessary to ensure that the package-lock.json file is stabalized.
  console.log('copy_package_lock: Removing node_modules and reinstalling to stabalize packages...');
  fs.rmSync(path.join(packagePath, 'node_modules'), { recursive: true, force: true });
  child_process.spawnSync('npm', ['install'], {
    cwd: packagePath,
    stdio: 'inherit',
  });

  // Remove the node_modules and run "npm ci" to confirm it's ok.
  console.log('copy_package_lock: Removing node_modules and running "npm ci" to confirm it is ok...');
  fs.rmSync(path.join(packagePath, 'node_modules'), { recursive: true, force: true });
  child_process.spawnSync('npm', ['ci'], {
    cwd: packagePath,
    stdio: 'inherit',
  });

  // copy mypkgtmp/package-lock.json into template/package-lock.json
  const templatePath = path.join(__dirname, '..', 'template', 'package-lock.json');
  fs.copyFileSync(path.join(packagePath, 'package-lock.json'), templatePath);

  // Clean up temporary directory
  console.log('copy_package_lock: Cleaning up temporary package...');
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err) {
    // On Windows, files may be locked by antivirus or indexing services
    // Log the error but don't fail the script since the OS will clean up temp files
    console.warn(`Warning: Failed to clean up temporary directory ${tmpDir}: ${err.message}`);
    console.warn('The OS will clean up temporary files automatically.');
  }

  // replace in file template/package-lock.json  packageName with $${name}
  // just do a search / replace in the file
  let packageLockContent = fs.readFileSync(templatePath, 'utf8');
  // Use a replacer function so the replacement string is inserted literally as $${name}
  packageLockContent = packageLockContent.replace(new RegExp(packageName, 'g'), () => '$${name}');
  fs.writeFileSync(templatePath, packageLockContent);
  console.log('copy_package_lock: Updated template/package-lock.json');
}

copyPackageLock();
