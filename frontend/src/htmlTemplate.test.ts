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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('HTML template', () => {
  it('leaves the title empty until the backend inserts the product name', () => {
    const template = readFileSync(resolve('index.html'), 'utf8');
    const document = new DOMParser().parseFromString(template, 'text/html');

    expect(template).toContain('<title data-headlamp-product-name></title>');
    expect(document.title).toBe('');
  });
});
