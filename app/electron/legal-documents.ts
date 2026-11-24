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

/** A legal document declared in the application build manifest. */
export interface LegalDocument {
  /** Stable identifier used when requesting the document over IPC. */
  id: string;
  /** Human-readable title shown in the application. */
  title: string;
  /** Resource filename relative to the packaged application resources directory. */
  file: string;
}

/** Public metadata for a legal document exposed to the renderer. */
export type LegalDocumentSummary = Pick<LegalDocument, 'id' | 'title'>;

/** Result returned when the renderer requests legal document content. */
export interface LegalDocumentResult {
  /** Whether the requested document was read successfully. */
  success: boolean;
  /** Document text when the request succeeds. */
  content?: string;
  /** User-facing failure reason when the request fails. */
  error?: string;
}

const VALID_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Validates legal documents from parsed application build metadata.
 *
 * @param packageConfig - Parsed application build manifest content.
 * @returns Valid manifest-declared legal documents.
 */
export function getLegalDocuments(packageConfig: unknown): LegalDocument[] {
  if (typeof packageConfig !== 'object' || packageConfig === null) {
    return [];
  }

  const configuredDocuments = (packageConfig as { legalDocuments?: unknown }).legalDocuments;

  if (!Array.isArray(configuredDocuments)) {
    return [];
  }

  const configuredIds = new Set<string>();
  return configuredDocuments.filter((document): document is LegalDocument => {
    if (typeof document !== 'object' || document === null) {
      return false;
    }
    const { id, title, file } = document as Partial<LegalDocument>;
    if (
      typeof id !== 'string' ||
      !VALID_ID.test(id) ||
      typeof title !== 'string' ||
      title.length === 0 ||
      title.length > 128 ||
      typeof file !== 'string' ||
      file.length === 0 ||
      file.length > 255 ||
      file.includes('/') ||
      file.includes('\\') ||
      file === '.' ||
      file === '..' ||
      configuredIds.has(id)
    ) {
      return false;
    }
    configuredIds.add(id);
    return true;
  });
}

/**
 * Resolves the root directory containing legal document resources.
 *
 * @param isDevelopment - Whether Electron is running from the source tree.
 * @param resourcesPath - Electron's packaged resource directory.
 * @param cwd - Working directory used as the development resource root.
 * @returns The source-tree root in development, otherwise the packaged resource directory.
 */
export function getLegalDocumentsResourcePath(
  isDevelopment: boolean,
  resourcesPath: string,
  cwd: string = process.cwd()
): string {
  return isDevelopment ? path.resolve(cwd) : resourcesPath;
}

/**
 * Loads legal document declarations from an application build manifest.
 *
 * @param packagePath - Path to the application build manifest JSON file.
 * @returns Valid legal document declarations, or an empty array when loading fails.
 */
export function loadLegalDocuments(packagePath: string): LegalDocument[] {
  try {
    return getLegalDocuments(JSON.parse(fs.readFileSync(packagePath, 'utf8')));
  } catch {
    return [];
  }
}

/**
 * Reads one configured legal document from packaged application resources.
 *
 * @param resourcesPath - Root directory containing packaged resources.
 * @param documents - Valid legal document declarations.
 * @param id - Untrusted document identifier received over IPC.
 * @returns Document content on success, otherwise a stable failure result.
 */
export function readLegalDocument(
  resourcesPath: string,
  documents: LegalDocument[],
  id: unknown
): LegalDocumentResult {
  const document = typeof id === 'string' ? documents.find(item => item.id === id) : undefined;
  if (!document) {
    return { success: false, error: 'Unknown legal document' };
  }

  try {
    const filePath = path.resolve(resourcesPath, document.file);
    const relativePath = path.relative(path.resolve(resourcesPath), filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return { success: false, error: 'Invalid legal document path' };
    }
    return { success: true, content: fs.readFileSync(filePath, 'utf8') };
  } catch {
    return { success: false, error: 'Unable to read legal document' };
  }
}
