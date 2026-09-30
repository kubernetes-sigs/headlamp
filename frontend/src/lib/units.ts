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

import _ from 'lodash';

const RAM_TYPES = ['Bi', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei'];
const UNITS = ['B', 'K', 'M', 'G', 'T', 'P', 'E'];

export const TO_GB = 1024 * 1024 * 1024;
export const TO_ONE_M_CPU = 1000000;
export const TO_ONE_CPU = 1000000000;

export function parseDiskSpace(value: string) {
  return parseUnitsOfBytes(value);
}

export function parseRam(value: string) {
  return parseUnitsOfBytes(value);
}

function parseUnitsOfBytes(value: string): number {
  if (!value) return 0;

  // "m" suffix means milli-bytes (1/1000 of a byte), e.g. "11973899059200m" from kubectl
  // Support integer and decimal milli-byte values like "1000m" or "1.5m"
  if (/^\d+(?:\.\d+)?m$/.test(value)) {
    return parseFloat(value.slice(0, -1)) / 1000;
  }

  const groups = value.match(/(\d+(?:\.\d+)?)([BKMGTPEe])?(i)?(\d+)?/) || [];
  const number = parseFloat(groups[1]);

  // number ex. 1000
  if (groups[2] === undefined) {
    return number;
  }

  // number with exponent ex. 1e3
  if (groups[4] !== undefined) {
    return number * 10 ** parseInt(groups[4], 10);
  }

  const unitIndex = _.indexOf(UNITS, groups[2]);

  // Unit + i ex. 1Ki
  if (groups[3] !== undefined) {
    return number * 1024 ** unitIndex;
  }

  // Unit ex. 1K
  return number * 1000 ** unitIndex;
}

export function unparseRam(value: number) {
  let i = 0;
  while (value >= 1024 && i < RAM_TYPES.length - 1) {
    i++;
    value /= 1024; // eslint-disable-line no-param-reassign
  }

  return {
    value: _.round(value, 1),
    unit: RAM_TYPES[i],
  };
}

export function parseCpu(value: string) {
  if (!value) return 0;

  // parseFloat (not parseInt) so decimal-core quantities like "0.5" or "1.5"
  // keep their fractional part. Suffixed forms still parse ("500m" -> 500).
  const number = parseFloat(value);
  if (value.endsWith('n')) return number;
  if (value.endsWith('u')) return number * 1000;
  if (value.endsWith('m')) return number * 1000 * 1000;
  return number * 1000 * 1000 * 1000;
}

export function unparseCpu(value: string) {
  const result = parseFloat(value);

  return {
    value: _.round(result / 1000000, 2),
    unit: 'm',
  };
}

/**
 * Divides two Kubernetes resource quantities.
 * Useful for computing resource field references with divisors.
 * @param a - The dividend resource string (e.g., "1Gi", "500m")
 * @param b - The divisor resource string (e.g., "1Mi", "1")
 * @param resourceType - The type of resource ('cpu' or 'memory'). Defaults to 'memory'.
 * @returns The result of dividing a by b
 */
export function divideK8sResources(
  a: string,
  b: string,
  resourceType: 'cpu' | 'memory' = 'memory'
): number {
  if (resourceType === 'cpu') {
    return parseCpu(a) / parseCpu(b);
  }
  return parseUnitsOfBytes(a) / parseUnitsOfBytes(b);
}

/** A Kubernetes quantity split into the number the user edits and its suffix. */
export interface QuantityParts {
  value: number;
  /** The suffix as written, e.g. 'Gi' or 'M'. Empty when the quantity has no suffix. */
  unit: string;
}

/** What each suffix of the Kubernetes quantity grammar multiplies its number by. */
const QUANTITY_SUFFIX_MULTIPLIERS: Record<string, number> = {
  '': 1,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
  Ei: 2 ** 60,
};

/** The decimal suffix a decimal exponent stands for, e.g. 'e9' for 'G'. */
const DECIMAL_EXPONENT_SUFFIXES: Record<number, string> = {
  0: '',
  3: 'k',
  6: 'M',
  9: 'G',
  12: 'T',
  15: 'P',
  18: 'E',
};

/**
 * Splits a Kubernetes quantity into its number and its suffix.
 *
 * Quantities are written as a number followed by an optional suffix, e.g. '8Gi'. Editing
 * one means editing the number while keeping the suffix the cluster reported. A decimal
 * exponent, e.g. '1e9', has no suffix to keep, so it is folded into the decimal suffix it
 * stands for, or into the number when there is none.
 * @param quantity - The quantity to split, e.g. '8Gi'.
 * @returns The number and the suffix, or undefined when the quantity cannot be read.
 */
export function splitQuantity(quantity: string): QuantityParts | undefined {
  const groups =
    /^(\d+(?:\.\d*)?|\.\d+)(?:([eE][+-]?\d+)|(Ki|Mi|Gi|Ti|Pi|Ei|m|k|M|G|T|P|E))?$/.exec(
      quantity?.trim() ?? ''
    );
  if (!groups) {
    return undefined;
  }

  const value = parseFloat(groups[1]);
  const [, , exponent, unit = ''] = groups;
  if (exponent === undefined) {
    return { value, unit };
  }

  const power = parseInt(exponent.slice(1), 10);
  const decimalSuffix = DECIMAL_EXPONENT_SUFFIXES[power];
  return decimalSuffix === undefined
    ? { value: value * 10 ** power, unit: '' }
    : { value, unit: decimalSuffix };
}

/**
 * Reads a Kubernetes quantity as a plain number, e.g. the bytes of a storage size.
 *
 * It reads the quantity the way splitQuantity does, so that sizes compared with it agree
 * with the parts a user edits.
 * @param quantity - The quantity to read, e.g. '8Gi', '100k' or '1e9'.
 * @returns The number, or undefined when the quantity cannot be read.
 */
export function parseQuantity(quantity: string): number | undefined {
  const parts = splitQuantity(quantity);
  return parts && parts.value * QUANTITY_SUFFIX_MULTIPLIERS[parts.unit];
}
