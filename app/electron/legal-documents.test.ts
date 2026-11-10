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
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getLegalDocuments,
  getLegalDocumentsResourcePath,
  loadLegalDocuments,
  readLegalDocument,
} from './legal-documents';

describe('getLegalDocuments', () => {
  it('accepts manifest-declared legal documents at the field length limits', () => {
    const document = {
      id: `a${'-'.repeat(62)}z`,
      title: 't'.repeat(128),
      file: 'f'.repeat(255),
    };

    expect(getLegalDocuments({ legalDocuments: [document] })).toEqual([document]);
  });

  it.each([undefined, null, 'manifest', 1])('rejects a non-object manifest: %j', manifest => {
    expect(getLegalDocuments(manifest)).toEqual([]);
  });

  it.each([{}, { legalDocuments: null }, { legalDocuments: {} }])(
    'rejects a manifest without a document array: %j',
    manifest => {
      expect(getLegalDocuments(manifest)).toEqual([]);
    }
  );

  it.each([
    null,
    'LICENSE',
    { id: '', title: 'License', file: 'LICENSE' },
    { id: 'License', title: 'License', file: 'LICENSE' },
    { id: 'license_file', title: 'License', file: 'LICENSE' },
    { id: 'a'.repeat(65), title: 'License', file: 'LICENSE' },
    { id: 'license', title: 1, file: 'LICENSE' },
    { id: 'license', title: '', file: 'LICENSE' },
    { id: 'license', title: 't'.repeat(129), file: 'LICENSE' },
    { id: 'license', title: 'License', file: 1 },
    { id: 'license', title: 'License', file: '' },
    { id: 'license', title: 'License', file: 'f'.repeat(256) },
    { id: 'license', title: 'License', file: '../LICENSE' },
    { id: 'license', title: 'License', file: '..\\LICENSE' },
    { id: 'license', title: 'License', file: '.' },
    { id: 'license', title: 'License', file: '..' },
  ])('filters invalid document configuration: %j', document => {
    expect(getLegalDocuments({ legalDocuments: [document] })).toEqual([]);
  });

  it('keeps valid documents when invalid entries are present', () => {
    const document = { id: 'notices', title: 'Third-party notices', file: 'NOTICE' };

    expect(
      getLegalDocuments({ legalDocuments: [null, document, { ...document, id: 'BAD' }] })
    ).toEqual([document]);
  });

  it('keeps only the first valid document for each ID', () => {
    expect(
      getLegalDocuments({
        legalDocuments: [
          { id: 'license', title: 'License', file: 'LICENSE' },
          { id: 'license', title: 'Other license', file: 'OTHER-LICENSE' },
          { id: 'notices', title: 'Notices', file: 'NOTICE' },
        ],
      })
    ).toEqual([
      { id: 'license', title: 'License', file: 'LICENSE' },
      { id: 'notices', title: 'Notices', file: 'NOTICE' },
    ]);
  });
});

describe('legal document files', () => {
  let resourcesPath: string;

  beforeEach(() => {
    resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-legal-documents-'));
  });

  afterEach(() => {
    fs.rmSync(resourcesPath, { recursive: true, force: true });
  });

  it('uses the working directory for development resources', () => {
    expect(getLegalDocumentsResourcePath(true, '/packaged/resources', resourcesPath)).toBe(
      resourcesPath
    );
    expect(getLegalDocumentsResourcePath(false, '/packaged/resources', resourcesPath)).toBe(
      '/packaged/resources'
    );
  });

  it('loads legal document configuration from package metadata', () => {
    const packagePath = path.join(resourcesPath, 'app-build-manifest.json');
    fs.writeFileSync(
      packagePath,
      JSON.stringify({
        legalDocuments: [{ id: 'notice', title: 'Notices', file: 'NOTICE' }],
      })
    );

    expect(loadLegalDocuments(packagePath)).toEqual([
      { id: 'notice', title: 'Notices', file: 'NOTICE' },
    ]);
  });

  it.each(['missing.json', 'malformed.json'])(
    'returns no documents for unreadable metadata: %s',
    file => {
      const packagePath = path.join(resourcesPath, file);
      if (file === 'malformed.json') {
        fs.writeFileSync(packagePath, '{');
      }

      expect(loadLegalDocuments(packagePath)).toEqual([]);
    }
  );

  it('reads only a configured legal document', () => {
    fs.writeFileSync(path.join(resourcesPath, 'LICENSE'), 'license text');
    const documents = [{ id: 'license', title: 'License', file: 'LICENSE' }];

    expect(readLegalDocument(resourcesPath, documents, 'license')).toEqual({
      success: true,
      content: 'license text',
    });
    expect(readLegalDocument(resourcesPath, documents, 'other')).toEqual({
      success: false,
      error: 'Unknown legal document',
    });
    expect(readLegalDocument(resourcesPath, documents, null)).toEqual({
      success: false,
      error: 'Unknown legal document',
    });
  });

  it('rejects a configured path outside of the resources directory', () => {
    const documents = [{ id: 'license', title: 'License', file: '../LICENSE' }];

    expect(readLegalDocument(resourcesPath, documents, 'license')).toEqual({
      success: false,
      error: 'Invalid legal document path',
    });
  });

  it('reports configured documents that cannot be read', () => {
    const documents = [{ id: 'notices', title: 'Notices', file: 'NOTICE' }];

    expect(readLegalDocument(resourcesPath, documents, 'notices')).toEqual({
      success: false,
      error: 'Unable to read legal document',
    });
  });
});
