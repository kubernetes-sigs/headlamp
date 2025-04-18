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

import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { createStore } from 'redux';
import { useMockListQuery } from '../../../helpers/testHelpers';
import Pod, { KubePod } from '../../../lib/k8s/pod';
import reducers from '../../../redux/reducers/reducers';
import { INITIAL_STATE as UI_INITIAL_STATE } from '../../../redux/reducers/ui';
import { TestContext } from '../../../test';
import ResourceTable, { ResourceTableFromResourceClassProps } from './ResourceTable';

const store = createStore(reducers);

export default {
  title: 'ResourceTable',
  component: ResourceTable,
  decorators: [
    Story => (
      <Provider store={store}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </Provider>
    ),
  ],
  argTypes: {},
} as Meta;

const TemplateWithFilter: StoryFn<{
  resourceTableArgs: ResourceTableFromResourceClassProps<typeof MyPod>;
  namespaces: string[];
  search: string;
}> = args => {
  const { resourceTableArgs, search, namespaces = [] } = args;

  const storeWithFilterAndSettings = configureStore({
    reducer: (
      state = {
        filter: { namespaces: new Set<string>(), search: '' },
        config: { settings: { tableRowsPerPageOptions: [10, 20, 50, 100] } },
        ui: UI_INITIAL_STATE,
        drawerMode: { isDetailDrawerEnabled: false },
      }
    ) => state,
    preloadedState: {
      ui: UI_INITIAL_STATE,
      filter: {
        namespaces: new Set(namespaces),
        search,
      },
      config: {
        settings: {
          tableRowsPerPageOptions: [10, 20, 50, 100],
        },
      },
      resourceTable: {
        tableColumnsProcessors: [],
      },
      drawerMode: { isDetailDrawerEnabled: false },
    },
  });

  return (
    <TestContext store={storeWithFilterAndSettings}>
      <ResourceTable {...resourceTableArgs} />
    </TestContext>
  );
};

class MyPod extends Pod {
  static useList = useMockListQuery.data(
    [
      {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: {
          name: 'mypod0',
          uid: 'phony0',
          creationTimestamp: '2021-12-15T14:57:13Z',
          resourceVersion: '1',
          selfLink: '0',
          namespace: 'MyNamespace0',
        },
      },
      {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: {
          name: 'mypod1',
          uid: 'phony1',
          creationTimestamp: '2021-12-15T14:57:13Z',
          resourceVersion: '1',
          selfLink: '1',
          namespace: 'MyNamespace1',
          labels: {
            mylabel1: 'myvalue1',
          },
        },
      },
      {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: {
          name: 'mypod2',
          uid: 'phony2',
          creationTimestamp: '2021-12-15T14:57:13Z',
          resourceVersion: '1',
          selfLink: '2',
          namespace: 'MyNamespace2',
          labels: {
            mykey2: 'mylabel',
          },
        },
      },
      {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: {
          name: 'mypod3',
          uid: 'phony3',
          creationTimestamp: '2021-12-15T14:57:13Z',
          resourceVersion: '1',
          selfLink: '3',
          namespace: 'MyNamespace3',
          labels: {
            mykey3: 'myvalue3',
          },
        },
      },
    ].map(pod => new Pod(pod as KubePod))
  );
}

const podData: ResourceTableFromResourceClassProps<typeof MyPod> = {
  columns: ['name', 'namespace', 'age'],
  resourceClass: MyPod,
};

const withHiddenCols: ResourceTableFromResourceClassProps<typeof MyPod> = {
  columns: [
    'name',
    'namespace',
    {
      label: 'UID',
      getValue: pod => pod.metadata.uid,
      show: false,
    },
    'age',
  ],
  resourceClass: MyPod,
  hideColumns: ['namespace'],
};

export const NoFilter = TemplateWithFilter.bind({});
NoFilter.args = {
  resourceTableArgs: podData,
  search: '',
};

export const NameSearch = TemplateWithFilter.bind({});
NameSearch.args = {
  resourceTableArgs: podData,
  search: 'mypod3',
};

export const WithHiddenCols = TemplateWithFilter.bind({});
WithHiddenCols.args = {
  resourceTableArgs: withHiddenCols,
  search: '',
};
