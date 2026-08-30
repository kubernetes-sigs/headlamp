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

const labelNamePattern = /^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/;
const dnsLabelPattern = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/;
const maxInt64 = '9223372036854775807';

/**
 * Checks whether a value satisfies Kubernetes label name constraints.
 *
 * @param value - Label name or value to check.
 * @param allowEmpty - Whether to accept the empty value allowed by selector syntax.
 * @returns Whether the value is a valid Kubernetes label name.
 */
function isValidLabelName(value: string, allowEmpty = false): boolean {
  if (value.length === 0) {
    return allowEmpty;
  }

  return value.length <= 63 && labelNamePattern.test(value);
}

/**
 * Checks a label key, including its optional DNS subdomain prefix.
 *
 * @param key - Kubernetes label key to check.
 * @returns Whether the key has a valid prefix and name.
 */
function isValidLabelKey(key: string): boolean {
  const parts = key.split('/');
  if (parts.length > 2 || !isValidLabelName(parts.at(-1) || '')) {
    return false;
  }

  if (parts.length === 1) {
    return true;
  }

  const prefix = parts[0];
  return (
    prefix.length <= 253 &&
    prefix.split('.').every(segment => segment.length <= 63 && dnsLabelPattern.test(segment))
  );
}

/**
 * Checks whether a comparison operand is an unsigned decimal within int64 range.
 *
 * Kubernetes accepts only int64 values for greater-than and less-than selectors.
 *
 * @param value - Comparison operand to check.
 * @returns Whether the value can be parsed as a non-negative signed 64-bit integer.
 */
function isValidComparisonValue(value: string): boolean {
  if (!/^\d+$/.test(value)) {
    return false;
  }

  const normalizedValue = value.replace(/^0+/, '') || '0';
  return (
    normalizedValue.length < maxInt64.length ||
    (normalizedValue.length === maxInt64.length && normalizedValue <= maxInt64)
  );
}

/**
 * Splits a selector into comma-separated requirements without splitting value sets.
 *
 * @param selector - Kubernetes label selector to split.
 * @returns Trimmed requirements, or `null` when parentheses are unbalanced.
 */
function splitRequirements(selector: string): string[] | null {
  const requirements: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < selector.length; index += 1) {
    if (selector[index] === '(') {
      depth += 1;
    } else if (selector[index] === ')') {
      depth -= 1;
      if (depth < 0) {
        return null;
      }
    } else if (selector[index] === ',' && depth === 0) {
      requirements.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }

  if (depth !== 0) {
    return null;
  }

  requirements.push(selector.slice(start).trim());
  return requirements;
}

/**
 * Validates Kubernetes label selector syntax accepted by list and watch APIs.
 *
 * @see https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#label-selectors
 * @see https://pkg.go.dev/k8s.io/apimachinery/pkg/labels#Parse
 * @param selector - Selector text to validate.
 * @returns An error message, or `null` when the selector is valid.
 */
export function validateLabelSelector(selector: string): string | null {
  const trimmedSelector = selector.trim();
  if (!trimmedSelector) {
    return null;
  }

  const requirements = splitRequirements(trimmedSelector);
  if (!requirements) {
    return 'parentheses must be balanced';
  }

  for (const requirement of requirements) {
    if (!requirement) {
      return 'requirements must not be empty';
    }

    const setMatch = requirement.match(/^(.+?)\s+(in|notin)\s*\((.*)\)$/);
    if (setMatch) {
      const [, key, , rawValues] = setMatch;
      if (!isValidLabelKey(key.trim())) {
        return `invalid label key "${key.trim()}"`;
      }

      const values = rawValues.split(',').map(value => value.trim());
      if (values.some(value => !isValidLabelName(value, true))) {
        return 'set-based selectors require valid values';
      }
      continue;
    }

    const equalityMatch = requirement.match(/^(.+?)(!=|==|=)(.*)$/);
    if (equalityMatch) {
      const [, key, , value] = equalityMatch;
      if (!isValidLabelKey(key.trim())) {
        return `invalid label key "${key.trim()}"`;
      }
      if (!isValidLabelName(value.trim(), true)) {
        return `invalid label value "${value.trim()}"`;
      }
      continue;
    }

    const comparisonMatch = requirement.match(/^(.+?)(>|<)(.*)$/);
    if (comparisonMatch) {
      const [, key, , value] = comparisonMatch;
      if (!isValidLabelKey(key.trim())) {
        return `invalid label key "${key.trim()}"`;
      }
      if (!isValidComparisonValue(value.trim())) {
        return 'greater-than and less-than selectors require an integer value';
      }
      continue;
    }

    const isNonExistence = requirement.startsWith('!');
    const key = isNonExistence ? requirement.slice(1).trim() : requirement;
    if (!isValidLabelKey(key)) {
      return `invalid requirement "${requirement}"`;
    }
  }

  return null;
}
