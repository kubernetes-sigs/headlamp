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

import { omit } from 'lodash';
import { QueryParameters } from './queryParameters';

export function buildUrl(urlOrParts: string | string[], queryParams?: QueryParameters): string {
  const url = Array.isArray(urlOrParts) ? urlOrParts.filter(Boolean).join('/') : urlOrParts;
  return url + asQuery(queryParams);
}

/**
 * Combines a base path and a path to create a full path.
 *
 * Doesn't matter if the start or the end has a single slash, the result will always have a single slash.
 *
 * @param base - The base path.
 * @param path - The path to combine with the base path.
 *
 * @returns The combined path.
 */
export function combinePath(base: string, path: string): string {
  if (base.endsWith('/')) base = base.slice(0, -1); // eslint-disable-line no-param-reassign
  if (path.startsWith('/')) path = path.slice(1); // eslint-disable-line no-param-reassign
  return `${base}/${path}`;
}

export function getApiRoot(group: string, version: string) {
  return group ? `/apis/${group}/${version}` : `api/${version}`;
}

/**
 * Converts k8s queryParams to a URL query string.
 *
 * @param queryParams - The k8s API query parameters to convert.
 * @returns The query string (starting with '?'), or empty string.
 */
export function asQuery(queryParams?: QueryParameters): string {
  if (queryParams === undefined) {
    return '';
  }

  let newQueryParams;
  if (typeof queryParams.limit === 'number' || typeof queryParams.limit === 'string') {
    newQueryParams = {
      ...queryParams,
      limit:
        typeof queryParams.limit === 'number' ? queryParams.limit.toString() : queryParams.limit,
    };
  } else {
    newQueryParams = { ...omit(queryParams, 'limit') };
  }

  return !!newQueryParams && !!Object.keys(newQueryParams).length
    ? '?' + new URLSearchParams(newQueryParams).toString()
    : '';
}
