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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ManifestEnvironment = {
  [key: string]: string | undefined;
  HEADLAMP_BUILD_MANIFEST?: string;
};

export type BuildManifest = {
  /** URL glob patterns the packaged backend may proxy. */
  'proxy-urls'?: string[];

  /** Plugin declarations consumed by the app packaging scripts. */
  plugins?: Array<Record<string, unknown>>;

  /** Product identity fields consumed by Electron Builder. */
  product?: Record<string, unknown>;

  [key: string]: unknown;
};

type ProductMetadata = {
  name?: string;
  productName?: string;
  version?: string;
  appId?: string;
  artifactName?: string;
  protocols?: Record<string, unknown>;
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MANIFEST_FILE = path.join(scriptDirectory, '../app-build-manifest.json');

/**
 * Resolves the product build manifest selected by the environment.
 *
 * @param env Environment variables used to select an external manifest.
 * @param cwd Directory used to resolve a relative external manifest path.
 * @returns The absolute external manifest path, or Headlamp's default manifest path.
 */
export function resolveBuildManifestPath(
  env: ManifestEnvironment = process.env,
  cwd: string = process.cwd()
): string {
  const configuredPath = env.HEADLAMP_BUILD_MANIFEST;
  return configuredPath ? path.resolve(cwd, configuredPath) : DEFAULT_MANIFEST_FILE;
}

/**
 * Reads and parses a Headlamp build manifest.
 *
 * @param manifestFile Path to the manifest JSON file to load.
 * @returns The parsed build manifest.
 */
export function loadBuildManifest(
  manifestFile: string = resolveBuildManifestPath()
): BuildManifest {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as unknown;
  return validateBuildManifest(manifest);
}

/**
 * Validates fields that are consumed outside plugin installation.
 *
 * Proxy URL values become a comma-separated backend command argument, so each
 * entry must be a single HTTP(S) URL glob with a literal hostname. Only `*`
 * wildcards are supported; other backend glob metacharacters are rejected.
 *
 * @param value Parsed manifest JSON.
 * @returns The validated build manifest.
 * @throws When the manifest shape or a proxy URL pattern is unsafe.
 */
export function validateBuildManifest(value: unknown): BuildManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Build manifest must be a JSON object');
  }

  const manifest = value as BuildManifest;
  const proxyUrls = manifest['proxy-urls'];
  if (proxyUrls !== undefined) {
    if (!Array.isArray(proxyUrls) || proxyUrls.some(pattern => typeof pattern !== 'string')) {
      throw new Error('Build manifest proxy-urls must be an array of strings');
    }
    for (const pattern of proxyUrls) {
      if (pattern.trim() === '' || /[\r\n,?\[\]{}\\]/.test(pattern)) {
        throw new Error(`Invalid build manifest proxy-urls pattern: ${pattern}`);
      }
      let parsedPattern: URL;
      try {
        parsedPattern = new URL(pattern.replaceAll('*', 'wildcard'));
      } catch {
        throw new Error(`Invalid build manifest proxy-urls pattern: ${pattern}`);
      }
      const authority = pattern.match(/^https?:\/\/([^/]+)/i)?.[1] ?? '';
      if (
        !['http:', 'https:'].includes(parsedPattern.protocol) ||
        parsedPattern.hostname === '' ||
        authority.includes('*')
      ) {
        throw new Error(`Invalid build manifest proxy-urls pattern: ${pattern}`);
      }
    }
  }

  if (manifest.plugins !== undefined && !Array.isArray(manifest.plugins)) {
    throw new Error('Build manifest plugins must be an array');
  }
  return manifest;
}

/**
 * Applies supported product metadata from a build manifest.
 *
 * @param config Electron Builder configuration to extend.
 * @param manifest Parsed build manifest.
 * @returns The original configuration when metadata is absent, or a copy with overrides applied.
 * @throws When the manifest or product metadata is malformed.
 */
export function applyProductMetadata<T extends object>(config: T, manifest: unknown): T {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Build manifest must be an object');
  }

  const product = (manifest as BuildManifest).product;
  if (product === undefined) {
    return config;
  }
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error('Build manifest product must be an object');
  }

  const scalarFields = ['name', 'productName', 'version', 'appId', 'artifactName'] as const;
  for (const field of scalarFields) {
    if (product[field] !== undefined && typeof product[field] !== 'string') {
      throw new Error(`Build manifest product.${field} must be a string`);
    }
  }
  if (
    product.protocols !== undefined &&
    (!product.protocols ||
      typeof product.protocols !== 'object' ||
      Array.isArray(product.protocols))
  ) {
    throw new Error('Build manifest product.protocols must be an object');
  }

  const metadata = product as ProductMetadata;
  const configRecord = config as Record<string, unknown>;

  const currentExtraMetadata =
    configRecord.extraMetadata &&
    typeof configRecord.extraMetadata === 'object' &&
    !Array.isArray(configRecord.extraMetadata)
      ? configRecord.extraMetadata
      : {};

  return {
    ...config,
    ...(metadata.productName && { productName: metadata.productName }),
    ...(metadata.appId && { appId: metadata.appId }),
    ...(metadata.artifactName && { artifactName: metadata.artifactName }),
    ...(metadata.protocols && { protocols: metadata.protocols }),
    ...(metadata.version && { buildVersion: metadata.version }),
    extraMetadata: {
      ...currentExtraMetadata,
      ...(metadata.name && { name: metadata.name }),
      ...(metadata.productName && { productName: metadata.productName }),
      ...(metadata.version && { version: metadata.version }),
    },
  } as T;
}

/**
 * Applies manifest-declared metadata to supported Electron Builder platforms.
 *
 * @param config Electron Builder configuration to extend.
 * @param manifest Parsed application build manifest.
 * @returns The original configuration when no platform metadata is declared,
 * or a copy containing the validated platform overrides.
 * @throws When the manifest or platform metadata has an unsupported shape or field.
 */
export function applyPlatformMetadata<T extends object>(config: T, manifest: unknown): T {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error('Build manifest must be an object');
  }

  const platforms = (manifest as { platforms?: unknown }).platforms;
  if (platforms === undefined) {
    return config;
  }
  if (typeof platforms !== 'object' || platforms === null || Array.isArray(platforms)) {
    throw new Error('Build manifest platforms must be an object');
  }

  const allowedFields = new Set([
    'appId',
    'bundleShortVersion',
    'bundleVersion',
    'executableName',
    'icon',
    'artifactName',
  ]);
  const configRecord = config as Record<string, unknown>;
  const result: Record<string, unknown> = { ...configRecord };
  for (const platform of ['linux', 'mac', 'win']) {
    const metadata = (platforms as Record<string, unknown>)[platform];
    if (metadata === undefined) {
      continue;
    }
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      throw new Error(`Build manifest platforms.${platform} must be an object`);
    }
    for (const [field, fieldValue] of Object.entries(metadata)) {
      if (!allowedFields.has(field)) {
        throw new Error(`Unsupported build manifest platforms.${platform}.${field}`);
      }
      if (typeof fieldValue !== 'string') {
        throw new Error(`Build manifest platforms.${platform}.${field} must be a string`);
      }
    }
    const defaults = configRecord[platform];
    const platformDefaults =
      typeof defaults === 'object' && defaults !== null
        ? (defaults as Record<string, unknown>)
        : {};
    result[platform] = { ...platformDefaults, ...metadata };
  }
  return result as T;
}
