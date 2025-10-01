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
  fs.copyFileSync(
    'package-lock.json',
    path.join('template', 'package-lock.json')
  );

  // Make a tmp mypkgtmp with bin/headlamp-plugin.js create mypkgtmp
  // If mypkgtmp exists remove it first
  const packageName = 'mypkgtmp';
  if (fs.existsSync(packageName)) {
    fs.rmSync(packageName, { recursive: true, force: true });
  }
  child_process.spawnSync('node', ['bin/headlamp-plugin.js', 'create', packageName, '--noinstall'], {
    stdio: 'inherit',
  });

  // Go into the folder and run "npm install"
  console.log('copy_package_lock: Installing dependencies in temporary folder to make sure everything is up to date...');
  child_process.spawnSync('npm', ['install'], {
    cwd: packageName,
    stdio: 'inherit',
  });

  // Remove the node_modules inside packageName, and run npm install again.
  // This is necessary to ensure that the package-lock.json file is stabalized.
  console.log('copy_package_lock: Removing node_modules and reinstalling to stabalize packages...');
  fs.rmSync(path.join(packageName, 'node_modules'), { recursive: true, force: true });
  child_process.spawnSync('npm', ['install'], {
    cwd: packageName,
    stdio: 'inherit',
  });

  // Remove the node_modules and run "npm ci" to confirm it's ok.
  console.log('copy_package_lock: Removing node_modules and running "npm ci" to confirm it is ok...');
  fs.rmSync(path.join(packageName, 'node_modules'), { recursive: true, force: true });
  child_process.spawnSync('npm', ['ci'], {
    cwd: packageName,
    stdio: 'inherit',
  });

  // copy mypkgtmp/package-lock.json into template/package-lock.json
  fs.copyFileSync(`${packageName}/package-lock.json`, 'template/package-lock.json');

  // Clean up temporary package
  console.log('copy_package_lock: Cleaning up temporary package...');
  fs.rmSync(packageName, { recursive: true, force: true });

  // replace in file template/package-lock.json  packageName with $${name}
  // just do a search / replace in the file
  let packageLockContent = fs.readFileSync('template/package-lock.json', 'utf8');
  // Use a replacer function so the replacement string is inserted literally as $${name}
  packageLockContent = packageLockContent.replace(new RegExp(packageName, 'g'), () => '$${name}');
  fs.writeFileSync('template/package-lock.json', packageLockContent);
  console.log('copy_package_lock: Updated template/package-lock.json');
}

copyPackageLock();
