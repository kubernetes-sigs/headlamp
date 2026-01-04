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

import { getCluster } from '../lib/cluster';
import { loadClusterSettings } from './clusterSettings';

/**
 * Sanitized per-cluster UI settings extracted from localStorage.
 */
export interface ClusterAppearance {
  accentColor?: string;
  icon?: string;
}

/**
 * Returns whether a color string matches hex, rgb(), or rgba() formats.
 *
 * @param color - CSS color string to validate.
 * @returns {boolean} True if the color is valid; otherwise false.
 */
export function isValidCssColor(color: string): boolean {
  if (!color) return false;
  const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  const rgbColorRegex = /^rgb\((\s*\d+\s*,){2}\s*\d+\s*\)$/;
  const rgbaColorRegex = /^rgba\((\s*\d+\s*,){3}\s*(0|1|0?\.\d+)\s*\)$/;
  return hexColorRegex.test(color) || rgbColorRegex.test(color) || rgbaColorRegex.test(color);
}

/**
 * Coerces to a valid CSS color or returns undefined if invalid.
 *
 * @param color - Candidate color value (string or other).
 * @returns {string | undefined} The valid color or undefined if invalid.
 */
export function sanitizeCssColor(color: unknown): string | undefined {
  if (typeof color !== 'string' || !color) {
    return undefined;
  }
  return isValidCssColor(color) ? color : undefined;
}

/**
 * Extracts and sanitizes appearance fields from localStorage for a given cluster.
 *
 * @param clusterName - The cluster name. If not provided, uses the current cluster from getCluster().
 * @returns {ClusterAppearance} Sanitized per-cluster appearance settings from localStorage.
 */
export function getClusterAppearanceFromMeta(
  clusterName: string | null = getCluster()
): ClusterAppearance {
  if (!clusterName) {
    return {};
  }

  // Load appearance from localStorage via clusterSettings
  const settings = loadClusterSettings(clusterName);
  const appearance = settings.appearance || {};

  return {
    accentColor: sanitizeCssColor(appearance.accentColor),
    icon: typeof appearance.icon === 'string' ? appearance.icon : undefined,
  };
}
