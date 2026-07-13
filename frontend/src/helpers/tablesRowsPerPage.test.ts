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

import { getTablesRowsPerPage, parseTablesRowsPerPage } from './tablesRowsPerPage';

describe('parseTablesRowsPerPage', () => {
  test('accepts whole numbers', () => {
    expect(parseTablesRowsPerPage('10')).toBe(10);
  });

  test('accepts values at the row count bounds', () => {
    expect(parseTablesRowsPerPage('5')).toBe(5);
    expect(parseTablesRowsPerPage('1000')).toBe(1000);
  });

  test('rejects decimal values', () => {
    expect(parseTablesRowsPerPage('10.5')).toBeNull();
  });

  test('rejects non-numeric values', () => {
    expect(parseTablesRowsPerPage('abc')).toBeNull();
  });

  test('rejects partially numeric values', () => {
    expect(parseTablesRowsPerPage('12abc')).toBeNull();
  });

  test('rejects values below the minimum', () => {
    expect(parseTablesRowsPerPage('0')).toBeNull();
    expect(parseTablesRowsPerPage('4')).toBeNull();
  });

  test('rejects values above the maximum', () => {
    expect(parseTablesRowsPerPage('1001')).toBeNull();
  });

  test('rejects unsafe integers', () => {
    expect(parseTablesRowsPerPage('9007199254740992')).toBeNull();
  });
});

describe('getTablesRowsPerPage', () => {
  afterEach(() => {
    localStorage.clear();
  });

  test('returns the default value when stored value is decimal', () => {
    localStorage.setItem('tables_rows_per_page', '10.5');

    expect(getTablesRowsPerPage(5)).toBe(5);
  });

  test('returns the stored value when it is valid', () => {
    localStorage.setItem('tables_rows_per_page', '10');

    expect(getTablesRowsPerPage(5)).toBe(10);
  });

  test.each(['abc', '12abc', '', ' ', '0', '4', '1001', '9007199254740992'])(
    'returns the default value when stored value is invalid: %s',
    value => {
      localStorage.setItem('tables_rows_per_page', value);

      expect(getTablesRowsPerPage(5)).toBe(5);
    }
  );
});
