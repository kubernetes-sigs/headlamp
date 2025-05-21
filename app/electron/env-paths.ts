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

import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

/*
From https://github.com/sindresorhus/env-paths

MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const homedir = os.homedir();
const tmpdir = os.tmpdir();
const { env } = process;

const macos = name => {
  const library = path.join(homedir, 'Library');

  return {
    data: path.join(library, 'Application Support', name),
    config: path.join(library, 'Preferences', name),
    cache: path.join(library, 'Caches', name),
    log: path.join(library, 'Logs', name),
    temp: path.join(tmpdir, name),
  };
};

const windows = name => {
  const appData = env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
  const localAppData = env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');

  return {
    // Data/config/cache/log are invented by me as Windows isn't opinionated about this
    data: path.join(localAppData, name, 'Data'),
    config: path.join(appData, name, 'Config'),
    cache: path.join(localAppData, name, 'Cache'),
    log: path.join(localAppData, name, 'Log'),
    temp: path.join(tmpdir, name),
  };
};

// https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
const linux = name => {
  const username = path.basename(homedir);

  return {
    data: path.join(env.XDG_DATA_HOME || path.join(homedir, '.local', 'share'), name),
    config: path.join(env.XDG_CONFIG_HOME || path.join(homedir, '.config'), name),
    cache: path.join(env.XDG_CACHE_HOME || path.join(homedir, '.cache'), name),
    // https://wiki.debian.org/XDGBaseDirectorySpecification#state
    log: path.join(env.XDG_STATE_HOME || path.join(homedir, '.local', 'state'), name),
    temp: path.join(tmpdir, username, name),
  };
};

export default function envPaths(name, { suffix = 'nodejs' } = {}) {
  if (typeof name !== 'string') {
    throw new TypeError(`Expected a string, got ${typeof name}`);
  }

  // Add suffix to prevent possible conflict with native apps
  const theName = suffix ? `${name}-${suffix}` : name;

  if (process.platform === 'darwin') {
    return macos(theName);
  }

  if (process.platform === 'win32') {
    return windows(theName);
  }

  return linux(theName);
}
