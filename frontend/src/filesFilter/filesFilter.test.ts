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

import * as fs from 'fs';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sync } from './filesFilter';

const testDir = path.join(__dirname, 'test-files');

beforeAll(() => {
  // Create test files
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(path.join(testDir, 'file1.tsx'), '');
  fs.writeFileSync(path.join(testDir, 'file2.tsx'), '');
  fs.mkdirSync(path.join(testDir, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(testDir, 'node_modules', 'file3.tsx'), '');
  fs.writeFileSync(path.join(testDir, 'file_old.tsx'), '');
  fs.writeFileSync(path.join(testDir, 'file_empty.tsx'), '');
});

afterAll(() => {
  // Clean up test files
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('filesFilter', () => {
  it('should find all .tsx files excluding node_modules', () => {
    const files = sync('^test-files/.*\\.tsx$', { ignore: /node_modules/ });
    expect(files).toEqual(
      expect.arrayContaining([path.join(testDir, 'file1.tsx'), path.join(testDir, 'file2.tsx')])
    );
  });

  it('should ignore files in the node_modules directory', () => {
    const files = sync('^test-files/.*\\.tsx$', { ignore: /node_modules/ });
    files.forEach(file => {
      expect(file).not.toMatch(/node_modules/);
    });
  });

  it('should ignore files matching any pattern in the ignore array', () => {
    const files = sync('^test-files/.*\\.tsx$', {
      ignore: [/node_modules/, /file_old/, /file_empty/],
    });
    expect(files).toEqual(
      expect.arrayContaining([path.join(testDir, 'file1.tsx'), path.join(testDir, 'file2.tsx')])
    );
    expect(files).not.toEqual(
      expect.arrayContaining([
        path.join(testDir, 'file_old.tsx'),
        path.join(testDir, 'file_empty.tsx'),
      ])
    );
  });
});
