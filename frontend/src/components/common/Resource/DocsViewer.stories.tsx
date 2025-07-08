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

import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { resetDocsPromise } from '../../../lib/docs';
import DocsViewer, { DocsViewerProps } from './DocsViewer';

export default {
  title: 'Resource/DocsViewer',
  component: DocsViewer,
  argTypes: {},
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get('http://localhost:4466/openapi/v2', () =>
            HttpResponse.json({
              swagger: '2.0',
              info: { title: 'Test API', version: '1.0.0' },
              paths: {},
              definitions: {
                'io.k8s.api.core.v1.Pod': {
                  'x-kubernetes-group-version-kind': [{ group: '', version: 'v1', kind: 'Pod' }],
                  properties: {
                    apiVersion: {
                      type: 'string',
                      description: `
                        APIVersion defines the versioned schema of this representation of an object. 
                        Servers should convert recognized schemas to the latest internal value, 
                        and may reject unrecognized values. 
                        More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
                      `,
                    },
                    kind: {
                      type: 'string',
                      description: `
                        Kind is a string value representing the REST resource this object represents. 
                        Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. 
                        More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds',
                      `,
                    },
                    metadata: {
                      type: 'object',
                      description: `Standard object's metadata. 
                      More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata`,
                      properties: {
                        annotations: {
                          type: 'object',
                          description: `Annotations is an unstructured key value map stored with a resource that may be set by external tools to store and retrieve arbitrary metadata. 
                          They are not queryable and should be preserved when modifying objects. 
                          More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/annotations`,
                        },
                        creationTimestamp: {
                          type: 'string',
                          description:
                            'CreationTimestamp is a timestamp representing the server time when this object was created',
                        },
                        deletionTimestamp: {
                          type: 'string',
                          description:
                            'DeletionTimestamp is RFC 3339 date and time at which this resource will be deleted.',
                        },
                      },
                    },
                    spec: {
                      type: 'object',
                      description: `Specification of the desired behavior of the pod. 
                      More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#spec-and-status`,
                      properties: {
                        containers: {
                          type: 'array',
                          description: `List of containers belonging to the pod. Containers cannot currently be added or removed. 
                          There must be at least one container in a Pod. Cannot be updated.`,
                        },
                      },
                    },
                  },
                },
              },
            })
          ),
        ],
      },
    },
  },
  decorators: [
    Story => {
      // Reset docsPromise before each story
      resetDocsPromise();
      return <Story />;
    },
  ],
} as Meta;

const Template: StoryFn<DocsViewerProps> = args => <DocsViewer {...args} />;

export const TypicalDocumentation = Template.bind({});
TypicalDocumentation.args = {
  docSpecs: [{ apiVersion: 'v1', kind: 'Pod' }],
};

export const NoDocumentation = Template.bind({});
NoDocumentation.args = {
  docSpecs: [],
};

export const NoMatchingDocumentation = Template.bind({});
NoMatchingDocumentation.args = {
  docSpecs: [{ apiVersion: 'v1', kind: 'NonExistentType' }],
};

export const ErrorDocumentation = Template.bind({});
ErrorDocumentation.args = {
  docSpecs: [{}],
};
ErrorDocumentation.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/openapi/v2',
          () =>
            new HttpResponse(null, {
              status: 500,
            })
        ),
      ],
    },
  },
};
