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

/*
 * # What is dependencies-sync.js for?
 *
 * Aids maintenance syncing packages between frontend/ and headlamp-plugin
 * Inside headlamp-plugin/ folder: `npm run update-dependencies`.
 *
 * This script is used to sync the dependencies between the frontend and headlamp-plugin.
 * It updates the dependencies from frontend/package.json into headlamp-plugin/packages.json.
 */

// Some packages are used by headlamp-plugin that are not used by the frontend.
// These won't be removed from headlamp-plugin/package.json
const dependenciesFrontDoesNotHave = new Set([
  'env-paths',
  'shx',
  'fs-extra',
  'validate-npm-package-name',
  'yargs',
  'table',
  'tar',
  'vite-plugin-css-injected-by-js',
  'vite-plugin-static-copy',
  '@storybook/addon-webpack5-compiler-swc',
  '@storybook/react-webpack5',
  'ts-loader',
  '@headlamp-k8s/pluginctl',
]);

// Dependencies from frontend/package.json that aren't wanted by headlamp-plugin.
// These won't be added to headlamp-plugin/package.json
const dependenciesToNotCopy = [
  '@storybook/test',
  'husky',
  'typedoc',
  'typedoc-hugo-theme',
  'typedoc-plugin-markdown',
  'typedoc-plugin-rename-defaults',
  'eslint-plugin-license-header',
  '@rsbuild/core',
  '@rsbuild/plugin-node-polyfill',
  '@rsbuild/plugin-react',
  '@rsbuild/plugin-svgr',
  'nock',
  'vitest-websocket-mock',
  'cross-env',
  'fake-indexeddb',
  'lint-staged',
  'openapi-types',
  'resize-observer-polyfill',
  'vitest-canvas-mock',
];

const yargs = require('yargs/yargs');
const fs = require('fs-extra');
const headlampPluginPkg = require('./package.json');
const frontendPkg = require('../../frontend/package.json');

/**
 * Update dependencies from frontend/package.json into headlamp-plugin/packages.json
 *
 * Because frontend/ isn't distributed as a package, we can't just depend on it.
 *
 * @param packageJsonPath {string} where the package.json is
 * @param checkOnly {boolean} if true only do a check, do not
 * @rtype {boolean}
 * @returns 1 if something changed, 0 if nothing changed.
 */
function updateDependencies(packageJsonPath, checkOnly) {
  const allFrontendDependencies = {
    ...frontendPkg.dependencies,
    ...frontendPkg.devDependencies,
  };
  const newDependencies = {
    ...allFrontendDependencies,
    ...headlampPluginPkg.dependencies,
  };
  const headlampPluginPkgOriginal = { ...headlampPluginPkg };

  const sortedDependencies = {};
  Object.keys(newDependencies)
    .sort()
    .forEach(function (key) {
      sortedDependencies[key] = newDependencies[key];
    });

  // @ts-ignore because, the keys change in the dependencies.
  headlampPluginPkg.dependencies = sortedDependencies;

  // Some dependencies from frontend/ aren't wanted.
  for (const packageName of dependenciesToNotCopy) {
    delete headlampPluginPkg.dependencies[packageName];
  }

  // Check if dependenciesFrontDoesNotHave are also present here
  {
    const staleDeps = [];
    for (const packageName of dependenciesFrontDoesNotHave) {
      if (headlampPluginPkg.dependencies[packageName] === undefined) {
        staleDeps.push(packageName);
      }
    }
    if (staleDeps.length > 0) {
      console.log(
        `\nSTALE Dependencies. Both headlamp-plugin and front doesn't have them.\nRemove them from dependenciesFrontDoesNotHave in dedendencies-sync.js:\n`,
        staleDeps
      );
    }
  }

  // We want to find if packages are removed from frontend/package.json too.
  function checkRemovedDependencies(checkOnly) {
    // Are any in the output which aren't in the input anymore?
    function keysFromANotInB(a, b) {
      return Object.keys(a).filter(k => !(k in b));
    }

    const notIn = keysFromANotInB(headlampPluginPkg.dependencies, allFrontendDependencies).filter(
      k => !dependenciesFrontDoesNotHave.has(k)
    );

    for (const packageName of notIn) {
      delete headlampPluginPkg.dependencies[packageName];
    }

    if (notIn.length > 0) {
      if (checkOnly) {
        console.log(
          '\nDependencies REMOVED from frontend/ and should also be removed from headlamp-plugin/',
          notIn
        );
      } else {
        console.warn(
          '\nDependencies REMOVED from frontend/ and now also from headlamp-plugin/',
          notIn
        );
      }
      console.warn(
        'If you want to add these dependencies to headlamp-plugin, ' +
          'please add them to the dependenciesFrontDoesNotHave list inside dependencies-sync.js'
      );
    }
  }

  /**
   * The new dependencies which were added from frontend/ to headlamp-plugin/
   */
  function checkAddedDependencies(dependencies, dependenciesOriginal) {
    function keysFromANotInB(a, b) {
      return Object.keys(a).filter(k => !(k in b));
    }

    const notIn = keysFromANotInB(dependencies, dependenciesOriginal);

    if (notIn.length > 0) {
      console.log(
        'Dependencies ADDED to headlamp-plugin/package.json from frontend/package.json',
        notIn
      );
      console.warn(
        'If you want to prevent adding these dependencies to headlamp-plugin, ' +
          'please add them to the dependenciesToNotCopy list inside dependencies-sync.js'
      );
    }
  }

  /**
   * Check if the versions match, and if not sync the ones from frontend/ to headlamp-plugin/.
   *
   * @param dependencies {object} the dependencies from headlamp-plugin/package.json
   * @param dependenciesFront {object} the dependencies from frontend/package.json
   */
  function checkDependencyVersions(dependencies, dependenciesFront) {
    const changed = [];

    for (const [key, value] of Object.entries(dependencies)) {
      if (dependenciesFront[key] !== undefined && dependenciesFront[key] !== value) {
        changed.push({ name: key, frontend: dependenciesFront[key], headlampPlugin: value });
        dependencies[key] = dependenciesFront[key];
      }
    }

    if (changed.length > 0) {
      console.warn(
        'Dependencies with changed versions in headlamp-plugin/package.json from frontend/package.json',
        changed
      );
    }
  }

  checkRemovedDependencies(checkOnly);
  checkAddedDependencies(headlampPluginPkg.dependencies, headlampPluginPkgOriginal.dependencies);
  checkDependencyVersions(headlampPluginPkg.dependencies, allFrontendDependencies);

  const changed = JSON.stringify(headlampPluginPkgOriginal) !== JSON.stringify(headlampPluginPkg);

  if (checkOnly) {
    if (changed) {
      console.log('\nSome frontend/package.json dependencies changed.');
      console.log('Please run "npm run update-dependencies" to sync dependencies from frontend/.');
      return 1;
    } else {
      return 0;
    }
  }

  if (changed) {
    console.log(
      'Some frontend/package.json dependencies changed. Writing headlamp-plugin/package.json'
    );
    fs.writeFileSync(packageJsonPath, JSON.stringify(headlampPluginPkg, null, '  ') + '\n');
    return 1;
  } else {
    console.warn(
      'No frontend/package.json dependencies changed. Not writing headlamp-plugin/package.json'
    );
    return 0;
  }
}

/**
 * Update dependencies from frontend/package.json in headlamp-plugin/package.json
 *
 * @rtype {number}
 * @returns A return code, 0 if there is no problem, 1 if there is.
 */
function update() {
  updateDependencies('package.json', false);
  return 0;
}

/**
 * Check if dependencies changed
 *
 * @rtype {number}
 * @returns A return code, 1 if some do need updating, 0 if they don't
 */
function check() {
  return updateDependencies('package.json', true);
}

yargs(process.argv.slice(2))
  .command('check', 'Check if dependency updates are needed from frontend/package.json', {}, () => {
    process.exitCode = check();
  })
  .command(
    'update',
    'Update dependencies from frontend/package.json in headlamp-plugin/package.json',
    {},
    () => {
      process.exitCode = update();
    }
  )
  .demandCommand(1, '')
  .strict()
  .help().argv;
