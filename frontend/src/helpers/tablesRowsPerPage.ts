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

const tablesRowsPerPageKey = 'tables_rows_per_page';
export const minTablesRowsPerPage = 5;
export const maxTablesRowsPerPage = 1000;

export function parseTablesRowsPerPage(value: string): number | null {
  const trimmedValue = value.trim();
  if (!trimmedValue || !/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const rowsPerPage = Number(trimmedValue);
  if (
    !Number.isSafeInteger(rowsPerPage) ||
    rowsPerPage < minTablesRowsPerPage ||
    rowsPerPage > maxTablesRowsPerPage
  ) {
    return null;
  }

  return rowsPerPage;
}

/**
 * Gets the number of rows per page for tables from local storage.
 *
 * @param defaultRowsPerPage - The default number of rows per page if local storage is empty or invalid.
 * @returns {number} - The number of rows per page.
 * If not set or invalid, returns the default value.
 */
export function getTablesRowsPerPage(defaultRowsPerPage: number = minTablesRowsPerPage) {
  const perPageStr = localStorage.getItem(tablesRowsPerPageKey);
  if (!perPageStr) {
    return defaultRowsPerPage;
  }

  return parseTablesRowsPerPage(perPageStr) ?? defaultRowsPerPage;
}

/**
 * Sets the number of rows per page for tables in local storage.
 *
 * @param perPage - The number of rows per page.
 * @returns {void}
 */
export function setTablesRowsPerPage(perPage: number) {
  localStorage.setItem(tablesRowsPerPageKey, perPage.toString());
}
