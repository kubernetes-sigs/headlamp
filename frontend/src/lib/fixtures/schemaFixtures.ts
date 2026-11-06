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

import type { OpenAPIV2, OpenAPIV3 } from 'openapi-types';

export interface KubeOpenAPIV3Document extends Omit<OpenAPIV3.Document, 'components'> {
  components?: {
    schemas?: Record<
      string,
      OpenAPIV3.ReferenceObject | (OpenAPIV3.SchemaObject & Record<string, any>)
    >;
    [key: string]: any;
  };
}

export const mockOpenAPIV3Discovery = {
  paths: {
    'api/v1': {
      serverRelativeURL:
        '/openapi/v3/api/v1?hash=1111111111111111111111111111111111111111111111111111111111111111',
    },
    'apis/apps/v1': {
      serverRelativeURL:
        '/openapi/v3/apis/apps/v1?hash=2222222222222222222222222222222222222222222222222222222222222222',
    },
    'apis/custom.example.com/v1alpha1': {
      serverRelativeURL:
        '/openapi/v3/apis/custom.example.com/v1alpha1?hash=3333333333333333333333333333333333333333333333333333333333333333',
    },
  },
};

export const mockCoreV1Document: KubeOpenAPIV3Document = {
  openapi: '3.0.0',
  info: { title: 'Kubernetes Core v1 API', version: 'v1' },
  paths: {},
  components: {
    schemas: {
      'io.k8s.api.core.v1.Pod': {
        type: 'object',
        description: 'Pod is a collection of containers that can run on a host.',
        properties: {
          metadata: {
            $ref: '#/components/schemas/io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta',
          },
          spec: {
            type: 'object',
            properties: {
              containers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    image: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        'x-kubernetes-group-version-kind': [
          {
            group: '',
            version: 'v1',
            kind: 'Pod',
          },
        ],
      },
      'io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta': {
        type: 'object',
        description: 'Standard object metadata',
        properties: {
          name: { type: 'string' },
          namespace: { type: 'string' },
          labels: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      },
    },
  },
};

export const mockAppsV1Document: KubeOpenAPIV3Document = {
  openapi: '3.0.0',
  info: { title: 'Kubernetes Apps v1 API', version: 'v1' },
  paths: {},
  components: {
    schemas: {
      'io.k8s.api.apps.v1.Deployment': {
        type: 'object',
        description: 'Deployment enables declarative updates for Pods and ReplicaSets.',
        properties: {
          metadata: {
            $ref: '#/components/schemas/io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta',
          },
          spec: {
            type: 'object',
            properties: {
              replicas: { type: 'integer', default: 1 },
            },
          },
        },
        'x-kubernetes-group-version-kind': [
          {
            group: 'apps',
            version: 'v1',
            kind: 'Deployment',
          },
        ],
      },
      'io.k8s.api.apps.v1.DaemonSet': {
        type: 'object',
        description: 'DaemonSet represents the configuration of a daemon set.',
        properties: {
          spec: { type: 'object' },
        },
        'x-kubernetes-group-version-kind': [
          {
            group: 'apps',
            version: 'v1',
            kind: 'DaemonSet',
          },
        ],
      },
    },
  },
};

export const mockCRDDocument: KubeOpenAPIV3Document = {
  openapi: '3.0.0',
  info: { title: 'Custom Resource API', version: 'v1alpha1' },
  paths: {},
  components: {
    schemas: {
      'com.example.custom.v1alpha1.ControlledResource': {
        type: 'object',
        required: ['apiVersion', 'kind', 'spec'],
        properties: {
          apiVersion: { type: 'string' },
          kind: { type: 'string' },
          spec: {
            type: 'object',
            required: ['mode'],
            properties: {
              mode: {
                type: 'string',
                enum: ['Fast', 'Safe', 'Manual'],
                default: 'Safe',
              },
              name: {
                type: 'string',
                nullable: true,
              },
              selector: {
                type: 'string',
              },
            },
            oneOf: [{ required: ['name'] }, { required: ['selector'] }],
          },
        },
        'x-kubernetes-group-version-kind': [
          {
            group: 'custom.example.com',
            version: 'v1alpha1',
            kind: 'ControlledResource',
          },
        ],
        'x-kubernetes-preserve-unknown-fields': false,
      },
    },
  },
};

export const mockRecursiveDocument: KubeOpenAPIV3Document = {
  openapi: '3.0.0',
  info: { title: 'Recursive Resource API', version: 'v1' },
  paths: {},
  components: {
    schemas: {
      'com.example.recursive.v1.TreeNode': {
        type: 'object',
        properties: {
          name: { type: 'string' },
          parent: {
            $ref: '#/components/schemas/com.example.recursive.v1.TreeNode',
          },
          children: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/com.example.recursive.v1.TreeNode',
            },
          },
        },
        'x-kubernetes-group-version-kind': [
          {
            group: 'recursive.example.com',
            version: 'v1',
            kind: 'TreeNode',
          },
        ],
      },
    },
  },
};

export const mockOpenAPIV2FallbackDocument: OpenAPIV2.Document = {
  swagger: '2.0',
  info: { title: 'Kubernetes Aggregated v2 API', version: 'v1.28.0' },
  paths: {},
  definitions: {
    'io.k8s.api.apps.v1.Deployment': {
      type: 'object',
      properties: {
        metadata: {
          $ref: '#/definitions/io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta',
        },
        spec: {
          type: 'object',
          properties: {
            replicas: { type: 'integer' },
          },
        },
      },
      'x-kubernetes-group-version-kind': [
        {
          group: 'apps',
          version: 'v1',
          kind: 'Deployment',
        },
      ],
    },
  },
};
