#!/usr/bin/env node

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

// @ts-check
'use strict';

const crypto = require('crypto');
const fs = require('fs-extra');
const envPaths = require('env-paths');
const os = require('os');
const path = require('path');
const resolve = path.resolve;
const child_process = require('child_process');
const validate = require('validate-npm-package-name');
const yargs = require('yargs/yargs');
const headlampPluginPkg = require('../package.json');
const { PluginManager, MultiPluginManager } = require('@headlamp-k8s/pluginctl');
const { table } = require('table');
const tar = require('tar');

// ES imports
const viteCopyPluginPromise = import('vite-plugin-static-copy');
const viteConfigPromise = import('../config/vite.config.mjs');
const vitePromise = import('vite');

/**
 * Creates a new plugin folder.
 *
 * Copies the files within template, and modifies a couple.
 * Then runs "npm ci" inside of the folder.
 *
 * @param {string} name - name of package and output folder.
 * @param {boolean} link - if we link @kinvolk/headlamp-plugin for testing
 * @param {boolean} noInstall - if we skip installing with "npm ci"
 * @returns {0 | 1 | 2 | 3} Exit code, where 0 is success, 1, 2, and 3 are failures.
 */
function create(name, link, noInstall) {
  const dstFolder = name;
  const templateFolder = path.resolve(__dirname, '..', 'template');
  const indexPath = path.join(dstFolder, 'src', 'index.tsx');
  const packagePath = path.join(dstFolder, 'package.json');
  const packageLockPath = path.join(dstFolder, 'package-lock.json');
  const readmePath = path.join(dstFolder, 'README.md');

  if (fs.existsSync(name)) {
    console.error(`"${name}" already exists, not initializing`);
    return 1;
  }

  const nameValid = validate(name);
  if (!nameValid.validForNewPackages) {
    console.error(`Invalid package name:"${name}":, not initializing`);
    console.error(nameValid.errors);
    return 2;
  }

  console.log(`Creating folder :${dstFolder}:`);

  fs.copySync(templateFolder, dstFolder, {
    errorOnExist: true,
    overwrite: false,
  });

  function replaceFileVariables(path) {
    fs.writeFileSync(
      path,
      fs
        .readFileSync(path, 'utf8')
        .split('$${name}')
        .join(name)
        .split('$${headlamp-plugin-version}')
        .join(headlampPluginPkg.version)
        .split('$${eslint-config-version}')
        .join(headlampPluginPkg.dependencies['@headlamp-k8s/eslint-config'])
    );
  }

  replaceFileVariables(packagePath);
  replaceFileVariables(packageLockPath);
  replaceFileVariables(indexPath);
  replaceFileVariables(readmePath);

  // This can be used to make testing locally easier.
  if (link) {
    console.log('Linking @kinvolk/headlamp-plugin');
    child_process.spawnSync('npm', ['link', '@kinvolk/headlamp-plugin'], {
      cwd: dstFolder,
    });
  }

  if (noInstall) {
    console.log('Skipping dependency installation...');
  } else {
    console.log('Installing...');

    // In the package-lock.json we try to update the integrity field of the
    // @kinvolk/headlamp-plugin package to match the integrity field on npmjs
    // registry for this version. If that fails (e.g. version not published yet),
    // we fall back to running `npm install` instead of `npm ci` and skip the update.
    let useNpmCi = false;
    try {
      const npmJsPkgResponse = child_process.execFileSync(
        'npm',
        ['view', `@kinvolk/headlamp-plugin@${headlampPluginPkg.version}`, 'dist', '--json'],
        { encoding: 'utf8' }
      );
      const npmJsPkg = JSON.parse(npmJsPkgResponse);
      const npmJsIntegrity = npmJsPkg.integrity;

      // Now replace integrity in the package-lock.json to match npmjs registry integrity.
      // "node_modules/@kinvolk/headlamp-plugin": {
      //   "version": "0.13.0-alpha.13",
      //   "resolved": "...",
      //   "integrity": "sha512-..."
      const packageLockContent = fs.readFileSync(packageLockPath, 'utf8');
      const integrityPattern = new RegExp(
        `("node_modules/@kinvolk/headlamp-plugin": \\{[\\s\\S]*?"integrity": ")[^"]+(")`,
        'g'
      );
      const packageLockContentNew = packageLockContent.replace(
        integrityPattern,
        `$1${npmJsIntegrity}$2`
      );
      if (packageLockContent !== packageLockContentNew) {
        fs.writeFileSync(packageLockPath, packageLockContentNew);
      }

      useNpmCi = true;
    } catch (e) {
      // no warning, we just fall back to npm install
    }

    try {
      if (useNpmCi) {
        console.log('Running npm ci...');
        child_process.execSync('npm ci', {
          stdio: 'inherit',
          cwd: dstFolder,
          encoding: 'utf8',
        });
      } else {
        console.log('Running npm install...');
        child_process.execSync('npm install', {
          stdio: 'inherit',
          cwd: dstFolder,
          encoding: 'utf8',
        });
      }
    } catch (e) {
      console.error(
        `Problem running ${
          useNpmCi ? 'npm ci' : 'npm install'
        } inside of "${dstFolder}" abs: "${resolve(dstFolder)}"`
      );
      return 3;
    }

    // This can be used to make testing locally easier.
    if (link) {
      // Seems to require linking again with npm 7+
      console.log('Linking @kinvolk/headlamp-plugin');
      child_process.spawnSync('npm', ['link', '@kinvolk/headlamp-plugin'], {
        cwd: dstFolder,
      });
    }
  }

  console.log(`"${dstFolder}" created.`);
  console.log(`1) Run the Headlamp app (so the plugin can be used).`);
  console.log(`2) Open ${dstFolder}/src/index.tsx in your editor.`);
  console.log(`3) Start development server of the plugin watching for plugin changes.`);
  console.log(`  cd "${dstFolder}"\n  npm run start`);
  console.log(`4) See the plugin inside Headlamp.`);

  return 0;
}

/**
 * extract copies folders of packages in the form:
 *   packageName/dist/main.js to packageName/main.js
 *   packageName/package.json to packageName/package.json
 *
 * @param {string} pluginPackagesPath - can be a package or a folder of packages.
 * @param {string} outputPlugins - folder where the plugins are placed.
 * @param {boolean} logSteps - whether to print the steps of the extraction (true by default).
 * @returns {0 | 1} Exit code, where 0 is success, 1 is failure.
 */
function extract(pluginPackagesPath, outputPlugins, logSteps = true) {
  if (!fs.existsSync(pluginPackagesPath)) {
    console.error(`"${pluginPackagesPath}" does not exist. Not extracting.`);
    return 1;
  }
  if (!fs.existsSync(outputPlugins)) {
    if (logSteps) {
      console.log(`"${outputPlugins}" did not exist, making folder.`);
    }
    fs.mkdirSync(outputPlugins);
  }

  /**
   * pluginPackagesPath is a package folder, not a folder of packages.
   */
  function extractPackage() {
    if (fs.existsSync(path.join(pluginPackagesPath, 'dist', 'main.js'))) {
      const distPath = path.join(pluginPackagesPath, 'dist');
      const trimmedPath =
        pluginPackagesPath.slice(-1) === path.sep
          ? pluginPackagesPath.slice(0, -1)
          : pluginPackagesPath;
      const folderName = trimmedPath.split(path.sep).splice(-1)[0];
      const plugName = path.join(outputPlugins, folderName);

      fs.ensureDirSync(plugName);

      const files = fs.readdirSync(distPath);
      files.forEach(file => {
        const srcFile = path.join(distPath, file);
        const destFile = path.join(plugName, file);
        console.log(`Copying "${srcFile}" to "${destFile}".`);
        fs.copyFileSync(srcFile, destFile);
      });

      const inputPackageJson = path.join(pluginPackagesPath, 'package.json');
      const outputPackageJson = path.join(plugName, 'package.json');
      console.log(`Copying "${inputPackageJson}" to "${outputPackageJson}".`);
      fs.copyFileSync(inputPackageJson, outputPackageJson);

      return true;
    }
    return false;
  }

  function extractFolderOfPackages() {
    const folders = fs.readdirSync(pluginPackagesPath, { withFileTypes: true }).filter(fileName => {
      return (
        fileName.isDirectory() &&
        fs.existsSync(path.join(pluginPackagesPath, fileName.name, 'dist', 'main.js'))
      );
    });

    folders.forEach(folder => {
      const distPath = path.join(pluginPackagesPath, folder.name, 'dist');
      const plugName = path.join(outputPlugins, folder.name);

      fs.ensureDirSync(plugName);

      const files = fs.readdirSync(distPath);
      files.forEach(file => {
        const srcFile = path.join(distPath, file);
        const destFile = path.join(plugName, file);
        console.log(`Copying "${srcFile}" to "${destFile}".`);
        fs.copyFileSync(srcFile, destFile);
      });

      const inputPackageJson = path.join(pluginPackagesPath, folder.name, 'package.json');
      const outputPackageJson = path.join(plugName, 'package.json');
      console.log(`Copying "${inputPackageJson}" to "${outputPackageJson}".`);
      fs.copyFileSync(inputPackageJson, outputPackageJson);
    });
    return folders.length !== 0;
  }

  if (!(extractPackage() || extractFolderOfPackages())) {
    console.error(`"${pluginPackagesPath}" does not contain packages. Not extracting.`);
    return 1;
  }

  return 0;
}

/**
 * Calculate the checksum of a file.
 *
 * @param {*} filePath
 * @returns
 */
async function calculateChecksum(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const hex = hashSum.digest('hex');
    return hex;
  } catch (error) {
    console.error('Error calculating checksum:', error);
    throw error; // Rethrow the error if you want to handle it further up the call stack
  }
}

/**
 * Copy extra files specified in package.json to the dist folder
 *
 * @param {string} [packagePath='.'] - Path to the package root containing package.json
 * @returns {Promise<void>}
 */
async function copyExtraDistFiles(packagePath = '.') {
  try {
    const packageJsonPath = path.join(packagePath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return; // No package.json, nothing to do
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const distFolder = path.resolve(packagePath, 'dist');

    // Create dist folder if it doesn't exist (although it should by this point)
    if (!fs.existsSync(distFolder)) {
      fs.mkdirSync(distFolder, { recursive: true });
    }

    // Auto-detect and copy locales folder if it exists (for i18n support)
    const localesPath = path.resolve(packagePath, 'locales');
    if (fs.existsSync(localesPath)) {
      const targetLocalesPath = path.join(distFolder, 'locales');
      console.log(`Auto-copying locales directory "${localesPath}" to "${targetLocalesPath}"`);
      fs.copySync(localesPath, targetLocalesPath);
    }

    // Process manual extraDist configuration if it exists
    if (packageJson.headlamp && packageJson.headlamp.extraDist) {
      const extraDist = packageJson.headlamp.extraDist;

      // Process all entries in extraDist
      for (const [target, source] of Object.entries(extraDist)) {
        const targetPath = path.join(distFolder, target);
        const sourcePath = path.resolve(packagePath, source);

        // Skip if source doesn't exist
        if (!fs.existsSync(sourcePath)) {
          console.warn(`Warning: extraDist source "${sourcePath}" does not exist, skipping.`);
          continue;
        }

        // Skip if this is locales and we already auto-copied it
        if (target === 'locales' && fs.existsSync(path.join(distFolder, 'locales'))) {
          console.log(`Skipping manual locales copy - already auto-copied`);
          continue;
        }

        // Create target directory if needed
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });

        // Copy based on whether it's a directory or file
        const sourceStats = fs.statSync(sourcePath);
        if (sourceStats.isDirectory()) {
          console.log(`Copying extra directory "${sourcePath}" to "${targetPath}"`);
          fs.copySync(sourcePath, targetPath);
        } else {
          console.log(`Copying extra file "${sourcePath}" to "${targetPath}"`);
          fs.copyFileSync(sourcePath, targetPath);
        }
      }
    }

    console.log('Successfully copied extra dist files');
  } catch (error) {
    console.error('Error copying extra dist files:', error);
  }
}

/**
 * Creates a tarball of the plugin package. The tarball is placed in the outputFolderPath.
 * It moves files from:
 *   packageName/dist/main.js to packageName/main.js
 *   packageName/package.json to packageName/package.json
 * And then creates a tarball of the resulting folder.
 *
 * @param {string} pluginDir - path to the plugin package.
 * @param {string} outputDir - folder where the tarball is placed.
 *
 * @returns {0 | 1} Exit code, where 0 is success, 1 is failure.
 */
async function createArchive(pluginDir, outputDir) {
  const pluginPath = path.resolve(pluginDir);
  if (!fs.existsSync(pluginPath)) {
    console.error(`Error: "${pluginPath}" does not exist. Not creating archive.`);
    return 1;
  }

  // Extract name + version from plugin's package.json
  const packageJsonPath = path.join(pluginPath, 'package.json');
  let packageJson = '';
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (e) {
    console.error(`Error: Failed to read package.json from "${pluginPath}". Not creating archive.`);
    return 1;
  }

  const sanitizedName = packageJson.name.replace(/@/g, '').replace(/\//g, '-');
  const tarballName = `${sanitizedName}-${packageJson.version}.tar.gz`;

  const outputFolderPath = path.resolve(outputDir);
  const tarballPath = path.join(outputFolderPath, tarballName);

  if (!fs.existsSync(outputFolderPath)) {
    console.log(`"${outputFolderPath}" did not exist, making folder.`);
    fs.mkdirSync(outputFolderPath, { recursive: true });
  } else if (fs.existsSync(tarballPath)) {
    console.error(`Error: Tarball "${tarballPath}" already exists. Not creating archive.`);
    return 1;
  }

  // Create temporary folder
  const tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-'));

  // Make sure any extraDist files are in the dist folder before extraction
  await copyExtraDistFiles(pluginPath);

  if (extract(pluginPath, tempFolder, false) !== 0) {
    console.error(
      `Error: Failed to extract plugin package to "${tempFolder}". Not creating archive.`
    );
    return 1;
  }

  const folderName = path.basename(pluginPath);

  // Create tarball
  await tar.c(
    {
      gzip: true,
      file: tarballPath,
      cwd: tempFolder,
    },
    [folderName]
  );

  // Remove temporary folder
  fs.rmSync(tempFolder, { recursive: true });

  console.log(`Created tarball: "${tarballPath}".`);

  // Print sha256 checksum for convenience
  const checksum = await calculateChecksum(tarballPath);
  console.log(`Tarball checksum (sha256): ${checksum}`);

  return 0;
}

/**
 * Inject selected environment variables into Vite config's define field.
 * Supports both import.meta.env and process.env styles.
 *
 * @param {object} config - Vite config object to mutate
 * @param {string[]} extraKeys - Additional Node-style keys to expose
 */
function injectEnvVars(config, extraKeys = ['NODE_ENV']) {
  if (!config.define) {
    config.define = {};
  }

  Object.keys(process.env)
    .filter(
      key =>
        key.startsWith('REACT_APP_') || key.startsWith('HEADLAMP_APP_') || extraKeys.includes(key)
    )
    .forEach(key => {
      const value = JSON.stringify(process.env[key]);
      console.log(`Injecting env var: ${key} = ${value}`);
      config.define[`import.meta.env.${key}`] = value;
      config.define[`process.env.${key}`] = value;
    });

  return config;
}

/**
 * Start watching for changes, and build again if there are changes.
 * @returns {Promise<number>} Exit code, where 0 is success.
 */
async function start() {
  /**
   * Copies the built plugin to the app config folder ~/.config/Headlamp/plugins/
   *
   * Adds a webpack config plugin for copying the folder.
   */
  async function copyToPluginsFolder(viteConfig) {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    // @todo: should the whole package name be used here,
    //    and the load be fixed to use? What about namespace packages?
    const packageName = packageJson.name.split('/').splice(-1)[0];
    const paths = envPaths('Headlamp', { suffix: '' });
    const configDir = fs.existsSync(paths.data) ? paths.data : paths.config;

    const { viteStaticCopy } = await viteCopyPluginPromise;

    viteConfig.plugins.push(
      viteStaticCopy({
        targets: [
          {
            src: './dist/*',
            dest: path.join(configDir, 'plugins', packageName),
          },
          {
            src: './package.json',
            dest: path.join(configDir, 'plugins', packageName),
          },
        ],
      })
    );

    viteConfig.plugins.push({
      name: 'headlamp-log-files-copied-to-plugin-folder',
      buildEnd: async () => {
        const destDir = path.join(configDir, 'plugins', packageName);
        if (!fs.existsSync(destDir)) {
          console.log(`No files copied to "${destDir}" (directory does not exist).`);
          return;
        }
        try {
          const files = fs.readdirSync(destDir);
          if (files.length === 0) {
            console.log(`No files found in "${destDir}".`);
            return;
          }
          files.forEach(file => {
            const destPath = path.join(destDir, file);
            const srcPath =
              file === 'package.json' ? path.resolve('package.json') : path.resolve('dist', file);
            console.log(`Copied "${srcPath}" -> "${destPath}"`);
          });
        } catch (err) {
          console.error('Error logging copied files:', err);
        }
      },
    });
  }

  /**
   * Inform if @kinvolk/headlamp-plugin is outdated.
   */
  async function informIfOutdated() {
    console.log('Checking if @kinvolk/headlamp-plugin is up to date...');
    child_process.exec('npm outdated --json', (error, stdout) => {
      if (error) {
        // npm outdated exit codes 1 when something is not up to date.
        const result = stdout.toString();
        const outdated = JSON.parse(result);
        if ('@kinvolk/headlamp-plugin' in outdated) {
          const url = `https://github.com/kubernetes-sigs/headlamp/releases`;
          console.warn(
            '    @kinvolk/headlamp-plugin is out of date. Run the following command to upgrade \n' +
              `    See release notes here: ${url}` +
              '    npx @kinvolk/headlamp-plugin upgrade'
          );
          return;
        }
      }
    });
  }

  setTimeout(() => {
    informIfOutdated().catch(error => {
      console.error('Error checking if @kinvolk/headlamp-plugin is up to date:', error);
    });
  }, 500);

  // Read package.json to get plugin name for dev mode
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const pluginName = packageJson.name || path.basename(process.cwd());

  const config = (await viteConfigPromise).default;
  const vite = await vitePromise;

  if (config.build) {
    config.build.watch = {};
    config.build.sourcemap = 'inline';
  }

  if (typeof process.env.NODE_ENV === 'undefined') {
    process.env.NODE_ENV = 'development';
  }
  injectEnvVars(config);

  // Add plugin name injection plugin for dev mode
  if (!config.plugins) {
    config.plugins = [];
  }

  const { pluginNameInjection } = await import('../config/vite-plugin-name-injection.mjs');
  config.plugins.push(pluginNameInjection({ pluginName }));

  // Add file copy hook to be executed after each build
  if (config.plugins) {
    config.plugins.push({
      name: 'headlamp-copy-extra-dist',
      buildEnd: async () => {
        await copyExtraDistFiles();
      },
    });
  }

  // Then add the plugins from copyToPluginsFolder which includes ViteStaticCopy
  await copyToPluginsFolder(config);

  try {
    await vite.build(config);
  } catch (e) {
    console.error(e);
    console.error('Failed to start watching for changes.');
    return 1;
  }

  return 0;
}

/**
 * Run script on a plugin package or folder of plugin packages.
 *
 * @param packageFolder {string} - folder where the package, or folder of packages is.
 * @param scriptName {string} - name of the script to run.
 * @param cmdLine {string} - command line to run.
 * @param env {object} - environment variables to run the command with.
 * @returns {0 | 1} - Exit code, where 0 is success, 1 is failure.
 */
function runScriptOnPackages(packageFolder, scriptName, cmdLine, env) {
  if (!fs.existsSync(packageFolder)) {
    console.error(`"${packageFolder}" does not exist. Not ${scriptName}-ing.`);
    return 1;
  }

  const oldCwd = process.cwd();

  const runOnPackageReturn = {
    success: 0,
    notThere: 1,
    issue: 2,
  };

  function runOnPackage(folder) {
    if (!fs.existsSync(path.join(folder, 'package.json'))) {
      return runOnPackageReturn.notThere;
    }

    process.chdir(folder);

    if (!fs.existsSync('node_modules')) {
      console.log(`No node_modules in "${folder}" found. Running npm install...`);

      try {
        child_process.execSync('npm install', {
          stdio: 'inherit',
          encoding: 'utf8',
        });
      } catch (e) {
        console.error(`Problem running 'npm install' inside of "${folder}"\r\n`);
        process.chdir(oldCwd);
        return runOnPackageReturn.issue;
      }
      console.log(`Finished npm install.`);
    }

    // See if the cmd is in the:
    // - package/node_modules/.bin
    // - package/../node_modules/.bin
    // - the npx node_modules/.bin
    // If not, just use the original cmdLine and hope for the best :)
    let cmdLineToUse = cmdLine;
    const scriptCmd = cmdLine.split(' ')[0];
    const scriptCmdRest = cmdLine.split(' ').slice(1).join(' ');

    const nodeModulesBinCmd = path.join('node_modules', '.bin', scriptCmd);
    const upNodeModulesBinCmd = path.join('../', nodeModulesBinCmd);

    // When run as npx, find it in the node_modules npx uses
    const headlampPluginBin = fs.realpathSync(process.argv[1]);
    const npxBinCmd = path.join(
      path.dirname(headlampPluginBin),
      '..',
      '..',
      '..',
      '..',
      nodeModulesBinCmd
    );

    if (fs.existsSync(nodeModulesBinCmd)) {
      cmdLineToUse = nodeModulesBinCmd + ' ' + scriptCmdRest;
    } else if (fs.existsSync(upNodeModulesBinCmd)) {
      cmdLineToUse = upNodeModulesBinCmd + ' ' + scriptCmdRest;
    } else if (fs.existsSync(npxBinCmd)) {
      cmdLineToUse = npxBinCmd + ' ' + scriptCmdRest;
    } else {
      console.warn(
        `"${scriptCmd}" not found in "${resolve(nodeModulesBinCmd)}" or "${resolve(
          upNodeModulesBinCmd
        )}" or "${resolve(npxBinCmd)}".`
      );
    }

    console.log(`"${folder}": ${scriptName}-ing, :${cmdLineToUse}:...`);

    const [cmd, ...args] = cmdLineToUse.split(' ');

    try {
      child_process.execFileSync(cmd, args, {
        stdio: 'inherit',
        encoding: 'utf8',
        env: { ...process.env, ...(env || {}) },
      });
    } catch (e) {
      console.error(`Problem running ${scriptName} inside of "${folder}"\r\n`);
      process.chdir(oldCwd);
      return runOnPackageReturn.issue;
    }

    console.log(`Done ${scriptName}-ing: "${folder}".\r\n`);
    process.chdir(oldCwd);
    return runOnPackageReturn.success;
  }

  function runOnFolderOfPackages(packageFolder) {
    const folders = fs.readdirSync(packageFolder, { withFileTypes: true }).filter(fileName => {
      return (
        fileName.isDirectory() &&
        fs.existsSync(path.join(packageFolder, fileName.name, 'package.json'))
      );
    });

    if (folders.length === 0) {
      return {
        error: runOnPackageReturn.notThere,
        failedFolders: [],
      };
    }

    const errorFolders = folders.map(folder => {
      const folderToProcess = path.join(packageFolder, folder.name);
      return {
        error: runOnPackage(folderToProcess),
        folder: folderToProcess,
      };
    });
    const failedErrorFolders = errorFolders.filter(
      errFolder => errFolder.error !== runOnPackageReturn.success
    );

    if (failedErrorFolders.length === 0) {
      return {
        error: runOnPackageReturn.success,
        failedFolders: [],
      };
    }
    return {
      error: runOnPackageReturn.issue,
      failedFolders: failedErrorFolders.map(errFolder => path.basename(errFolder.folder)),
    };
  }

  const exitCode = runOnPackage(packageFolder);

  if (exitCode === runOnPackageReturn.notThere) {
    const folderErr = runOnFolderOfPackages(packageFolder);
    if (folderErr.error === runOnPackageReturn.notThere) {
      console.error(
        `"${resolve(packageFolder)}" does not contain a package or packages. Not ${scriptName}-ing.`
      );
      return 1; // failed
    } else if (folderErr.error === runOnPackageReturn.issue) {
      console.error(
        `Some in "${resolve(packageFolder)}" failed. Failed folders: ${folderErr.failedFolders.join(
          ', '
        )}`
      );
      return 1; // failed
    }
  }

  return exitCode > 0 ? 1 : 0;
}

/**
 * Build the plugin package or folder of packages for production.
 *
 * @param packageFolder {string} - folder where the package, or folder of packages is.
 * @returns {Promise<0 | 1>} Exit code, where 0 is success, 1 is failure.
 */
async function build(packageFolder) {
  if (!fs.existsSync(packageFolder)) {
    console.error(`"${packageFolder}" does not exist. Not building.`);
    return 1;
  }

  const oldCwd = process.cwd();

  async function buildPackage(folder) {
    if (!fs.existsSync(path.join(folder, 'package.json'))) {
      return false;
    }

    process.chdir(folder);

    // Read package.json to get plugin name
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const pluginName = packageJson.name || path.basename(folder);

    console.log(`Building "${folder}" for production with plugin name: ${pluginName}...`);

    const config = await viteConfigPromise;
    const vite = await vitePromise;

    // Clone the config and add plugin name injection
    const buildConfig = { ...config.default };

    // Add plugin name injection to the plugins array
    if (!buildConfig.plugins) {
      buildConfig.plugins = [];
    }

    if (typeof process.env.NODE_ENV === 'undefined') {
      process.env.NODE_ENV = 'production';
    }
    injectEnvVars(buildConfig);

    // Import the plugin name injection plugin
    const { pluginNameInjection } = await import('../config/vite-plugin-name-injection.mjs');
    buildConfig.plugins.push(pluginNameInjection({ pluginName }));

    try {
      await vite.build(buildConfig);

      // Copy extra dist files after successful build
      await copyExtraDistFiles('.');

      console.log(`Finished building "${folder}" for production.`);
    } catch (e) {
      console.error(e);
      console.error(`Failed to build "${folder}" for production.`);
      process.exit(1);
    }

    process.chdir(oldCwd);
    return true;
  }

  function buildFolderOfPackages() {
    const folders = fs.readdirSync(packageFolder, { withFileTypes: true }).filter(fileName => {
      return (
        fileName.isDirectory() &&
        fs.existsSync(path.join(packageFolder, fileName.name, 'package.json'))
      );
    });

    folders.forEach(folder => {
      const folderToBuild = path.join(packageFolder, folder.name);
      if (!buildPackage(folderToBuild)) {
        console.error(`"${folderToBuild}" does not contain a package. Not building.`);
      }
    });
    return folders.length !== 0;
  }

  if (!(buildPackage(packageFolder) || buildFolderOfPackages())) {
    console.error(`"${packageFolder}" does not contain a package or packages. Not building.`);
  }

  return 0;
}

/**
 * Format plugin code with prettier. Format the plugin package or folder of packages.
 *
 * @param packageFolder {string} - folder where the package, or folder of packages is.
 * @param check {boolean} - if true, check if the code is checked for formatting, but don't format it.
 * @returns {0 | 1} Exit code, where 0 is success, 1 is failure.
 */
function format(packageFolder, check) {
  const cmdLine = check
    ? `prettier --config package.json --check src`
    : 'prettier --config package.json --write --cache src';
  return runScriptOnPackages(packageFolder, 'format', cmdLine, {});
}

/**
 * Use `npm outdated` to find which dependencies are not up to date.
 *
 * @returns a dict keyed by package name
 *
 * @see https://docs.npmjs.com/cli/v8/commands/npm-outdated
 *
 * #### Example
 * ```js
 *  {
 *    "@kinvolk/headlamp-plugin": {
 *      "current": "0.5.0",
 *      "wanted": "0.5.1",
 *      "latest": "0.5.1",
 *      "dependent": "pod-counter",
 *      "location": "/home/rene/dev/headlamp/plugins/examples/pod-counter/node_modules/@kinvolk/headlamp-plugin"
 *    }
 *  }
 * ```
 *
 * #### Example: Nothing needs updating?
 * ```js
 *  {}
 * ```
 */
function getNpmOutdated() {
  let result = null;

  try {
    result = child_process.execSync('npm outdated --json', {
      encoding: 'utf8',
    });
  } catch (error) {
    // npm outdated exit codes 1 when something is not up to date.
    result = error.stdout.toString();
  }
  return JSON.parse(result);
}

/**
 * Upgrade package automatically, updating headlamp-plugin version.
 *
 * In the future this could be used for other upgrade tasks.
 *
 * @param packageFolder {string} - folder where the package, or folder of packages is.
 * @parm skipPackageUpdates {boolean} - do not upgrade packages if true.
 * @param headlampPluginVersion {string} - tag or version of headlamp-plugin to upgrade to.
 * @returns {0 | 1} Exit code, where 0 is success, 1 is failure.
 */
function upgrade(packageFolder, skipPackageUpdates, headlampPluginVersion) {
  /**
   * Files from the template might not be there.
   *
   * Either because they created the package themselves,
   *   or used an old version headlamp-plugin create.
   *
   * Assumes we are in the package folder.
   */
  function addMissingTemplateFiles() {
    const missingFiles = [
      path.join('src', 'headlamp-plugin.d.ts'),
      path.join('.vscode', 'extensions.json'),
      path.join('.vscode', 'settings.json'),
      path.join('.vscode', 'tasks.json'),
      'tsconfig.json',
    ];
    const templateFolder = path.resolve(__dirname, '..', 'template');

    missingFiles.forEach(pathToCheck => {
      const from = path.join(templateFolder, pathToCheck);
      const to = path.join('.', pathToCheck);

      // only copy it if it doesn't exist
      if (!fs.existsSync(to)) {
        console.log(`Adding missing file: "${to}"`);
        // Make the folder in to there if it is not.
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
      // Add file if it is different
      if (fs.readFileSync(from, 'utf8') !== fs.readFileSync(to, 'utf8')) {
        console.log(`Updating file: "${to}"`);
        fs.copyFileSync(from, to);
      }
    });
  }

  /**
   * If there are material-ui v4 files in src/ folder, upgrade them to v5.
   *
   * @see https://mui.com/material-ui/migration/migration-v4/#run-codemods
   */
  function upgradeMui() {
    const hasMaterialUI = fs
      .readdirSync('src', { withFileTypes: true })
      .filter(dirent => dirent.isFile() && dirent.name.endsWith('.ts'))
      .map(dirent => path.join('src', dirent.name))
      .filter(path => fs.readFileSync(path, 'utf8').includes('@material-ui'));

    if (hasMaterialUI.length > 0) {
      console.log('Found files with "@material-ui". Upgrading material-ui v4 to mui v5...');
      const cmd = 'npx @mui/codemod v5.0.0/preset-safe src';
      if (runCmd(cmd, '.')) {
        console.error(`Failed to upgrade material-ui v4 to mui v5.`);
        return false;
      }
    }
    return true;
  }

  /**
   * Some files should not be there anymore.
   *
   * Assumes we are in the package folder.
   */
  function removeFiles() {
    const filesToRemove = ['jsconfig.json'];

    filesToRemove.forEach(pathToCheck => {
      const removePath = path.join('.', pathToCheck);
      if (fs.existsSync(removePath)) {
        console.log(`Removing file: "${removePath}"`);
        fs.unlinkSync(removePath);
      }
    });
  }

  /**
   * Adds missing config into package.json
   */
  function addMissingConfiguration() {
    const templateFolder = path.resolve(__dirname, '..', 'template');
    const packageJsonPath = path.join('.', 'package.json');
    const templatePackageJson = JSON.parse(
      fs.readFileSync(path.join(templateFolder, 'package.json'), 'utf8')
    );
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    let configChanged = false;

    /**
     * replaceNestedKeys is used to replace nested keys in the package.json file.
     *
     * It only replaces the properties specified, and does so if they
     * are missing or not equal to the ones in the template.
     *
     * @param {string} keyName top-level key in the package.json file that contains the nested keys to be replaced.
     * @param {string[]} subProperties names of the nested keys to be replaced in keyName.
     */
    function replaceNestedKeys(keyName, subProperties) {
      subProperties.forEach(key => {
        if (packageJson[keyName][key] !== templatePackageJson[keyName][key]) {
          packageJson[keyName][key] = templatePackageJson[keyName][key];
          configChanged = true;
          console.log(
            `Updated package.json field ${keyName}.${key}: ${JSON.stringify(
              packageJson[keyName][key]
            )}`
          );
        }
      });
    }

    // Update these scripts keys to match the template.
    replaceNestedKeys('scripts', ['tsc', 'storybook', 'test', 'storybook-build', 'i18n']);

    // replace top level keys
    const checkKeys = ['eslintConfig', 'prettier', 'overrides'];
    checkKeys.forEach(key => {
      if (JSON.stringify(packageJson[key]) !== JSON.stringify(templatePackageJson[key])) {
        packageJson[key] = templatePackageJson[key];
        configChanged = true;
        console.log(`Updated package.json field "${key}": ${JSON.stringify(packageJson[key])}`);
      }
    });

    if (configChanged) {
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, '  ') + '\n');
    }
  }

  /**
   * Runs the command (more conveniently than node).
   *
   * @param {string} cmd - that you want to run.
   * @param {string} folder = folder to run inside.
   * @returns status code, so 0 on success and failure otherwise.
   */
  function runCmd(cmd, folder) {
    console.log(`Running cmd:"${cmd}" inside of ${folder} abs: "${resolve(folder)}"`);
    try {
      child_process.execSync(cmd, {
        stdio: 'inherit',
        encoding: 'utf8',
      });
    } catch (e) {
      console.error(`Problem running ${cmd}`);
      return e.status;
    }
    return 0;
  }

  /**
   * In order to more robustly upgrade packages,
   * we reset the package-lock.json and node_modules.
   *
   * @returns true unless there is a problem.
   */
  function resetPackageLock() {
    if (fs.existsSync('node_modules')) {
      console.log(`Resetting node_modules folder for more robust package upgrade...`);
      // Remove the node_modules folder
      fs.rmSync('node_modules', { recursive: true });

      if (fs.existsSync('node_modules')) {
        console.error(`Failed to remove node_modules folder.`);
        return false;
      }
    }
    if (fs.existsSync('package-lock.json')) {
      console.log(`Resetting package-lock.json file for more robust package upgrade...`);
      fs.unlinkSync('package-lock.json');
    }
    return true;
  }

  /**
   * Upgrades "@kinvolk/headlamp-plugin" dependency to latest or given version.
   *
   * @returns true unless there is a problem with the upgrade.
   */
  function upgradeHeadlampPlugin() {
    const theTag = headlampPluginVersion ? headlampPluginVersion : 'latest';
    if (
      headlampPluginVersion !== undefined ||
      '@kinvolk/headlamp-plugin' in getNpmOutdated() ||
      !fs.existsSync('node_modules')
    ) {
      // Upgrade the @kinvolk/headlamp-plugin

      const cmd = `npm install @kinvolk/headlamp-plugin@${theTag} --save`;
      if (runCmd(cmd, '.')) {
        return false;
      }
    }

    return true;
  }

  /**
   * Removes "@headlamp-k8s/eslint-config" dependency if it is there.
   *
   * It is a transitive dependency of "@kinvolk/headlamp-plugin", and
   * does not need to be there anymore.
   *
   * @returns true unless there is a problem with the upgrade.
   */
  function removeEslintConfig() {
    const packageJsonPath = path.join('.', 'package.json');
    let packageJson = {};
    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (e) {
      console.error(`Error: Failed to read package.json from "${packageJsonPath}".`);
      return false;
    }
    const oldVersion = packageJson.devDependencies['@headlamp-k8s/eslint-config'];
    // remove @headlamp-k8s/eslint-config if it is there
    if (oldVersion) {
      const cmd = `npm remove @headlamp-k8s/eslint-config --save`;
      if (runCmd(cmd, '.')) {
        return false;
      }
    }

    return true;
  }

  /**
   * Upgrade a single package in a folder.
   *
   * @param {string} folder - where the package is.
   * @param {boolean | undefined} skipPackageUpdates - If true do not update packages.
   * @returns {boolean} - true if it is successful upgrading
   */
  function upgradePackage(folder, skipPackageUpdates) {
    const oldCwd = process.cwd();

    process.chdir(folder);
    console.log(`Upgrading "${folder}"...`);

    addMissingTemplateFiles();
    addMissingConfiguration();
    removeFiles();

    let failed = false;
    let reason = '';
    if (skipPackageUpdates !== true) {
      if (!failed && !removeEslintConfig()) {
        failed = true;
        reason = 'removing @headlamp-k8s/eslint-config failed.';
      }
      if (!failed && !resetPackageLock()) {
        failed = true;
        reason = 'resetting package-lock.json and node_modules failed.';
      }
      if (!failed && !upgradeHeadlampPlugin()) {
        failed = true;
        reason = 'upgrading @kinvolk/headlamp-plugin failed.';
      }
      if (!failed && !upgradeMui()) {
        failed = true;
        reason = 'upgrading from material-ui 4 to mui 5 failed.';
      }
      if (!failed && runCmd('npm audit fix', folder)) {
        console.warn('"npm audit fix" failed. You may need to inspect your dependencies manually.');
      }
      if (!failed && runCmd('npm run format', folder)) {
        failed = true;
        reason = '"npm run format" failed.';
      }
      if (!failed && runCmd('npm run lint', folder)) {
        failed = true;
        reason = '"npm run lint" failed.';
      }
      if (!failed && runCmd('npm run tsc', folder)) {
        failed = true;
        reason = '"npm run tsc" failed';
      }
    }
    if (failed) {
      console.error(`Failed upgrading: "${folder}". Reason: ${reason}`);
    } else {
      console.log(`Successfully upgraded: "${folder}".`);
    }
    process.chdir(oldCwd);
    return !failed;
  }

  /**
   * Upgrade each package inside the folder.
   *
   * @param {fs.Dirent[]} packageFolders - folders to upgrade.
   * @param {boolean | undefined} skipPackageUpdates - If true do not update packages.
   * @returns {boolean} - true if all of them are upgraded successfully.
   */
  function upgradeFolderOfPackages(packageFolders, skipPackageUpdates) {
    let failed = '';

    for (const folder of packageFolders) {
      if (failed) {
        console.error(
          `Skipping "${folder.name}", because "${failed}" did not upgrade successfully.`
        );
        continue;
      }
      const folderToUpgrade = path.join(packageFolder, folder.name);
      if (!upgradePackage(folderToUpgrade, skipPackageUpdates)) {
        failed = folderToUpgrade;
      }
    }
    return !failed;
  }

  if (!fs.existsSync(packageFolder)) {
    console.error(`"${packageFolder}" does not exist. Not upgrading.`);
    return 1;
  }

  if (fs.existsSync(path.join(packageFolder, 'package.json'))) {
    if (!upgradePackage(packageFolder, skipPackageUpdates)) {
      return 1;
    }
  } else {
    const packageFolders = fs
      .readdirSync(packageFolder, { withFileTypes: true })
      .filter(fileName => {
        return (
          fileName.isDirectory() &&
          fs.existsSync(path.join(packageFolder, fileName.name, 'package.json'))
        );
      });
    if (packageFolders.length === 0) {
      console.error(`"${packageFolder}" does not contain a package or packages. Not upgrading.`);
      return 1;
    }
    if (!upgradeFolderOfPackages(packageFolders, skipPackageUpdates)) {
      return 1;
    }
  }

  return 0;
}

/**
 * Lint code with eslint. Lint the plugin package or folder of packages.
 *
 * @param packageFolder {string} - folder where the package, or folder of packages is.
 * @param fix {boolean} - automatically fix problems.
 * @returns {0 | 1} - Exit code, where 0 is success, 1 is failure.
 */
function lint(packageFolder, fix) {
  const script = `eslint --cache -c package.json --max-warnings 0 --ext .js,.ts,.tsx src/${
    fix ? ' --fix' : ''
  }`;
  return runScriptOnPackages(packageFolder, 'lint', script, {});
}

/**
 * Type check code with tsc. Type check the plugin package or folder of packages.
 *
 * @param packageFolder {string} - folder where the package, or folder of packages is.
 * @returns {0 | 1} - Exit code, where 0 is success, 1 is failure.
 */
function tsc(packageFolder) {
  const script = 'tsc --noEmit';
  return runScriptOnPackages(packageFolder, 'tsc', script, {});
}

/**
 * Start storybook.
 *
 * @param packageFolder {string} - folder where the package is.
 * @returns {0 | 1} Exit code, where 0 is success, 1 is failure.
 */
function storybook(packageFolder) {
  try {
    child_process.execSync(
      './node_modules/.bin/storybook dev -p 6007 -c node_modules/@kinvolk/headlamp-plugin/config/.storybook',
      {
        stdio: 'inherit',
        cwd: packageFolder,
        encoding: 'utf8',
      }
    );
  } catch (e) {
    console.error(
      `Problem running storybook dev inside of "${packageFolder}" abs: "${resolve(packageFolder)}"`
    );
    return 1;
  }

  return 0;
}

/**
 * Build storybook.
 *
 * @param packageFolder {string} - folder where the package is.
 * @returns {0 | 1} Exit code, where 0 is success, 1 is failure.
 */
function storybook_build(packageFolder) {
  const script = `storybook build -c node_modules/@kinvolk/headlamp-plugin/config/.storybook`;
  return runScriptOnPackages(packageFolder, 'storybook build', script, {});
}

/**
 * Run tests.
 *
 * @param packageFolder {string} - folder where the package is.
 * @returns {0 | 1} Exit code, where 0 is success, 1 is failure.
 */
function test(packageFolder) {
  const script = `vitest -c node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs`;
  return runScriptOnPackages(packageFolder, 'test', script, { UNDER_TEST: 'true' });
}

/**
 * Set up or update i18n for a plugin package.
 * This will configure the plugin for internationalization by:
 * 1. Adding "i18n": ["en", "es", ...] to package.json headlamp config with supported locales
 * 2. Creating the locales directory structure
 * 3. Adding npm script for i18n extraction using bundled i18next-parser
 * 4. Creating i18next parser configuration
 * 5. Running i18next-parser to extract translatable strings
 *
 * @param packageFolder {string} - folder where the package is.
 * @returns {0 | 1} Exit code, where 0 is success, 1 is failure.
 */
function setupI18n(packageFolder) {
  if (!fs.existsSync(packageFolder)) {
    console.error(`"${packageFolder}" does not exist. Not setting up i18n.`);
    return 1;
  }

  const oldCwd = process.cwd();

  /**
   * Set up i18n for a single package.
   * @param {string} folder - folder where the package is.
   * @returns {boolean} - true if successful, false otherwise.
   */
  function setupI18nForPackage(folder) {
    if (!fs.existsSync(path.join(folder, 'package.json'))) {
      return false;
    }

    process.chdir(folder);
    console.log(`Setting up i18n for "${folder}"...`);

    try {
      // Read and update package.json
      const packageJsonPath = 'package.json';
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      // Initialize headlamp config if it doesn't exist
      if (!packageJson.headlamp) {
        packageJson.headlamp = {};
      }

      // Check if i18n is already enabled (array of locales)
      if (Array.isArray(packageJson.headlamp.i18n) && packageJson.headlamp.i18n.length > 0) {
        console.log(
          `✅ i18n is already enabled for ${
            packageJson.name
          } with locales: ${packageJson.headlamp.i18n.join(', ')}`
        );
      } else {
        // Enable i18n with empty locales array (locales will be added when specified)
        packageJson.headlamp.i18n = [];
        console.log(`✅ Enabled i18n in package.json for ${packageJson.name}`);
        console.log(`💡 To add locales, use: npm run i18n <locale> (e.g., npm run i18n es)`);
      }

      // Add i18n script if not already present
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }

      if (!packageJson.scripts.i18n) {
        packageJson.scripts.i18n = 'headlamp-plugin i18n';
        console.log(`📜 Added npm i18n script`);
      }

      // Write updated package.json
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

      // Create locales directory structure
      const localesDir = path.join('locales');

      if (!fs.existsSync(localesDir)) {
        fs.mkdirSync(localesDir, { recursive: true });
        console.log(`📁 Created ${localesDir} directory`);
      }

      // Create language directories for the locales specified in package.json
      const supportedLocales = packageJson.headlamp.i18n || [];
      supportedLocales.forEach(locale => {
        const localeDir = path.join(localesDir, locale);
        if (!fs.existsSync(localeDir)) {
          fs.mkdirSync(localeDir, { recursive: true });

          // Create empty translation.json file
          const translationFile = path.join(localeDir, 'translation.json');
          fs.writeFileSync(translationFile, '{\n}\n');
          console.log(`📁 Created ${locale} locale directory`);
        }
      });

      // Check if there's a local config file - if not, we'll use the bundled one
      const localConfigPath = 'i18next-parser.config.js';
      if (fs.existsSync(localConfigPath)) {
        console.log(`⚙️ Using existing local i18next-parser configuration`);
      } else {
        console.log(`⚙️ Using default i18next-parser configuration from headlamp-plugin`);
      }

      // Run i18next-parser to extract translatable strings
      console.log(`🔍 Extracting translatable strings from source code...`);
      const i18nextPath = path.join(__dirname, '..', 'node_modules', '.bin', 'i18next');
      const bundledConfigPath = path.join(__dirname, '..', 'config', 'i18next-parser.config.js');
      const { execFileSync } = require('child_process');

      try {
        execFileSync(i18nextPath, ['src/**/*.{ts,tsx,js,jsx}', '-c', bundledConfigPath], {
          stdio: 'inherit',
          cwd: process.cwd(),
        });
        console.log(`📝 Successfully extracted translatable strings`);
      } catch (error) {
        console.warn(`⚠️ Warning: Failed to run i18next-parser: ${error.message}`);
        console.log(`💡 You can manually run: npm run i18n`);
      }

      console.log(`\n🎉 i18n setup complete for ${packageJson.name}!`);
      console.log(`\n📖 Next steps:`);
      console.log(`1. Use the useTranslation() hook in your components:`);
      console.log(`   import { useTranslation } from '@kinvolk/headlamp-plugin/i18n';`);
      console.log(`   const { t } = useTranslation();`);
      console.log(`   return <div>{t('your.translation.key')}</div>;`);
      console.log(`2. Add more locales: npm run i18n <locale> (e.g., npm run i18n es)`);
      console.log(`3. Extract updated translatable strings: npm run i18n`);
      console.log(`4. Add translations in locales/<locale>/translation.json`);
      console.log(`\n💡 Note: Using default i18next-parser configuration from headlamp-plugin.`);
      console.log(`   If you need custom configuration, create your own i18next-parser.config.js`);

      return true;
    } catch (error) {
      console.error(`❌ Failed to set up i18n for "${folder}":`, error.message);
      return false;
    } finally {
      process.chdir(oldCwd);
    }
  }

  /**
   * Set up i18n for each package inside the folder.
   */
  function setupI18nForFolderOfPackages() {
    const folders = fs.readdirSync(packageFolder, { withFileTypes: true }).filter(fileName => {
      return (
        fileName.isDirectory() &&
        fs.existsSync(path.join(packageFolder, fileName.name, 'package.json'))
      );
    });

    if (folders.length === 0) {
      return false;
    }

    let allSuccessful = true;
    folders.forEach(folder => {
      const folderToProcess = path.join(packageFolder, folder.name);
      if (!setupI18nForPackage(folderToProcess)) {
        allSuccessful = false;
      }
    });

    return allSuccessful;
  }

  // Try to set up i18n for a single package first
  const singlePackageResult = setupI18nForPackage(packageFolder);

  if (!singlePackageResult) {
    // If it's not a single package, try treating it as a folder of packages
    const folderResult = setupI18nForFolderOfPackages();
    if (!folderResult) {
      console.error(
        `"${packageFolder}" does not contain a package or packages. Not setting up i18n.`
      );
      return 1;
    }
  }

  return 0;
}

/**
 * Run i18next-parser to extract translatable strings from a plugin.
 * This is called when the user runs 'headlamp-plugin i18n' directly.
 * If a locale is provided, it will be added to the supported locales in package.json.
 *
 * @param packageFolder {string} - folder where the package is.
 * @param newLocale {string} - optional locale to add to the plugin.
 * @returns {0 | 1} Exit code, where 0 is success, 1 is failure.
 */
function extractI18n(packageFolder, newLocale) {
  if (!fs.existsSync(packageFolder)) {
    console.error(`"${packageFolder}" does not exist.`);
    return 1;
  }

  const oldCwd = process.cwd();

  try {
    process.chdir(packageFolder);

    // Check if this is a package with i18n enabled
    const packageJsonPath = path.join(packageFolder, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.error(`No package.json found in "${packageFolder}".`);
      return 1;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    // Auto-setup i18n if not already configured
    if (!Array.isArray(packageJson.headlamp?.i18n)) {
      console.log(
        `🔧 i18n not configured for "${
          packageJson.name || packageFolder
        }". Setting up automatically...`
      );

      // Initialize headlamp config if it doesn't exist
      if (!packageJson.headlamp) {
        packageJson.headlamp = {};
      }

      // Enable i18n with empty locales array (locales will be added when specified)
      packageJson.headlamp.i18n = [];

      // Add i18n script if not already present
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }

      if (!packageJson.scripts.i18n) {
        packageJson.scripts.i18n = 'headlamp-plugin i18n';
        console.log(`📜 Added npm i18n script`);
      }

      // Create locales directory structure
      const localesDir = path.join(packageFolder, 'locales');

      if (!fs.existsSync(localesDir)) {
        fs.mkdirSync(localesDir, { recursive: true });
        console.log(`📁 Created ${localesDir} directory`);
      }

      console.log(`✅ Enabled i18n in package.json for ${packageJson.name}`);

      // Write updated package.json
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    }

    // Handle adding a new locale
    if (newLocale) {
      // Validate locale format (simple validation for common formats like 'en', 'es', 'en-US')
      if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(newLocale)) {
        console.error(
          `❌ Invalid locale format: "${newLocale}". Use format like 'en', 'es', 'en-US', etc.`
        );
        return 1;
      }

      // Get current supported locales
      const supportedLocales = packageJson.headlamp.i18n;

      // Add new locale if not already present
      if (!supportedLocales.includes(newLocale)) {
        supportedLocales.push(newLocale);
        packageJson.headlamp.i18n = supportedLocales;

        // Write updated package.json
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
        console.log(
          `✅ Added locale "${newLocale}" to supported locales: ${supportedLocales.join(', ')}`
        );

        // Create locale directory and translation file
        const localesDir = path.join(packageFolder, 'locales');
        const localeDir = path.join(localesDir, newLocale);

        if (!fs.existsSync(localeDir)) {
          fs.mkdirSync(localeDir, { recursive: true });
          const translationFile = path.join(localeDir, 'translation.json');
          fs.writeFileSync(translationFile, '{\n}\n');
          console.log(`📁 Created ${newLocale} locale directory and translation file`);
        } else {
          console.log(`📁 Locale directory for "${newLocale}" already exists`);
        }
      } else {
        console.log(
          `📝 Locale "${newLocale}" is already supported: ${supportedLocales.join(', ')}`
        );
      }
    }

    // Check for local config first, then fall back to bundled config
    const localConfigPath = path.join(packageFolder, 'i18next-parser.config.js');
    const bundledConfigPath = path.join(__dirname, '..', 'config', 'i18next-parser.config.js');

    let configToUse = '';
    if (fs.existsSync(localConfigPath)) {
      configToUse = './i18next-parser.config.js';
      console.log(`🔍 Using local i18next-parser configuration`);
    } else if (fs.existsSync(bundledConfigPath)) {
      configToUse = bundledConfigPath;
      console.log(`🔍 Using bundled i18next-parser configuration`);
    } else {
      console.error(
        `❌ No i18next-parser configuration found. Run 'headlamp-plugin setup-i18n' first.`
      );
      return 1;
    }

    console.log(`🔍 Extracting translatable strings from ${packageJson.name || packageFolder}...`);

    // Run i18next-parser using npx for better reliability
    const { execFileSync } = require('child_process');

    // Use npx to run i18next from the headlamp-plugin package
    const headlampPluginPath = path.join(__dirname, '..');
    execFileSync(
      'npx',
      ['--prefix', headlampPluginPath, 'i18next', 'src/**/*.{ts,tsx,js,jsx}', '-c', configToUse],
      {
        stdio: 'inherit',
        cwd: packageFolder,
      }
    );

    console.log(
      `✅ Successfully extracted translatable strings for ${packageJson.name || packageFolder}`
    );

    if (newLocale) {
      console.log(`\n💡 Translation tips for "${newLocale}":`);
      console.log(`1. Edit locales/${newLocale}/translation.json to add your translations`);
      console.log(`2. Use the same keys as in locales/en/translation.json`);
      console.log(`3. Re-run 'npm run i18n' after adding new translatable strings to your code`);
    }

    return 0;
  } catch (error) {
    console.error(`❌ Failed to extract translatable strings: ${error.message}`);
    return 1;
  } finally {
    process.chdir(oldCwd);
  }
}

// const headlampPluginBin = fs.realpathSync(process.argv[1]);
// console.log('headlampPluginBin path:', headlampPluginBin);

yargs(process.argv.slice(2))
  .command(
    'build [package]',
    'Build the plugin, or folder of plugins. <package> defaults to current working directory.',
    yargs => {
      yargs.positional('package', {
        describe: 'Package or folder of packages to build',
        type: 'string',
        default: '.',
      });
    },
    async argv => {
      // @ts-ignore
      process.exitCode = await build(argv.package);
    }
  )
  .command('start', 'Watch for changes and build plugin.', {}, async () => {
    process.exitCode = await start();
  })
  .command(
    'create <name>',
    'Create a new plugin folder.',
    yargs => {
      yargs
        .positional('name', {
          describe: 'Name of package',
          type: 'string',
        })
        .option('link', {
          describe:
            'For development of headlamp-plugin itself, so it uses npm link @kinvolk/headlamp-plugin.',
          type: 'boolean',
        })
        .option('noinstall', {
          describe: 'Skip installing dependencies with npm ci',
          type: 'boolean',
        });
    },
    argv => {
      // @ts-ignore
      process.exitCode = create(argv.name, argv.link, argv.noinstall);
    }
  )
  .command(
    'i18n [package] [locale]',
    'Extract translatable strings from plugin source code. Optionally add a new locale. Use --setup to configure i18n for a package. <package> defaults to current working directory.',
    yargs => {
      yargs
        .positional('package', {
          describe:
            'Package to extract translatable strings from (or package to setup with --setup)',
          type: 'string',
          default: '.',
        })
        .positional('locale', {
          describe: 'New locale to add to the plugin (e.g., es, fr, pt-BR)',
          type: 'string',
        })
        .option('setup', {
          describe:
            'Set up i18n for the package or folder of packages instead of extracting strings',
          type: 'boolean',
        })
        .example('headlamp-plugin i18n', 'Extract strings from current directory')
        .example('headlamp-plugin i18n . es', 'Add Spanish locale and extract strings')
        .example('headlamp-plugin i18n my-plugin pt-BR', 'Add Brazilian Portuguese to my-plugin')
        .example('headlamp-plugin i18n --setup', 'Set up i18n in the current package');
    },
    argv => {
      // If --setup flag is provided, run setupI18n and return
      if (argv.setup) {
        // @ts-ignore
        process.exitCode = setupI18n(argv.package);
        return;
      }

      // Handle the case where user runs "npm run i18n -- pt"
      // In this case, "pt" gets passed as the package parameter instead of locale
      let packageFolder = argv.package;
      let newLocale = argv.locale;

      // If package looks like a locale code and locale is undefined,
      // assume they meant to add a locale to the current directory
      if (!newLocale && packageFolder !== '.' && /^[a-z]{2}(-[A-Z]{2})?$/.test(packageFolder)) {
        newLocale = packageFolder;
        packageFolder = '.';
      }

      // @ts-ignore
      process.exitCode = extractI18n(packageFolder, newLocale);
    }
  )
  .command(
    'extract <pluginPackages> <outputPlugins>',
    'Copies folders of packages from pluginPackages/packageName/dist/main.js ' +
      'to outputPlugins/packageName/main.js.',
    yargs => {
      yargs.positional('pluginPackages', {
        describe:
          'A folder of plugin packages that have been built with dist/main.js in them.' +
          'Can also be a single package folder.',
        type: 'string',
      });
      yargs.positional('outputPlugins', {
        describe:
          'A plugins folder (eg. ".plugins") to extract plugins to. ' +
          'The output is a series of packageName/main.js. ' +
          'Creates this folder if it does not exist.',
        type: 'string',
      });
    },
    argv => {
      // @ts-ignore
      process.exitCode = extract(argv.pluginPackages, argv.outputPlugins);
    }
  )
  .command(
    'package [pluginPath] [outputDir]',
    'Creates a tarball of the plugin package in the format Headlamp expects.',
    yargs => {
      yargs.positional('pluginPath', {
        describe:
          'A folder of a plugin package that have been built with dist/main.js in it.' +
          ' Defaults to current working directory.',
        type: 'string',
      });
      yargs.positional('outputDir', {
        describe:
          'The destination folder in which to create the archive.' +
          'Creates this folder if it does not exist.',
        type: 'string',
      });
    },
    async argv => {
      let pluginPath = argv.pluginPath;
      if (!pluginPath) {
        pluginPath = process.cwd();
      }

      let outputDir = argv.outputDir;
      if (!outputDir) {
        outputDir = process.cwd();
      }

      process.exitCode = await createArchive(pluginPath, outputDir);
    }
  )
  .command(
    'format [package]',
    'format the plugin code with prettier. <package> defaults to current working directory.' +
      ' Can also be a folder of packages.',
    yargs => {
      yargs
        .positional('package', {
          describe: 'Package to code format',
          type: 'string',
          default: '.',
        })
        .option('check', {
          describe: 'Check the formatting without changing files',
          type: 'boolean',
        });
    },
    argv => {
      // @ts-ignore
      process.exitCode = format(argv.package, argv.check);
    }
  )
  .command(
    'lint [package]',
    'Lint the plugin for coding issues with eslint. ' +
      '<package> defaults to current working directory.' +
      ' Can also be a folder of packages.',
    yargs => {
      yargs
        .positional('package', {
          describe: 'Package to lint',
          type: 'string',
          default: '.',
        })
        .option('fix', {
          describe: 'Automatically fix problems',
          type: 'boolean',
        });
    },
    argv => {
      // @ts-ignore
      process.exitCode = lint(argv.package, argv.fix);
    }
  )
  .command(
    'tsc [package]',
    'Type check the plugin for coding issues with tsc. ' +
      '<package> defaults to current working directory.' +
      ' Can also be a folder of packages.',
    yargs => {
      yargs.positional('package', {
        describe: 'Package to type check',
        type: 'string',
        default: '.',
      });
    },
    argv => {
      // @ts-ignore
      process.exitCode = tsc(argv.package);
    }
  )
  .command(
    'storybook [package]',
    'Start storybook. <package> defaults to current working directory.',
    yargs => {
      yargs.positional('package', {
        describe: 'Package to start storybook for',
        type: 'string',
        default: '.',
      });
    },
    argv => {
      // @ts-ignore
      process.exitCode = storybook(argv.package);
    }
  )
  .command(
    'storybook-build [package]',
    'Build static storybook. <package> defaults to current working directory.' +
      ' Can also be a folder of packages.',
    yargs => {
      yargs.positional('package', {
        describe: 'Package to build storybook for',
        type: 'string',
        default: '.',
      });
    },
    argv => {
      // @ts-ignore
      process.exitCode = storybook_build(argv.package);
    }
  )
  .command(
    'upgrade [package]',
    'Upgrade the plugin to latest headlamp-plugin; ' +
      'upgrades headlamp-plugin and audits packages, formats, lints, type checks.' +
      '<package> defaults to current working directory. Can also be a folder of packages.',
    yargs => {
      yargs
        .positional('package', {
          describe: 'Package to upgrade',
          type: 'string',
          default: '.',
        })
        .option('skip-package-updates', {
          describe: 'For development of headlamp-plugin itself, so it does not do package updates.',
          type: 'boolean',
        })
        .option('headlamp-plugin-version', {
          describe:
            'Use a specific headlamp-plugin-version when upgrading packages. Defaults to "latest".',
          type: 'string',
        });
    },
    argv => {
      // @ts-ignore
      process.exitCode = upgrade(argv.package, argv.skipPackageUpdates, argv.headlampPluginVersion);
    }
  )
  .command(
    'test [package]',
    'Test. <package> defaults to current working directory.' + ' Can also be a folder of packages.',
    yargs => {
      yargs.positional('package', {
        describe: 'Package to test',
        type: 'string',
        default: '.',
      });
    },
    argv => {
      // @ts-ignore
      process.exitCode = test(argv.package);
    }
  )
  .command(
    'install [URL]',
    'Install plugin(s) from a configuration file or a plugin artifact Hub URL',
    yargs => {
      return yargs
        .positional('URL', {
          describe: 'URL of the plugin to install',
          type: 'string',
        })
        .option('config', {
          alias: 'c',
          describe: 'Path to plugin configuration file',
          type: 'string',
        })
        .option('folderName', {
          describe: 'Name of the folder to install the plugin into',
          type: 'string',
        })
        .option('headlampVersion', {
          describe: 'Version of headlamp to install the plugin into',
          type: 'string',
        })
        .option('quiet', {
          alias: 'q',
          describe: 'Do not print logs',
          type: 'boolean',
        })
        .option('watch', {
          alias: 'w',
          describe: 'Watch config file for changes and automatically reinstall plugins',
          type: 'boolean',
        })
        .check(argv => {
          if (!argv.URL && !argv.config) {
            throw new Error('Either URL or --config must be specified');
          }
          if (argv.URL && argv.config) {
            throw new Error('Cannot specify both URL and --config');
          }
          if (argv.watch && !argv.config) {
            throw new Error('Watch option can only be used with --config');
          }
          return true;
        });
    },
    async argv => {
      const { URL, config, folderName, headlampVersion, quiet, watch } = argv;
      try {
        const progressCallback = quiet
          ? () => {}
          : data => {
              const { type = 'info', message, raise = true } = data;
              if (config && !URL) {
                // bulk installation
                let prefix = '';
                if (data.current || data.total || data.plugin) {
                  prefix = `${data.current} of ${data.total} (${data.plugin}): `;
                }
                if (type === 'info' || type === 'success') {
                  console.log(`${prefix}${type}: ${message}`);
                } else if (type === 'error' && raise) {
                  throw new Error(message);
                } else {
                  console.error(`${prefix}${type}: ${message}`);
                }
              } else {
                if (type === 'error' || type === 'success') {
                  console.error(`${type}: ${message}`);
                }
              }
            };

        /**
         * @param {string} configPath
         */
        async function installFromConfig(configPath) {
          const installer = new MultiPluginManager(folderName, headlampVersion, progressCallback);
          const result = await installer.installFromConfig(configPath);
          if (result.failed > 0) {
            throw new Error(`${result.failed} plugins failed to install`);
          }
        }

        if (URL) {
          // Single plugin installation
          try {
            await PluginManager.install(URL, folderName, headlampVersion, progressCallback);
          } catch (e) {
            console.error(e.message);
            process.exit(1); // Exit with error status
          }
        } else if (config) {
          // Bulk installation from config
          try {
            await installFromConfig(config);
          } catch (error) {
            console.error('Installation failed', {
              error: error.message,
              stack: error.stack,
            });
          }

          if (watch) {
            console.log(`Watching ${config} for changes...`);
            fs.watch(config, async eventType => {
              if (eventType === 'change') {
                console.log(`Config file changed, reinstalling plugins...`);
                try {
                  await installFromConfig(config);
                  console.log('Plugins reinstalled successfully');
                } catch (error) {
                  console.error('Installation failed', {
                    error: error.message,
                    stack: error.stack,
                  });
                }
              }
            });

            // Keep the process running
            process.stdin.resume();

            // Handle graceful shutdown
            process.on('SIGINT', () => {
              console.log('\nStopping config file watch');
              process.exit(0);
            });
          }
        }
      } catch (error) {
        console.error('Installation failed', {
          error: error.message,
          stack: error.stack,
        });
        process.exit(1);
      }
    }
  )
  .command(
    'update <pluginName>',
    'Update a plugin to the latest version',
    yargs => {
      yargs
        .positional('pluginName', {
          describe: 'Name of the plugin to update',
          type: 'string',
        })
        .positional('folderName', {
          describe: 'Name of the folder that contains the plugin',
          type: 'string',
        })
        .positional('headlampVersion', {
          describe: 'Version of headlamp to update the plugin into',
          type: 'string',
        })
        .option('quiet', {
          alias: 'q',
          describe: 'Do not print logs',
          type: 'boolean',
        });
    },
    async argv => {
      const { pluginName, folderName, headlampVersion, quiet } = argv;
      const progressCallback = quiet
        ? null
        : data => {
            if (data.type === 'error' || data.type === 'success') {
              console.error(data.type, ':', data.message);
            }
          }; // Use console.log for logs if not in quiet mode
      try {
        await PluginManager.update(pluginName, folderName, headlampVersion, progressCallback);
      } catch (e) {
        console.error(e.message);
        process.exit(1); // Exit with error status
      }
    }
  )
  .command(
    'uninstall <pluginName>',
    'Uninstall a plugin',
    yargs => {
      yargs
        .positional('pluginName', {
          describe: 'Name of the plugin to uninstall',
          type: 'string',
        })
        .option('folderName', {
          describe: 'Name of the folder that contains the plugin',
          type: 'string',
        })
        .option('quiet', {
          alias: 'q',
          describe: 'Do not print logs',
          type: 'boolean',
        });
    },
    async argv => {
      const { pluginName, folderName, quiet } = argv;
      const progressCallback = quiet
        ? null
        : data => {
            if (data.type === 'error' || data.type === 'success') {
              console.error(data.type, ':', data.message);
            }
          }; // Use console.log for logs if not in quiet mode
      try {
        await PluginManager.uninstall(pluginName, folderName, progressCallback);
      } catch (e) {
        console.error(e.message);
        process.exit(1); // Exit with error status
      }
    }
  )
  .command(
    'list',
    'List installed plugins',
    yargs => {
      yargs
        .option('folderName', {
          describe: 'Name of the folder that contains the plugins',
          type: 'string',
        })
        .option('json', {
          alias: 'j',
          describe: 'Output in JSON format',
          type: 'boolean',
        });
    },
    async argv => {
      const { folderName, json } = argv;
      const progressCallback = data => {
        if (json) {
          console.log(JSON.stringify(data.data));
        } else {
          // display table
          const rows = [['Name', 'Version', 'Folder Name', 'Repo', 'Author']];
          data.data.forEach(plugin => {
            rows.push([
              plugin.pluginName,
              plugin.pluginVersion,
              plugin.folderName,
              plugin.repoName,
              plugin.author,
            ]);
          });
          console.log(table(rows));
        }
      };
      try {
        await PluginManager.list(folderName, progressCallback);
      } catch (e) {
        console.error(e.message);
        process.exit(1); // Exit with error status
      }
    }
  )
  .demandCommand(1, '')
  .strict()
  .help().argv;
