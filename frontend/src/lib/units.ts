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

  // Fractional byte suffixes are milli (m), micro (u), and nano (n).
  // Support integer and decimal quantities without matching other suffixes.
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[mun]$/.test(value)) {
    const divisor = value.endsWith('n') ? 1e9 : value.endsWith('u') ? 1e6 : 1000;
    return parseFloat(value) / divisor;
  }

  // Kubernetes spells kilo with a lowercase k in the decimal suffixes
  // (m | "" | k | M | G | T | P | E), so 1k is 1000 while 1Ki is 1024. The
  // uppercase K is not a valid suffix, but it has been read as kilo here for a
  // long time, so it stays accepted.
  const groups = value.match(/(\d+(?:\.\d+)?)([BkKMGTPEe])?(i)?(\d+)?/) || [];
  const number = parseFloat(groups[1]) * (value.startsWith('-') ? -1 : 1);

  // number ex. 1000
  if (groups[2] === undefined) {
    return number;
  }

  // number with exponent ex. 1e3
  if (groups[4] !== undefined) {
    return number * 10 ** parseInt(groups[4], 10);
  }

  // The binary suffixes are Ki, Mi, Gi and so on, all with an uppercase letter.
  // There is no lowercase ki, so it is left unparsed rather than read as 1024.
  if (groups[2] === 'k' && groups[3] !== undefined) {
    return number;
  }

  const unitIndex = _.indexOf(UNITS, groups[2] === 'k' ? 'K' : groups[2]);

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
  const divisor = resourceType === 'cpu' ? parseCpu(b) : parseUnitsOfBytes(b);
  if (divisor <= 0 || !Number.isFinite(divisor)) {
    throw new Error(`Divisor must be greater than 0: ${b}`);
  }

  const dividend = resourceType === 'cpu' ? parseCpu(a) : parseUnitsOfBytes(a);
  return dividend / divisor;
}

/** A Kubernetes quantity split into the number the user edits and its suffix. */
export interface QuantityParts {
  /** The number as text, e.g. '1.5', because a JavaScript number would round a large one. */
  value: string;
  /** The suffix as written, e.g. 'Gi' or 'M'. Empty when the quantity has no suffix. */
  unit: string;
}

/** The power of ten each decimal suffix of the Kubernetes quantity grammar stands for. */
const DECIMAL_SUFFIX_POWERS: Record<string, number> = {
  n: -9,
  u: -6,
  m: -3,
  '': 0,
  k: 3,
  M: 6,
  G: 9,
  T: 12,
  P: 15,
  E: 18,
};

/** The power of two each binary suffix of the Kubernetes quantity grammar stands for. */
const BINARY_SUFFIX_POWERS: Record<string, number> = {
  Ki: 10,
  Mi: 20,
  Gi: 30,
  Ti: 40,
  Pi: 50,
  Ei: 60,
};

/** Moves the decimal point of an unsigned decimal, without rounding it. */
function shiftDecimalPoint(value: string, places: number): string {
  const [integer, fraction = ''] = value.split('.');
  const digits = integer + fraction;
  const point = integer.length + places;
  const whole = point > 0 ? digits.padEnd(point, '0').slice(0, point) : '';
  const rest = point > 0 ? digits.slice(point) : '0'.repeat(-point) + digits;

  const trimmedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const trimmedRest = rest.replace(/0+$/, '');
  return trimmedRest ? `${trimmedWhole}.${trimmedRest}` : trimmedWhole;
}

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
    /^(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d{1,3})|(Ki|Mi|Gi|Ti|Pi|Ei|n|u|m|k|M|G|T|P|E))?$/.exec(
      quantity?.trim() ?? ''
    );
  if (!groups) {
    return undefined;
  }

  const [, value, exponent, unit = ''] = groups;
  if (exponent === undefined) {
    return { value: shiftDecimalPoint(value, 0), unit };
  }

  const power = parseInt(exponent, 10);
  const decimalSuffix = Object.keys(DECIMAL_SUFFIX_POWERS).find(
    suffix => DECIMAL_SUFFIX_POWERS[suffix] === power
  );
  return decimalSuffix === undefined
    ? { value: shiftDecimalPoint(value, power), unit: '' }
    : { value: shiftDecimalPoint(value, 0), unit: decimalSuffix };
}

/**
 * Compares two Kubernetes quantities exactly, whatever their size and suffix.
 *
 * It reads the quantities the way splitQuantity does, so that it agrees with the parts a
 * user edits.
 * @param a - The first quantity, e.g. '8Gi', '100k' or '1e9'.
 * @param b - The second quantity.
 * @returns A negative number, 0 or a positive number when a is smaller than, equal to or
 * larger than b, or undefined when either cannot be read.
 */
export function compareQuantities(a: string, b: string): number | undefined {
  const partsA = splitQuantity(a);
  const partsB = splitQuantity(b);
  if (!partsA || !partsB) {
    return undefined;
  }

  const [scaledA, scaledB] = [partsA, partsB].map(({ value, unit }) => {
    const [integer, fraction = ''] = value.split('.');
    return {
      digits: integer + fraction,
      power: (DECIMAL_SUFFIX_POWERS[unit] ?? 0) - fraction.length,
      // A power of two up to 2^60 is exact as a JavaScript number.
      multiplier: BigInt(2 ** (BINARY_SUFFIX_POWERS[unit] ?? 0)),
    };
  });
  const lowestPower = Math.min(scaledA.power, scaledB.power);
  const [integerA, integerB] = [scaledA, scaledB].map(
    ({ digits, power, multiplier }) => BigInt(digits + '0'.repeat(power - lowestPower)) * multiplier
  );

  if (integerA === integerB) {
    return 0;
  }
  return integerA < integerB ? -1 : 1;
}
