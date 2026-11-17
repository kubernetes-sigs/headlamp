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

import { createRequire } from 'node:module';
import base from './vite.config.mjs';

const require = createRequire(import.meta.url);
const { normalizeTestConfiguration } = require('../bin/test-config.js');
const input = process.env.HEADLAMP_TEST_CONFIGURATION;
if (input === undefined) {
  throw new Error('Run tests through headlamp-plugin test.');
}
const options = normalizeTestConfiguration(JSON.parse(input));

export default {
  ...base,
  test: {
    ...base.test,
    include: options.include,
    exclude: options.exclude,
    environment: options.environment === 'dom' ? 'jsdom' : 'node',
  },
};
