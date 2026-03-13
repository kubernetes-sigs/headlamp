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

/**
 * Add or update query parameters in the URL using the history API.
 *
 * @param queryObj - The query parameters to add/update
 * @param queryParamDefaultObj - Default values to compare against (removes params that match defaults)
 * @param history - The history object from react-router
 * @param location - The location object from react-router
 * @param tableName - Optional table name to add to query string
 */
export function addQueryParams(
  queryObj: { [key: string]: string },
  queryParamDefaultObj: { [key: string]: string } = {},
  history: any,
  location: any,
  tableName = ''
) {
  const pathname = location.pathname;
  const searchParams = new URLSearchParams(location.search);

  if (tableName) {
    searchParams.set('tableName', tableName);
  }

  // Ensure that default values will not show up in the URL
  for (const key in queryObj) {
    const value = queryObj[key];
    if (value !== queryParamDefaultObj[key]) {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
  }

  history.push({
    pathname: pathname,
    search: searchParams.toString(),
  });
}

/**
 * Get a single filter value from the URL as a string.
 *
 * @param key - The query parameter name
 * @param location - The location object from react-router
 * @returns The filter value as a string, or empty string if not found
 */
export function getFilterValueFromURL(key: string, location: any): string {
  const searchParams = new URLSearchParams(location.search);
  return searchParams.get(key) || '';
}

/**
 * Get a filter value from the URL as an array of strings (space-separated).
 *
 * @param key - The query parameter name
 * @param location - The location object from react-router
 * @returns The filter value as an array of strings
 */
export function getFilterValuesFromURL(key: string, location: any): string[] {
  const searchParams = new URLSearchParams(location.search);
  const filterValue = searchParams.get(key);
  if (!filterValue) {
    return [];
  }
  return filterValue.split(' ');
}
