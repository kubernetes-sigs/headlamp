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

import type { LabelSelector } from './cluster';

/**
 * Simplifies a matchLabels object into an array of string expressions.
 *
 * @param matchLabels - the matchLabels object from a LabelSelector.
 * @param isEqualSeperator - whether to use "=" as the separator instead of ":".
 * @returns an array of simplified label strings, or an empty string.
 */
export function matchLabelsSimplifier(
  matchLabels: LabelSelector['matchLabels'],
  isEqualSeperator = false
): string[] | '' {
  if (!matchLabels) {
    return '';
  }

  const segments: string[] = [];
  for (const k in matchLabels) {
    if (isEqualSeperator) {
      segments.push(`${k}=${matchLabels[k]}`);
      continue;
    }
    segments.push(`${k}: ${matchLabels[k]}`);
  }

  return segments;
}

/**
 * Simplifies a matchExpressions array into an array of string representations.
 *
 * @param matchExpressions - the matchExpressionss array from a LabelSelector.
 * @returns an array of simplified expression strings, or an empty string.
 */
export function matchExpressionSimplifier(
  matchExpressions: LabelSelector['matchExpressions']
): string[] | '' {
  if (!matchExpressions) {
    return '';
  }

  const segments: string[] = [];
  for (const expr of matchExpressions) {
    let segment = '';
    if (expr.operator === 'DoesNotExist') {
      segment += '!';
    }

    let needsParensWrap = false;
    const NoLengthLimits = -1;
    let expectedValuesLength = NoLengthLimits;

    segment += expr.key;
    switch (expr.operator) {
      case 'Equals':
        segment += '=';
        expectedValuesLength = 1;
        break;
      case 'DoubleEquals':
        segment += '==';
        expectedValuesLength = 1;
        break;
      case 'NotEquals':
        segment += '!=';
        expectedValuesLength = 1;
        break;
      case 'In':
        segment += ' in ';
        needsParensWrap = true;
        break;
      case 'NotIn':
        segment += ' notin ';
        needsParensWrap = true;
        break;
      case 'GreaterThan':
        segment += '>';
        expectedValuesLength = 1;
        break;
      case 'LessThan':
        segment += '<';
        expectedValuesLength = 1;
        break;
      case 'Exists':
      case 'DoesNotExist':
        expectedValuesLength = 0;
        break;
    }

    let values = '';

    if (expectedValuesLength === 1) {
      values = expr.values[0] ?? '';
    } else if (expectedValuesLength === NoLengthLimits) {
      values = [...(expr.values ?? [])].sort().join(',');
      if (needsParensWrap) {
        values = '(' + values + ')';
      }
    }

    segment += values;
    segments.push(segment);
  }

  return segments;
}
