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
 * Converts a Kubernetes LabelSelector to its query-string representation.
 *
 * @param labelSelector - Label selector to serialize.
 * @returns A comma-separated selector accepted by Kubernetes list APIs.
 */
export function labelSelectorToQuery(labelSelector: LabelSelector) {
  const segments: string[] = [];

  segments.push(...(matchLabelsSimplifier(labelSelector.matchLabels, true) || []));
  segments.push(...matchExpressionSimplifier(labelSelector.matchExpressions ?? []));

  return segments.join(',');
}

/**
 * Simplifies a matchLabels object into an array of string expressions.
 *
 * @param matchLabels - The matchLabels object from a LabelSelector.
 * @param isEqualSeparator - Whether to use "=" instead of ": ".
 * @returns Simplified label strings, or an empty string.
 */
export function matchLabelsSimplifier(
  matchLabels: LabelSelector['matchLabels'],
  isEqualSeparator = false
): string[] | '' {
  if (!matchLabels) {
    return '';
  }

  const segments: string[] = [];
  for (const key in matchLabels) {
    segments.push(`${key}${isEqualSeparator ? '=' : ': '}${matchLabels[key]}`);
  }

  return segments;
}

/**
 * Simplifies matchExpressions into Kubernetes selector requirements.
 *
 * @param matchExpressions - The matchExpressions array from a LabelSelector.
 * @returns Simplified selector requirements, or an empty string.
 */
export function matchExpressionSimplifier(
  matchExpressions: LabelSelector['matchExpressions']
): string[] | '' {
  if (!matchExpressions) {
    return '';
  }

  const segments: string[] = [];
  for (const expression of matchExpressions) {
    let segment = expression.operator === 'DoesNotExist' ? '!' : '';
    let needsParensWrap = false;
    const noLengthLimits = -1;
    let expectedValuesLength = noLengthLimits;

    segment += expression.key;
    switch (expression.operator) {
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
      values = expression.values[0] ?? '';
    } else if (expectedValuesLength === noLengthLimits) {
      values = [...(expression.values ?? [])].sort().join(',');
      if (needsParensWrap) {
        values = `(${values})`;
      }
    }

    segments.push(segment + values);
  }

  return segments;
}
