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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as docs from '../../lib/docs';
import * as clusterRequests from '../../lib/k8s/api/v1/clusterRequests';
import {
  applyMonacoSchemaValidation,
  fetchResourceSchema,
  resetSchemaCache,
  validateObjectAgainstSchema,
} from './schemaProvider';

vi.mock('../../lib/docs', () => ({
  default: vi.fn(),
}));

vi.mock('../../lib/k8s/api/v1/clusterRequests', () => ({
  request: vi.fn(),
}));

describe('schemaProvider', () => {
  beforeEach(() => {
    resetSchemaCache();
    vi.resetAllMocks();
  });

  describe('fetchResourceSchema', () => {
    it('should return null if apiVersion or kind is missing', async () => {
      const res1 = await fetchResourceSchema('', 'Pod');
      const res2 = await fetchResourceSchema('v1', '');
      expect(res1).toBeNull();
      expect(res2).toBeNull();
    });

    it('should fetch schema from core openapi definitions first', async () => {
      const mockSchema = {
        title: 'io.k8s.api.core.v1.Pod',
        properties: {
          apiVersion: { type: 'string' },
          kind: { type: 'string' },
        },
      };

      vi.mocked(docs.default).mockResolvedValueOnce(mockSchema as any);

      const res = await fetchResourceSchema('v1', 'Pod');
      expect(res).toEqual(mockSchema);
      expect(docs.default).toHaveBeenCalledWith('v1', 'Pod');
    });

    it('should fetch schema from CRDs if core openapi definition is not found', async () => {
      vi.mocked(docs.default).mockResolvedValueOnce(null as any);

      const mockCrdList = {
        items: [
          {
            spec: {
              group: 'monitoring.coreos.com',
              names: { kind: 'PrometheusRule' },
              versions: [
                {
                  name: 'v1',
                  schema: {
                    openAPIV3Schema: {
                      title: 'PrometheusRule',
                      type: 'object',
                      properties: {
                        spec: { type: 'object' },
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      };

      vi.mocked(clusterRequests.request).mockResolvedValueOnce(mockCrdList as any);

      const res = await fetchResourceSchema('monitoring.coreos.com/v1', 'PrometheusRule');
      expect(res).toEqual(mockCrdList.items[0].spec.versions[0].schema.openAPIV3Schema);
      expect(clusterRequests.request).toHaveBeenCalledWith(
        '/apis/apiextensions.k8s.io/v1/customresourcedefinitions'
      );
    });

    it('should return null and cache if neither core nor CRD schema is found', async () => {
      vi.mocked(docs.default).mockResolvedValueOnce(null as any);
      vi.mocked(clusterRequests.request).mockResolvedValueOnce({ items: [] } as any);

      const res1 = await fetchResourceSchema('example.com/v1', 'UnknownKind');
      expect(res1).toBeNull();

      // Second call should return cached null without calling requests again
      const res2 = await fetchResourceSchema('example.com/v1', 'UnknownKind');
      expect(res2).toBeNull();
      expect(docs.default).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateObjectAgainstSchema', () => {
    it('should report missing required properties', () => {
      const schema = {
        title: 'TestResource',
        required: ['spec'],
        properties: {
          apiVersion: { type: 'string' },
          kind: { type: 'string' },
          spec: { type: 'object' },
        },
      };

      const obj = { apiVersion: 'v1', kind: 'Pod' };
      const yamlText = 'apiVersion: v1\nkind: Pod\n';

      const errors = validateObjectAgainstSchema(obj, schema, yamlText);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Missing required property 'spec'");
    });

    it('should report type mismatch errors', () => {
      const schema = {
        title: 'TestResource',
        properties: {
          apiVersion: { type: 'string' },
          replicas: { type: 'integer' },
        },
      };

      const obj = { apiVersion: 'v1', replicas: 'invalid-string' };
      const yamlText = 'apiVersion: v1\nreplicas: invalid-string\n';

      const errors = validateObjectAgainstSchema(obj, schema, yamlText);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Invalid type for 'replicas': expected integer");
    });
  });

  describe('applyMonacoSchemaValidation', () => {
    it('should set model markers when schema validation fails', async () => {
      const mockModel = {
        uri: { toString: () => 'inmemory://model1' },
      };
      const mockEditor = {
        getModel: () => mockModel,
      };
      const setModelMarkers = vi.fn();
      const setDiagnosticsOptions = vi.fn();

      const mockMonaco = {
        editor: {
          setModelMarkers,
        },
        languages: {
          json: {
            jsonDefaults: {
              setDiagnosticsOptions,
            },
          },
        },
        MarkerSeverity: {
          Error: 8,
        },
      };

      const mockSchema = {
        title: 'Pod',
        required: ['spec'],
        properties: {
          apiVersion: { type: 'string' },
          kind: { type: 'string' },
        },
      };

      vi.mocked(docs.default).mockResolvedValueOnce(mockSchema as any);

      const yamlText = 'apiVersion: v1\nkind: Pod\n';
      await applyMonacoSchemaValidation(mockMonaco as any, mockEditor as any, yamlText);

      expect(setDiagnosticsOptions).toHaveBeenCalled();
      expect(setModelMarkers).toHaveBeenCalledWith(
        mockModel,
        'headlamp-schema-validation',
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Missing required property 'spec'"),
            severity: 8,
          }),
        ])
      );
    });
  });
});
