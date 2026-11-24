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

(() => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { randomUUID } = require('node:crypto');
  const { app, ipcMain } = require('electron');
  const directory = process.env.HEADLAMP_E2E_COVERAGE_DIR;
  if (!directory || !path.isAbsolute(directory)) {
    throw new Error('Instrumented Electron requires an absolute HEADLAMP_E2E_COVERAGE_DIR.');
  }
  fs.mkdirSync(directory, { recursive: true });
  const statusDirectory = `${directory}-status`;
  fs.mkdirSync(statusDirectory, { recursive: true });
  const statusFile = path.join(statusDirectory, `${process.pid}-${randomUUID()}`);
  fs.writeFileSync(statusFile, 'pending');
  let failed = false;

  function write(name, coverage) {
    if (!coverage || typeof coverage !== 'object') {
      throw new Error('Electron coverage counters were not initialized.');
    }
    fs.writeFileSync(path.join(directory, name), JSON.stringify(coverage));
  }

  ipcMain.on('__headlamp_e2e_coverage__', (event, coverage) => {
    try {
      if (coverage !== null) write(`preload-${randomUUID()}.json`, coverage);
      event.returnValue = true;
    } catch (error) {
      failed = true;
      console.error('Failed to save Electron preload coverage:', error);
      event.returnValue = false;
    }
  });
  const flush = () => {
    try {
      write(`main-${process.pid}.json`, globalThis.__headlampCoverage__);
    } catch (error) {
      failed = true;
      console.error('Failed to save Electron main coverage:', error);
    }
  };
  app.on('will-quit', flush);
  process.on('exit', () => {
    flush();
    try {
      fs.writeFileSync(statusFile, failed ? 'failed' : 'complete');
    } catch (error) {
      console.error('Failed to save Electron coverage collection status:', error);
    }
  });
  if (process.platform !== 'win32') {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.once(signal, () => {
        flush();
        if (process.listenerCount(signal) === 0) app.quit();
      });
    }
  }
})();
