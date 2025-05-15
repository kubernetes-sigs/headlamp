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

import Swagger from '@apidevtools/swagger-parser';
import { OpenAPIV2 } from 'openapi-types';

describe('@apidevtools/swagger-parser', () => {
  it('should resolve $ref references', async () => {
    const doc: OpenAPIV2.Document = {
      swagger: '2.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
      definitions: {
        'io.k8s.api.apps.v1.Deployment': {
          type: 'object',
          properties: {
            metadata: { $ref: '#/definitions/io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta' },
          },
        },
        'io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta': {
          type: 'object',
          properties: {
            name: { type: 'string' },
            namespace: { type: 'string' },
          },
        },
      },
    };

    const result = (await Swagger.dereference(doc)) as OpenAPIV2.Document;

    expect(result.definitions?.['io.k8s.api.apps.v1.Deployment'].properties?.metadata).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        namespace: { type: 'string' },
      },
    });
  });

  it('should throw an error for invalid $ref references', async () => {
    const doc: OpenAPIV2.Document = {
      swagger: '2.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
      definitions: {
        'io.k8s.api.core.v1.Pod': {
          type: 'object',
          properties: {
            metadata: { $ref: '#/definitions/NonExistentRef' },
          },
        },
      },
    };

    await expect(Swagger.dereference(doc)).rejects.toThrow(/Token "NonExistentRef"/);
  });

  it('should handle deeply nested $ref references', async () => {
    const doc: OpenAPIV2.Document = {
      swagger: '2.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
      definitions: {
        'io.k8s.api.core.v1.Pod': {
          type: 'object',
          properties: {
            spec: { $ref: '#/definitions/io.k8s.api.core.v1.PodSpec' },
          },
        },
        'io.k8s.api.core.v1.PodSpec': {
          type: 'object',
          properties: {
            containers: {
              type: 'array',
              items: { $ref: '#/definitions/io.k8s.api.core.v1.Container' },
            },
          },
        },
        'io.k8s.api.core.v1.Container': {
          type: 'object',
          properties: {
            image: { type: 'string' },
          },
        },
      },
    };

    const result = (await Swagger.dereference(doc)) as OpenAPIV2.Document;

    expect(result.definitions?.['io.k8s.api.core.v1.Pod'].properties?.spec).toEqual({
      type: 'object',
      properties: {
        containers: {
          type: 'array',
          items: { type: 'object', properties: { image: { type: 'string' } } },
        },
      },
    });
  });

  it('should handle circular references', async () => {
    const doc: OpenAPIV2.Document = {
      swagger: '2.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
      definitions: {
        'io.k8s.api.core.v1.Pod': {
          type: 'object',
          properties: {
            metadata: {
              $ref: '#/definitions/io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta',
            },
          },
        },
        'io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta': {
          type: 'object',
          properties: {
            ownerReferences: {
              $ref: '#/definitions/io.k8s.api.core.v1.Pod',
            },
          },
        },
      },
    };

    const result = (await Swagger.dereference(doc)) as OpenAPIV2.Document;

    expect(result.definitions?.['io.k8s.api.core.v1.Pod'].properties?.metadata).toBeDefined();
    expect(
      result.definitions?.['io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta'].properties
        ?.ownerReferences
    ).toBeDefined();
  });
});
