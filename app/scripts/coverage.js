/*
 * Copyright 2026 The Kubernetes Authors
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

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { createInstrumenter } = require('istanbul-lib-instrument');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createSourceMapStore } = require('istanbul-lib-source-maps');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const sourceRoot = fs.realpathSync(path.resolve(__dirname, '../electron'));
const coverageVariable = '__headlampCoverage__';

function isRuntimeSource(file) {
  const relative = path.relative(sourceRoot, file);
  return (
    !relative.startsWith('..') &&
    !path.isAbsolute(relative) &&
    /\.[jt]s$/.test(relative) &&
    !/\.(test|d)\.[jt]s$/.test(relative)
  );
}

/**
 * @param {string} source
 * @param {string} filename
 */
async function instrumentCode(source, filename) {
  const transformed = await esbuild.transform(source, {
    loader: filename.endsWith('.ts') ? 'ts' : 'js',
    sourcefile: filename,
    sourcemap: 'external',
    sourcesContent: false,
    target: 'node20',
  });
  const instrumenter = createInstrumenter({
    coverageVariable,
    coverageGlobalScope: 'globalThis',
    coverageGlobalScopeFunc: false,
    esModules: true,
    compact: false,
    produceSourceMap: true,
  });
  const code = instrumenter.instrumentSync(transformed.code, filename, JSON.parse(transformed.map));
  const map = Buffer.from(JSON.stringify(instrumenter.lastSourceMap())).toString('base64');
  return `${code}\n//# sourceMappingURL=data:application/json;base64,${map}`;
}

function createCoveragePlugin() {
  return {
    name: 'desktop-test-coverage',
    setup(build) {
      build.onLoad({ filter: /\.[jt]s$/ }, async args => {
        if (!isRuntimeSource(args.path)) return;
        return {
          contents: await instrumentCode(await fs.promises.readFile(args.path, 'utf8'), args.path),
          loader: 'js',
        };
      });
    },
  };
}

function runtimeCoverage(map) {
  const result = createCoverageMap({});
  for (const file of map.files()) {
    if (isRuntimeSource(file)) {
      result.addFileCoverage({
        ...map.fileCoverageFor(file).toJSON(),
        path: fs.realpathSync(file),
      });
    }
  }
  return result;
}

async function mergeCoverage(unitFile, rawDirectory, reportDirectory) {
  const readCoverage = file =>
    JSON.parse(fs.readFileSync(file, 'utf8'), (key, value) =>
      // Source-map line ends use Infinity, which JSON serializes as null.
      key === 'column' && value === null ? Infinity : value
    );
  const unit = runtimeCoverage(createCoverageMap(readCoverage(unitFile)));
  const e2e = createCoverageMap({});
  const files = fs
    .readdirSync(rawDirectory)
    .filter(file => file.endsWith('.json'))
    .sort();
  if (files.length === 0) throw new Error('Electron produced no E2E coverage snapshots.');
  const statusDirectory = `${rawDirectory}-status`;
  const statuses = fs.readdirSync(statusDirectory);
  if (
    statuses.length === 0 ||
    statuses.some(file => fs.readFileSync(path.join(statusDirectory, file), 'utf8') !== 'complete')
  ) {
    throw new Error('Electron coverage collection failed or did not finish.');
  }
  for (const file of files) {
    e2e.merge(readCoverage(path.join(rawDirectory, file)));
  }

  const sourceMaps = createSourceMapStore();
  try {
    const remapped = runtimeCoverage(await sourceMaps.transformCoverage(e2e));
    for (const entry of ['main.ts', 'preload.ts']) {
      const file = path.join(sourceRoot, entry);
      if (
        !remapped.files().includes(file) ||
        !Object.values(remapped.fileCoverageFor(file).s).some(count => count > 0)
      ) {
        throw new Error(`Missing E2E coverage for electron/${entry}; run a real app launch spec.`);
      }
    }

    for (const file of remapped.files()) {
      if (!unit.files().includes(file)) {
        throw new Error(`Unit coverage did not include ${file}.`);
      }
      const locations = new Set(
        Object.values(unit.fileCoverageFor(file).statementMap).map(location =>
          JSON.stringify(location)
        )
      );
      if (
        Object.values(remapped.fileCoverageFor(file).statementMap).some(
          location => !locations.has(JSON.stringify(location))
        )
      ) {
        throw new Error(`Cannot merge incompatible statement maps for ${file}.`);
      }
    }
    unit.merge(remapped);
    const context = createContext({ dir: reportDirectory, coverageMap: unit });
    for (const reporter of ['json', 'json-summary', 'html']) {
      reports.create(reporter).execute(context);
    }
    return unit.getCoverageSummary().toJSON();
  } finally {
    sourceMaps.dispose();
  }
}

module.exports = { createCoveragePlugin, instrumentCode, mergeCoverage };
