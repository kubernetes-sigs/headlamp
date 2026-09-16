/*
 * Copyright 2026 The Kubernetes Authors
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

/** Product identity fields consumed by Electron Builder and the app runtime. */
export type ProductMetadata = {
  name?: string;
  productName?: string;
  version?: string;
  appId?: string;
  artifactName?: string;
  protocols?: Record<string, unknown>;
};

/**
 * Reads and validates product metadata without depending on build-time paths.
 *
 * @param manifest Parsed application build manifest.
 * @returns Validated product metadata, or undefined when it is not configured.
 * @throws When the manifest or product metadata is malformed.
 */
export function readProductMetadata(manifest: unknown): ProductMetadata | undefined {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Build manifest must be an object');
  }

  const product = (manifest as { product?: unknown }).product;
  if (product === undefined) {
    return undefined;
  }
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error('Build manifest product must be an object');
  }

  const metadata = product as ProductMetadata;
  const scalarFields = ['name', 'productName', 'version', 'appId', 'artifactName'] as const;
  for (const field of scalarFields) {
    if (metadata[field] !== undefined && typeof metadata[field] !== 'string') {
      throw new Error(`Build manifest product.${field} must be a string`);
    }
  }
  if (
    metadata.protocols !== undefined &&
    (!metadata.protocols ||
      typeof metadata.protocols !== 'object' ||
      Array.isArray(metadata.protocols))
  ) {
    throw new Error('Build manifest product.protocols must be an object');
  }
  if (metadata.protocols !== undefined) {
    const schemes = metadata.protocols.schemes;
    if (
      !Array.isArray(schemes) ||
      schemes.length === 0 ||
      schemes.some(scheme => typeof scheme !== 'string' || scheme === '')
    ) {
      throw new Error(
        'Build manifest product.protocols.schemes must be a non-empty array of strings'
      );
    }
  }

  return metadata;
}
