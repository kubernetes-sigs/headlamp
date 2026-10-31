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

/** A single parsed requirement out of a label selector string, e.g. `key in (v1, v2)`. */
type Requirement =
  | { operator: 'equals' | 'notEquals'; key: string; value: string }
  | { operator: 'exists' | 'notExists'; key: string }
  | { operator: 'in' | 'notIn'; key: string; values: string[] };

const KEY_RE = /^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/;
const PREFIX_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const VALUE_RE = /^([A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?)?$/;

/** Validates a label name with an optional DNS subdomain prefix. */
function isValidKey(key: string): boolean {
  const parts = key.split('/');
  if (parts.length > 2) {
    return false;
  }
  const name = parts[parts.length - 1];
  const prefix = parts.length === 2 ? parts[0] : undefined;
  return (
    name.length <= 63 &&
    KEY_RE.test(name) &&
    (prefix === undefined || (prefix.length <= 253 && PREFIX_RE.test(prefix)))
  );
}

/**
 * Splits a selector string on top-level commas, i.e. commas that are not
 * inside a `(...)` set (as used by the `in`/`notin` operators).
 */
function splitRequirements(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of selector) {
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    }
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  if (depth !== 0) {
    throw new Error(`unbalanced parentheses: ${selector}`);
  }
  return parts;
}

/** Parses a single trimmed requirement string, throwing on anything malformed. */
function parseRequirement(raw: string): Requirement {
  const text = raw.trim();
  if (!text) {
    throw new Error('empty requirement');
  }

  if (text.startsWith('!')) {
    const key = text.slice(1).trim();
    if (!isValidKey(key)) {
      throw new Error(`invalid key: ${key}`);
    }
    return { operator: 'notExists', key };
  }

  const setMatch = text.match(/^(.+?)\s+(in|notin)\s*\((.*)\)$/);
  if (setMatch) {
    const key = setMatch[1].trim();
    const operator = setMatch[2] === 'in' ? 'in' : 'notIn';
    // Empty values, including the sole value in (), are valid Kubernetes labels.
    const values = setMatch[3].split(',').map(value => value.trim());
    if (!isValidKey(key) || !values.every(value => VALUE_RE.test(value))) {
      throw new Error(`invalid set requirement: ${text}`);
    }
    return { operator, key, values };
  }

  const notEqualsMatch = text.match(/^(.+?)\s*!=\s*(.*)$/);
  if (notEqualsMatch) {
    const key = notEqualsMatch[1].trim();
    const value = notEqualsMatch[2].trim();
    if (!isValidKey(key) || !VALUE_RE.test(value)) {
      throw new Error(`invalid requirement: ${text}`);
    }
    return { operator: 'notEquals', key, value };
  }

  const equalsMatch = text.match(/^(.+?)\s*==?\s*(.*)$/);
  if (equalsMatch) {
    const key = equalsMatch[1].trim();
    const value = equalsMatch[2].trim();
    if (!isValidKey(key) || !VALUE_RE.test(value)) {
      throw new Error(`invalid requirement: ${text}`);
    }
    return { operator: 'equals', key, value };
  }

  if (!isValidKey(text)) {
    throw new Error(`invalid key: ${text}`);
  }
  return { operator: 'exists', key: text };
}

/** Returns whether `labels` satisfies a single parsed requirement. */
function matchesRequirement(labels: Record<string, string>, requirement: Requirement): boolean {
  switch (requirement.operator) {
    case 'exists':
      return Object.prototype.hasOwnProperty.call(labels, requirement.key);
    case 'notExists':
      return !Object.prototype.hasOwnProperty.call(labels, requirement.key);
    case 'equals':
      return labels[requirement.key] === requirement.value;
    case 'notEquals':
      return labels[requirement.key] !== requirement.value;
    case 'in':
      return (
        Object.prototype.hasOwnProperty.call(labels, requirement.key) &&
        requirement.values.includes(labels[requirement.key])
      );
    case 'notIn':
      return (
        !Object.prototype.hasOwnProperty.call(labels, requirement.key) ||
        !requirement.values.includes(labels[requirement.key])
      );
    default:
      return false;
  }
}

/**
 * Returns true if `labels` satisfies every requirement in the selector string.
 * An empty/blank selector matches everything.
 *
 * Supports the standard Kubernetes label selector grammar: comma-separated
 * requirements ANDed together, using the `=`/`==`, `!=`, bare key (exists),
 * `!key` (does not exist), `in (...)` and `notin (...)` forms. A malformed
 * requirement fails closed (returns false for the whole selector) rather than
 * throwing.
 *
 * @param labels - The labels to test, or undefined if the object has none.
 * @param selector - The label selector string to evaluate (may be undefined/empty).
 * @returns Whether `labels` matches every requirement of `selector`.
 */
export function matchesLabelSelector(
  labels: Record<string, string> | undefined,
  selector: string | undefined
): boolean {
  const trimmedSelector = (selector ?? '').trim();
  if (!trimmedSelector) {
    return true;
  }

  const effectiveLabels = labels ?? {};

  try {
    const requirements = splitRequirements(trimmedSelector).map(parseRequirement);
    return requirements.every(requirement => matchesRequirement(effectiveLabels, requirement));
  } catch {
    // Fail closed on malformed selectors rather than throwing or logging.
    return false;
  }
}
