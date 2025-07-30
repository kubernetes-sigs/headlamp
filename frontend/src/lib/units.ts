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

/*
 * This module was taken from the k8dash project.
 */
import _, { round } from 'lodash';

export type K8sResource = {
  value: number;
  unit: string;
};

const BINARY_SUFFIXES = new Map<string, number>([
  ['', 1],
  ['Ki', Math.pow(2, 10)],
  ['Mi', Math.pow(2, 20)],
  ['Gi', Math.pow(2, 30)],
  ['Ti', Math.pow(2, 40)],
  ['Pi', Math.pow(2, 50)],
  ['Ei', Math.pow(2, 60)],
]);

const DECIMAL_SUFFIXES = new Map<string, number>([
  ['', 1],
  ['k', Math.pow(10, 3)],
  ['K', Math.pow(10, 3)],
  ['M', Math.pow(10, 6)],
  ['G', Math.pow(10, 9)],
  ['T', Math.pow(10, 12)],
  ['P', Math.pow(10, 15)],
  ['E', Math.pow(10, 18)],
]);

const CPU_SUFFIXES = new Map<string, number>([
  ['n', 1e-9],
  ['u', 1e-6],
  ['m', 1e-3],
  ['', 1],
]);

function parseK8sResource(value: string): number {
  if (!value) return 0;

  const match = value.match(/^([\d.]+(?:e[+-]?\d+)?)([KMGTPE]i?|[kKMGTPE]?)$/i);
  if (!match) throw new Error('Invalid resource quantity format');

  const [, num, suffix] = match;
  const quantity = parseFloat(num);

  if (isNaN(quantity)) throw new Error('Invalid number format');

  const multiplier = BINARY_SUFFIXES.get(suffix) || DECIMAL_SUFFIXES.get(suffix);
  if (multiplier === undefined) throw new Error('Invalid suffix');

  return quantity * multiplier;
}

function parseDiskSpace(value: string): number {
  return parseK8sResource(value);
}

function parseRam(value: string): number {
  return parseK8sResource(value);
}

function unparseRam(value: number, decimals: number = 1): K8sResource {
  let unit = '';
  for (const [suffix, multiplier] of [...BINARY_SUFFIXES.entries()].reverse()) {
    if (value >= multiplier) {
      value /= multiplier;
      unit = suffix;
      break;
    }
  }

  return {
    value: _.round(value, decimals),
    unit,
  };
}

function parseCpu(value: string): number {
  if (!value) return 0;

  const match = value.match(/^([\d.]+)([num]?)$/);
  if (!match) throw new Error('Invalid CPU quantity format');

  const [, num, suffix] = match;
  const quantity = parseFloat(num);

  if (suffix && CPU_SUFFIXES.has(suffix)) {
    return quantity * (CPU_SUFFIXES.get(suffix) as number);
  }

  return quantity;
}

function unparseCpu(value: number, decimals: number = 3): K8sResource {
  let numericValue = value;
  let unit = '';

  for (const [suffix, multiplier] of [...CPU_SUFFIXES.entries()].reverse()) {
    if (numericValue >= multiplier) {
      numericValue /= multiplier;
      unit = suffix;
      break;
    }
  }

  return {
    value: _.round(numericValue, decimals),
    unit,
  };
}

function divideK8sResources(a: string, b: string): number {
  return parseK8sResource(a) / parseK8sResource(b);
}

// Helper function to determine the appropriate suffix and multiplier
function getSuffixAndMultiplier(
  value: number,
  unitType: string,
  suffixes: Map<string, number>
): { suffix: string; multiplier: number } {
  let suffix = unitType;
  let multiplier = suffixes.get(unitType) || 1;

  for (const [currentSuffix, currentMultiplier] of suffixes.entries()) {
    if (value / currentMultiplier < 1) {
      break;
    }
    multiplier = currentMultiplier;
    suffix = currentSuffix;
  }

  return { suffix, multiplier };
}

function formatMetricValueUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
  decimals: number = 1
): string {
  // If no conversion is needed
  if (fromUnit === toUnit) {
    return `${value}${fromUnit}`;
    // Comparison with zero
  } else if (Math.abs(value) < Number.EPSILON) {
    return `${value}`;
  }

  // Determine fromMultiplier
  const fromMultiplier = BINARY_SUFFIXES.get(fromUnit) || DECIMAL_SUFFIXES.get(fromUnit) || 1;
  if (!fromMultiplier) throw new Error('Invalid fromUnit');

  // Determine toSuffix and toMultiplier based on the target unit
  let toSuffix = toUnit;
  let toMultiplier: number | undefined;

  switch (toUnit) {
    case 'binary':
      ({ suffix: toSuffix, multiplier: toMultiplier } = getSuffixAndMultiplier(
        value * fromMultiplier,
        toUnit,
        BINARY_SUFFIXES
      ));
      break;
    case 'decimal':
      ({ suffix: toSuffix, multiplier: toMultiplier } = getSuffixAndMultiplier(
        value * fromMultiplier,
        toUnit,
        DECIMAL_SUFFIXES
      ));
      break;
    case 'cpu':
      ({ suffix: toSuffix, multiplier: toMultiplier } = getSuffixAndMultiplier(
        value * fromMultiplier,
        toUnit,
        CPU_SUFFIXES
      ));
      break;
    default:
      toMultiplier = BINARY_SUFFIXES.get(toUnit) || DECIMAL_SUFFIXES.get(toUnit);
      if (!toMultiplier) throw new Error('Invalid toUnit');
      break;
  }

  // Perform the conversion and rounding
  const result = round((value * fromMultiplier) / toMultiplier, decimals);
  return `${result}${toSuffix}`;
}

export {
  parseDiskSpace,
  parseRam,
  unparseRam,
  parseCpu,
  unparseCpu,
  divideK8sResources,
  formatMetricValueUnit,
};
