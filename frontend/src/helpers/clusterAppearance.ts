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

/**
 * Minimal shape of cluster metadata carrying headlamp_info appearance fields.
 */
interface ClusterMetadata {
  extensions?: {
    headlamp_info?: {
      accentColor?: unknown;
      warningBannerText?: unknown;
      icon?: unknown;
    };
  };
}

/**
 * Sanitized per-cluster UI settings extracted from metadata.
 */
export interface ClusterAppearance {
  accentColor?: string;
  warningBannerText?: string;
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
 * Extracts and sanitizes appearance fields from cluster metadata.
 *
 * @param metaData - Cluster metadata that may include headlamp_info fields.
 * @returns {ClusterAppearance} Sanitized per-cluster appearance settings.
 */
export function getClusterAppearanceFromMeta(
  metaData: ClusterMetadata | undefined
): ClusterAppearance {
  const headlampInfo = metaData?.extensions?.headlamp_info;
  return {
    accentColor: sanitizeCssColor(headlampInfo?.accentColor),
    warningBannerText:
      typeof headlampInfo?.warningBannerText === 'string'
        ? headlampInfo.warningBannerText
        : undefined,
    icon: typeof headlampInfo?.icon === 'string' ? headlampInfo.icon : undefined,
  };
}
