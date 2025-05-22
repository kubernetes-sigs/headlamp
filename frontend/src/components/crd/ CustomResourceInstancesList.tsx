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
import React from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import CRD, { KubeCRD } from '../../lib/k8s/crd';
import { KubeObjectInterface } from '../../lib/k8s/KubeObject';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import { CrInstanceList } from './CustomResourceInstancesList';

const mockCRD1Spec: KubeCRD['spec'] = {
  group: 'stable.example.com',
  version: 'v1',
  versions: [{ name: 'v1', served: true, storage: true, additionalPrinterColumns: [] }],
  scope: 'Namespaced',
  names: {
    plural: 'appconfigs',
    singular: 'appconfig',
    kind: 'AppConfig',
    listKind: 'AppConfigList',
  },
};

const mockCRD1 = new CRD({
  kind: 'CustomResourceDefinition',
  apiVersion: 'apiextensions.k8s.io/v1',
  metadata: {
    name: 'appconfigs.stable.example.com',
    uid: 'crd1-uid',
    creationTimestamp: new Date().toISOString(),
  },
  spec: mockCRD1Spec,
});

const mockCRD2Spec: KubeCRD['spec'] = {
  group: 'batch.example.com',
  version: 'v1alpha1',
  versions: [{ name: 'v1alpha1', served: true, storage: true, additionalPrinterColumns: [] }],
  scope: 'Cluster',
  names: {
    plural: 'backupjobs',
    singular: 'backupjob',
    kind: 'BackupJob',
    listKind: 'BackupJobList',
  },
};

const mockCRD2 = new CRD({
  kind: 'CustomResourceDefinition',
  apiVersion: 'apiextensions.k8s.io/v1',
  metadata: {
    name: 'backupjobs.batch.example.com',
    uid: 'crd2-uid',
    creationTimestamp: new Date().toISOString(),
  },
  spec: mockCRD2Spec,
});

const mockAppConfigInstance1: KubeObjectInterface = {
  apiVersion: 'stable.example.com/v1',
  kind: 'AppConfig',
  metadata: {
    name: 'my-app-config',
    namespace: 'default',
    uid: 'cr1-uid',
    creationTimestamp: new Date().toISOString(),
  },
  spec: { settingA: 'valueA' },
};

const mockBackupJobInstance1: KubeObjectInterface = {
  apiVersion: 'batch.example.com/v1alpha1',
  kind: 'BackupJob',
  metadata: { name: 'daily-backup', uid: 'cr2-uid', creationTimestamp: new Date().toISOString() },
  spec: { schedule: '0 0 * * *' },
};

export default {
  title: 'crd/CustomResourceInstancesList (All CRs)',
  component: CrInstanceList,
  decorators: [
    Story => (
      <Provider store={store}>
        <BrowserRouter>
          <TestContext>
            <Story />
          </TestContext>
        </BrowserRouter>
      </Provider>
    ),
  ],
  parameters: {
    msw: {
      handlers: [
        http.get(
          'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
          () => {
            return HttpResponse.json({
              kind: 'CustomResourceDefinitionList',
              items: [mockCRD1.jsonData, mockCRD2.jsonData],
              metadata: {},
            });
          }
        ),
        http.get(
          'http://localhost:4466/apis/stable.example.com/v1/namespaces/:namespace/appconfigs',
          ({ params }) => {
            if (params.namespace === 'default') {
              return HttpResponse.json({
                kind: 'AppConfigList',
                items: [mockAppConfigInstance1],
                metadata: {},
              });
            }
            return HttpResponse.json({ kind: 'AppConfigList', items: [], metadata: {} });
          }
        ),
        http.get('http://localhost:4466/apis/stable.example.com/v1/appconfigs', () => {
          return HttpResponse.json({
            kind: 'AppConfigList',
            items: [mockAppConfigInstance1],
            metadata: {},
          });
        }),
        http.get('http://localhost:4466/apis/batch.example.com/v1alpha1/backupjobs', () => {
          return HttpResponse.json({
            kind: 'BackupJobList',
            items: [mockBackupJobInstance1],
            metadata: {},
          });
        }),
        http.get('/api/v1/namespaces/:namespace/events', () => {
          return HttpResponse.json({ kind: 'EventList', items: [], metadata: {} });
        }),
      ],
    },
  },
} as Meta<typeof CrInstanceList>;

const Template: StoryFn = args => <CrInstanceList {...args} />;

export const DefaultView = Template.bind({});
DefaultView.storyName = 'List All Custom Resource Instances';

export const OnlyOneCRDWithInstances = Template.bind({});
OnlyOneCRDWithInstances.parameters = {
  msw: {
    handlers: [
      http.get(
        'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
        () => {
          return HttpResponse.json({
            kind: 'CustomResourceDefinitionList',
            items: [mockCRD1.jsonData],
            metadata: {},
          });
        }
      ),
      http.get('http://localhost:4466/apis/stable.example.com/v1/appconfigs', () => {
        return HttpResponse.json({
          kind: 'AppConfigList',
          items: [mockAppConfigInstance1],
          metadata: {},
        });
      }),
    ],
  },
};

export const NoInstancesForAnyCRD = Template.bind({});
NoInstancesForAnyCRD.parameters = {
  msw: {
    handlers: [
      http.get(
        'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
        () => {
          return HttpResponse.json({
            kind: 'CustomResourceDefinitionList',
            items: [mockCRD1.jsonData, mockCRD2.jsonData],
            metadata: {},
          });
        }
      ),
      http.get('http://localhost:4466/apis/stable.example.com/v1/appconfigs', () => {
        return HttpResponse.json({ kind: 'AppConfigList', items: [], metadata: {} });
      }),
      http.get('http://localhost:4466/apis/batch.example.com/v1alpha1/backupjobs', () => {
        return HttpResponse.json({ kind: 'BackupJobList', items: [], metadata: {} });
      }),
    ],
  },
};
NoInstancesForAnyCRD.storyName = 'No Instances Found';

export const ErrorLoadingCRDs = Template.bind({});
ErrorLoadingCRDs.parameters = {
  msw: {
    handlers: [
      http.get(
        'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
        () => {
          return HttpResponse.json({ message: 'Failed to fetch CRDs' }, { status: 500 });
        }
      ),
    ],
  },
};

export const ErrorLoadingSomeInstances = Template.bind({});
ErrorLoadingSomeInstances.parameters = {
  msw: {
    handlers: [
      http.get(
        'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
        () => {
          return HttpResponse.json({
            kind: 'CustomResourceDefinitionList',
            items: [mockCRD1.jsonData, mockCRD2.jsonData],
            metadata: {},
          });
        }
      ),
      http.get('http://localhost:4466/apis/stable.example.com/v1/appconfigs', () => {
        return HttpResponse.json({
          kind: 'AppConfigList',
          items: [mockAppConfigInstance1],
          metadata: {},
        });
      }),
      http.get('http://localhost:4466/apis/batch.example.com/v1alpha1/backupjobs', () => {
        return HttpResponse.json({ message: 'Failed to fetch BackupJobs' }, { status: 500 });
      }),
    ],
  },
};
ErrorLoadingSomeInstances.storyName = 'Error Loading Instances for Some CRDs';

export const NoCRDsDefined = Template.bind({});
NoCRDsDefined.parameters = {
  msw: {
    handlers: [
      http.get(
        'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
        () => {
          return HttpResponse.json({
            kind: 'CustomResourceDefinitionList',
            items: [], // No CRDs
            metadata: {},
          });
        }
      ),
    ],
  },
};
