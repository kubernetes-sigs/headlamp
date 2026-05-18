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

import { getTablesRowsPerPage, setTablesRowsPerPage } from './tablesRowsPerPage';

describe('getTablesRowsPerPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default when localStorage is empty', () => {
    expect(getTablesRowsPerPage(15)).toBe(15);
  });

  it('returns the stored value when localStorage holds a valid number', () => {
    setTablesRowsPerPage(25);
    expect(getTablesRowsPerPage(15)).toBe(25);
  });

  it('returns the default when localStorage contains a non-numeric string', () => {
    localStorage.setItem('tables_rows_per_page', 'not-a-number');
    expect(getTablesRowsPerPage(15)).toBe(15);
  });

  it('returns the default when localStorage contains an empty string', () => {
    localStorage.setItem('tables_rows_per_page', '');
    expect(getTablesRowsPerPage(15)).toBe(15);
  });

  it('returns the parsed integer when localStorage contains a partial numeric string like "12abc"', () => {
    localStorage.setItem('tables_rows_per_page', '12abc');
    // parseInt('12abc') === 12, which is a valid integer
    const result = getTablesRowsPerPage(15);
    expect(result).toBe(12);

    const options = [15, 25, 50];
    // 12 is a valid integer but NOT in options — callers must clamp to options
    expect(options.includes(result)).toBe(false);
  });
});
