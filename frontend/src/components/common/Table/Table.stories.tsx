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
import { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { useFilterFunc } from '../../../lib/util';
import { TestContext, TestContextProps } from '../../../test';
import SectionFilterHeader from '../SectionFilterHeader';
import Table, { TableProps } from './Table';

export default {
  title: 'Table',
  component: Table,
  argTypes: {},
  parameters: {
    actions: {
      disable: true,
    },
  },
} as Meta;

function TestSimpleTable(props: TableProps<any>) {
  const location = useLocation();
  if (!!props.reflectInURL) {
    return (
      <Box>
        <Typography>Test changing the page and rows per page.</Typography>
        <Typography>
          <b>Current URL search:</b> {`${location.search || ''}`}
        </Typography>
        <Table {...props} />
      </Box>
    );
  }

  return <Table {...props} />;
}

const Template: StoryFn<TableProps<any>> = args => (
  <TestContext>
    <TestSimpleTable {...args} />
  </TestContext>
);

const fixtureData = {
  rowsPerPage: [15, 25, 50],
  errorMessage: null,
  columns: [
    {
      header: 'Name',
      accessorKey: 'name',
    },
    {
      header: 'Status',
      accessorKey: 'status',
    },
    {
      header: 'Age',
      accessorKey: 'age',
    },
    {
      header: 'Long Field Name',
      accessorKey: 'longField',
    },
    {
      header: 'Number',
      accessorKey: 'number',
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
      header: 'Name',
      // accessorKey: "",
      accessorFn: (row: any) => row.name,
    },
    {
      header: 'Status',
      // accessorKey: "",
      accessorFn: (row: any) => row.status,
    },
    {
      header: 'Age',
      // accessorKey: "",
      accessorFn: (row: any) => row.age,
    },
    {
      header: 'Long Field Name',
      // accessorKey: "",
      accessorFn: (row: any) => row.longField,
    },
    {
      header: 'Number',
      // accessorKey: "",
      accessorFn: (row: any) => row.number,
    },
  ],
};

export const Datum = Template.bind({});
Datum.args = {
  ...fixtureData,
  columns: [
    {
      header: 'Name',
      accessorKey: 'name',
    },
    {
      header: 'Status',
      accessorKey: 'status',
    },
    {
      header: 'Age',
      accessorKey: 'age',
    },
    {
      header: 'Long Field Name',
      accessorKey: 'longField',
    },
  ],
};

const TemplateWithURLReflection: StoryFn<{
  tableProps: TableProps<any>;
  testContextProps: TestContextProps;
}> = args => {
  const { testContextProps, tableProps } = args;
  return (
    <TestContext {...testContextProps}>
      <TestSimpleTable {...tableProps} />
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
  tableProps: {
    data: lotsOfData,
    columns: [
      {
        header: 'Name',
        accessorKey: 'name',
      },
      {
        header: 'Namespace',
        accessorKey: 'namespace',
      },
      {
        header: 'Number',
        accessorKey: 'number',
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
  tableProps: {
    data: lotsOfData,
    columns: [
      {
        header: 'Name',
        accessorKey: 'name',
      },
      {
        header: 'Namespace',
        accessorKey: 'namespace',
      },
      {
        header: 'Number',
        accessorKey: 'creationDate',
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

type TableWithFilterProps = TableProps<any> & { matchCriteria?: string[] };
function TableWithFilter(props: TableWithFilterProps) {
  const { matchCriteria, ...otherProps } = props;
  const filterFunc = useFilterFunc(matchCriteria);
  return <Table<any> filterFunction={filterFunc} {...otherProps} />;
}

const TemplateWithFilter: StoryFn<{
  tableArgs: TableWithFilterProps;
  namespaces: string[];
  search: string;
}> = args => {
  const { tableArgs: simpleTableArgs, search, namespaces = [] } = args;

  const storeWithFilterAndSettings = configureStore({
    reducer: (
      state = {
        filter: { namespaces: new Set<string>(), search: '' },
        config: { settings: { tableRowsPerPageOptions: [10, 20, 50, 100] } },
      }
    ) => state,
    preloadedState: {
      filter: {
        namespaces: new Set(namespaces),
        search,
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
      <TableWithFilter {...simpleTableArgs} />
    </TestContext>
  );
};

const podData: TableProps<any> = {
  rowsPerPage: [15, 25, 50],
  errorMessage: null,
  columns: [
    {
      header: 'Name',
      accessorFn: (item: KubeObjectInterface) => item.metadata.name,
    },
    {
      header: 'Namespace',
      accessorFn: (item: KubeObjectInterface) => item.metadata.namespace,
    },
    {
      header: 'UID',
      accessorFn: (item: KubeObjectInterface) => item.metadata.uid,
    },
    {
      header: 'Labels',
      accessorFn: (item: KubeObjectInterface) => JSON.stringify(item.metadata.labels),
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
  // defaultSortingColumn: 1,
};

export const NameSearch = TemplateWithFilter.bind({});
NameSearch.args = {
  tableArgs: podData,
  search: 'phonyresources2',
};

export const NamespaceSearch = TemplateWithFilter.bind({});
NamespaceSearch.args = {
  tableArgs: podData,
  search: 'MyNamespace3',
};

export const UIDSearch = TemplateWithFilter.bind({});
UIDSearch.args = {
  tableArgs: podData,
  search: 'phony0',
};

export const LabelSearch = TemplateWithFilter.bind({});
LabelSearch.args = {
  tableArgs: podData,
  search: 'mylabel',
};

export const NamespaceSelect = TemplateWithFilter.bind({});
NamespaceSelect.args = {
  tableArgs: podData,
  namespaces: ['MyNamespace0', 'MyNamespace1'],
};

export const NumberSearch = TemplateWithFilter.bind({});
NumberSearch.args = {
  tableArgs: {
    ...podData,
    matchCriteria: ['.someNumber'],
    columns: [
      {
        header: 'Name',
        accessorFn: (item: KubeObjectInterface) => item.metadata.name,
      },
      {
        header: 'Namespace',
        accessorFn: (item: KubeObjectInterface) => item.metadata.namespace,
      },
      {
        header: 'Number',
        accessorKey: 'someNumber',
      },
    ],
  },
  search: '30',
};

export const NotFoundMessage = TemplateWithFilter.bind({});
NotFoundMessage.args = {
  tableArgs: podData,
  search: 'somethingthatsnotapossiblematch123',
};

export const WithGlobalFilter = Template.bind({});
WithGlobalFilter.args = {
  ...podData,
  initialState: {
    globalFilter: 'value1',
    showGlobalFilter: true,
  },
};

export const WithSorting = Template.bind({});
WithSorting.args = {
  ...podData,
  initialState: {
    sorting: [{ id: '0', desc: true }],
  },
};

export const WithFilterMultiSelect = Template.bind({});
WithFilterMultiSelect.args = {
  ...podData,
  enableFacetedValues: true,
  columns: [
    {
      id: '0',
      header: 'Name',
      accessorFn: (item: KubeObjectInterface) => item.metadata.name,
    },
    {
      id: '1',
      header: 'Namespace',
      accessorFn: (item: KubeObjectInterface) => item.metadata.namespace,
      filterVariant: 'multi-select',
    },
  ],
};
