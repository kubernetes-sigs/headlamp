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

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { useLocation } from 'react-router-dom';
import { KubeObjectInterface } from '../../lib/k8s/KubeObject';
import { useFilterFunc } from '../../lib/util';
import { TestContext, TestContextProps } from '../../test';
import SectionFilterHeader from './SectionFilterHeader';
import SimpleTable, { SimpleTableProps } from './SimpleTable';

export default {
  title: 'SimpleTable',
  component: SimpleTable,
  argTypes: {},
} as Meta;

function TestSimpleTable(props: SimpleTableProps) {
  const location = useLocation();
  if (!!props.reflectInURL) {
    return (
      <Box>
        <Typography>Test changing the page and rows per page.</Typography>
        <Typography>
          <b>Current URL search:</b> {`${location.search || ''}`}
        </Typography>
        <SimpleTable {...props} />
      </Box>
    );
  }

  return <SimpleTable {...props} />;
}

const Template: StoryFn<SimpleTableProps> = args => (
  <TestContext>
    <TestSimpleTable {...args} />
  </TestContext>
);

const fixtureData = {
  rowsPerPage: [15, 25, 50],
  errorMessage: null,
  columns: [
    {
      label: 'Name',
      datum: 'name',
    },
    {
      label: 'Status',
      datum: 'status',
    },
    {
      label: 'Age',
      datum: 'age',
    },
    {
      label: 'Long Field Name',
      datum: 'longField',
    },
    {
      label: 'Number',
      datum: 'number',
    },
  ],
  data: [
    {
      name: 'some name0',
      status: 'some status0',
      age: 'some age0',
      longField:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      number: '22',
    },
    {
      name: 'some name1',
      status: 'some status1',
      age: 'some age1',
      longField:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      number: '33',
    },
    {
      name: 'some name2',
      status: 'some status2',
      age: 'some age2',
      longField:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      number: '44',
    },
  ],
  defaultSortingColumn: 1,
};

export const Getter = Template.bind({});
Getter.args = {
  ...fixtureData,
  columns: [
    {
      label: 'Name',
      // datum: "",
      getter: (row: any) => row.name,
    },
    {
      label: 'Status',
      // datum: "",
      getter: (row: any) => row.status,
    },
    {
      label: 'Age',
      // datum: "",
      getter: (row: any) => row.age,
    },
    {
      label: 'Long Field Name',
      // datum: "",
      getter: (row: any) => row.longField,
    },
    {
      label: 'Number',
      // datum: "",
      getter: (row: any) => row.number,
    },
  ],
};

export const Datum = Template.bind({});
Datum.args = {
  ...fixtureData,
  columns: [
    {
      label: 'Name',
      datum: 'name',
    },
    {
      label: 'Status',
      datum: 'status',
    },
    {
      label: 'Age',
      datum: 'age',
    },
    {
      label: 'Long Field Name',
      datum: 'longField',
    },
  ],
};

const TemplateWithURLReflection: StoryFn<{
  simpleTableProps: SimpleTableProps;
  testContextProps: TestContextProps;
}> = args => {
  const { testContextProps, simpleTableProps } = args;
  return (
    <TestContext {...testContextProps}>
      <TestSimpleTable {...simpleTableProps} />
    </TestContext>
  );
};

export const ReflectInURL = TemplateWithURLReflection.bind({});
const lotsOfData = (() => {
  const data = [];
  for (let i = 0; i < 50; i++) {
    data.push({
      name: `Name ${i}`,
      namespace: `Namespace ${i}`,
      number: i,
    });
  }
  return data;
})();
ReflectInURL.args = {
  simpleTableProps: {
    data: lotsOfData,
    columns: [
      {
        label: 'Name',
        datum: 'name',
      },
      {
        label: 'Namespace',
        datum: 'namespace',
      },
      {
        label: 'Number',
        datum: 'number',
      },
    ],
    rowsPerPage: [5, 10, 15],
    reflectInURL: true,
  },
  testContextProps: {
    urlSearchParams: { p: '2' }, // 2nd page
  },
};

export const ReflectInURLWithPrefix = TemplateWithURLReflection.bind({});
ReflectInURLWithPrefix.args = {
  simpleTableProps: {
    data: lotsOfData,
    columns: [
      {
        label: 'Name',
        datum: 'name',
      },
      {
        label: 'Namespace',
        datum: 'namespace',
      },
      {
        label: 'Number',
        datum: 'creationDate',
      },
    ],
    rowsPerPage: [5, 10, 15],
    reflectInURL: 'mySuperTable',
  },
  testContextProps: {
    urlSearchParams: { p: '2' }, // 2nd page
  },
};

// filter Function

type SimpleTableWithFilterProps = SimpleTableProps & { matchCriteria?: string[]; search?: string };
function SimpleTableWithFilter(props: SimpleTableWithFilterProps) {
  const { matchCriteria, search, ...otherProps } = props;
  const filterFunc = useFilterFunc(matchCriteria);
  return <SimpleTable filterFunction={item => filterFunc(item, search)} {...otherProps} />;
}

const TemplateWithFilter: StoryFn<{
  simpleTableArgs: SimpleTableWithFilterProps;
  namespaces: string[];
  search?: string;
}> = args => {
  const { simpleTableArgs, namespaces = [], search } = args;

  const storeWithFilterAndSettings = configureStore({
    reducer: (
      state = {
        filter: { namespaces: new Set<string>() },
        config: { settings: { tableRowsPerPageOptions: [10, 20, 50, 100] } },
      }
    ) => state,
    preloadedState: {
      filter: {
        namespaces: new Set(namespaces),
      },
      config: {
        settings: {
          tableRowsPerPageOptions: [10, 20, 50, 100],
        },
      },
    },
  });

  return (
    <TestContext store={storeWithFilterAndSettings}>
      <SectionFilterHeader title="Test" />
      <SimpleTableWithFilter {...simpleTableArgs} search={search} />
    </TestContext>
  );
};

const podData = {
  rowsPerPage: [15, 25, 50],
  errorMessage: null,
  columns: [
    {
      label: 'Name',
      getter: (item: KubeObjectInterface) => item.metadata.name,
    },
    {
      label: 'Namespace',
      getter: (item: KubeObjectInterface) => item.metadata.namespace,
    },
    {
      label: 'UID',
      getter: (item: KubeObjectInterface) => item.metadata.uid,
    },
    {
      label: 'Labels',
      getter: (item: KubeObjectInterface) => JSON.stringify(item.metadata.labels),
    },
  ],
  data: [
    {
      kind: 'CustomResourceDefinition',
      apiVersion: 'apiextensions.k8s.io',
      metadata: {
        name: 'mydefinition.phonyresources0.io',
        uid: 'phony0',
        creationTimestamp: new Date('2021-12-15T14:57:13Z').toString(),
        resourceVersion: '1',
        selfLink: '0',
        namespace: 'MyNamespace0',
      },
      someNumber: 0,
    },
    {
      kind: 'CustomResourceDefinition',
      apiVersion: 'apiextensions.k8s.io',
      metadata: {
        name: 'mydefinition.phonyresources1.io',
        uid: 'phony1',
        creationTimestamp: new Date('2021-12-15T14:57:13Z').toString(),
        resourceVersion: '1',
        selfLink: '1',
        namespace: 'MyNamespace1',
        labels: {
          mylabel1: 'myvalue1',
        },
      },
      someNumber: 10,
    },
    {
      kind: 'CustomResourceDefinition',
      apiVersion: 'apiextensions.k8s.io',
      metadata: {
        name: 'mydefinition.phonyresources2.io',
        uid: 'phony2',
        creationTimestamp: new Date('2021-12-15T14:57:13Z').toString(),
        resourceVersion: '1',
        selfLink: '2',
        namespace: 'MyNamespace2',
        labels: {
          mykey2: 'mylabel',
        },
      },
      someNumber: 20,
    },
    {
      kind: 'CustomResourceDefinition',
      apiVersion: 'apiextensions.k8s.io',
      metadata: {
        name: 'mydefinition.phonyresources3.io',
        uid: 'phony3',
        creationTimestamp: new Date('2021-12-15T14:57:13Z').toString(),
        resourceVersion: '1',
        selfLink: '3',
        namespace: 'MyNamespace3',
        labels: {
          mykey3: 'myvalue3',
        },
      },
      someNumber: 30,
    },
  ],
  defaultSortingColumn: 1,
};

export const NameSearch = TemplateWithFilter.bind({});
NameSearch.args = {
  simpleTableArgs: podData,
  search: 'phonyresources2',
};

export const NamespaceSearch = TemplateWithFilter.bind({});
NamespaceSearch.args = {
  simpleTableArgs: podData,
  search: 'MyNamespace3',
};

export const UIDSearch = TemplateWithFilter.bind({});
UIDSearch.args = {
  simpleTableArgs: podData,
  search: 'phony0',
};

export const LabelSearch = TemplateWithFilter.bind({});
LabelSearch.args = {
  simpleTableArgs: podData,
  search: 'mylabel',
};

export const NamespaceSelect = TemplateWithFilter.bind({});
NamespaceSelect.args = {
  simpleTableArgs: podData,
  namespaces: ['MyNamespace0', 'MyNamespace1'],
};

export const NumberSearch = TemplateWithFilter.bind({});
NumberSearch.args = {
  simpleTableArgs: {
    ...podData,
    matchCriteria: ['.someNumber'],
    columns: [
      {
        label: 'Name',
        getter: (item: KubeObjectInterface) => item.metadata.name,
      },
      {
        label: 'Namespace',
        getter: (item: KubeObjectInterface) => item.metadata.namespace,
      },
      {
        label: 'Number',
        datum: 'someNumber',
      },
    ],
  },
  search: '30',
};

export const NotFoundMessage = TemplateWithFilter.bind({});
NotFoundMessage.args = {
  simpleTableArgs: podData,
  search: 'somethingthatsnotapossiblematch123',
};

// emptyMessage
// defaultSortingColumn
// rowsPerPage
// errorMessage
