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

import { JSONPath } from 'jsonpath-plus';
import { localeDate } from '../../lib/util';

function getValueWithJSONPath(item: { jsonData: object }, jsonPath: string): string {
  let value: string | undefined;
  try {
    // Extract the value from the json item
    value = JSONPath({ path: '$' + jsonPath, json: item.jsonData });
  } catch (err) {
    console.error(`Failed to get value from JSONPath ${jsonPath} on CR item ${item}`);
  }

  // Make sure the value will be represented in string form (to account for
  // e.g. cases where we may get an array).
  return value?.toString() || '';
}

/**
 * Returns the display value of an additionalPrinterColumn for a resource.
 * Date columns are formatted as a locale date, but only when the field is set;
 * a missing field is shown as empty instead of "Invalid Date".
 */
export function getPrinterColumnValue(
  item: { jsonData: object },
  colSpec: { jsonPath: string; type?: string }
): string {
  const value = getValueWithJSONPath(item, colSpec.jsonPath);
  if (colSpec.type === 'date' && value) {
    return localeDate(new Date(value));
  }
  return value;
}
