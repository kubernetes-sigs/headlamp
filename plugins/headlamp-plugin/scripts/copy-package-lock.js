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
  // Remove all kinvolk-headlamp-plugin*.tgz
  const oldTgzFiles = fs.readdirSync('.').filter(file => file.startsWith('kinvolk-headlamp-plugin') && file.endsWith('.tgz'));
  oldTgzFiles.forEach(file => {
    console.log(`copy_package_lock: Removing old package file ${file}`);
    fs.rmSync(file, { force: true })
  });

  // Build a .tgz package. "npm run build && npm pack"
  console.log('copy_package_lock: Building kinvolk-headlamp-plugin package...');
  child_process.spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
  });
  child_process.spawnSync('npm', ['pack'], {
    stdio: 'inherit',
  });

  // Get filename of new kinvolk-headlamp-plugin*.tgz
  const tgzFiles = fs.readdirSync('.').filter(file => file.startsWith('kinvolk-headlamp-plugin') && file.endsWith('.tgz'));
  if (tgzFiles.length === 0) {
    console.error('copy_package_lock: Error: No kinvolk-headlamp-plugin*.tgz file found after npm pack');
    process.exit(1);
  }
  const tgzFile = tgzFiles[0];
  console.log(`copy_package_lock: Found package file ${tgzFile}`);

  // Make a tmp mypkgtmp with bin/headlamp-plugin.js create mypkgtmp
  // If mypkgtmp exists remove it first
  const packageName = 'mypkgtmp';
  if (fs.existsSync(packageName)) {
    fs.rmSync(packageName, { recursive: true, force: true });
  }
  child_process.spawnSync('node', ['bin/headlamp-plugin.js', 'create', packageName, '--noinstall'], {
    stdio: 'inherit',
  });

  // npm i the .tgz into mypkgtmp
  console.log(`copy_package_lock: Installing package ${tgzFile} into temporary folder...`);
  child_process.spawnSync('npm', ['install', path.join('..', tgzFile)], {
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

  // replace in template/package-lock.json  "@kinvolk/headlamp-plugin": "file:../kinvolk-headlamp-plugin-<version>.tgz"
  // with the version field of from ./package.json with a ^ in front
  const mainPackageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const pluginVersion = mainPackageJson.version;
  const tgzPattern = new RegExp(`"@kinvolk/headlamp-plugin": "file:\\.\\./${tgzFile.replace(/\./g, '\\.')}"`, 'g');
  const replacementString = `"@kinvolk/headlamp-plugin": "^${pluginVersion}"`;
  packageLockContent = packageLockContent.replace(tgzPattern, replacementString);

  // Also replace the resolved fields for @kinvolk/headlamp-plugin in 
  // template/package-lock.json to match the version from main package.json
  //
  // Example of the change:
  //    "packages": {
  //      ...
  //      "node_modules/@kinvolk/headlamp-plugin": {
  //        ...
  // -      "resolved": "file:../kinvolk-headlamp-plugin-0.13.0-alpha.13.tgz",
  // +      "resolved": "https://registry.npmjs.org/@kinvolk/headlamp-plugin/-/headlamp-plugin-0.13.0-alpha.13.tgz",
  const resolvedPattern = new RegExp(`"resolved": "file:\\.\\./${tgzFile.replace(/\./g, '\\.')}"`, 'g');
  const resolvedReplacement = `"resolved": "https://registry.npmjs.org/@kinvolk/headlamp-plugin/-/headlamp-plugin-${pluginVersion}.tgz"`;
  packageLockContent = packageLockContent.replace(resolvedPattern, resolvedReplacement);
    
  fs.writeFileSync('template/package-lock.json', packageLockContent);
  console.log('copy_package_lock: Updated template/package-lock.json');
}

copyPackageLock();
