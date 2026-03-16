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

import { Box, Paper, Typography } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { TestContext } from '../../test';
import InnerTable from './InnerTable';
import { SimpleTableProps } from './SimpleTable';

interface InnerTableStoryProps extends SimpleTableProps {}

export default {
  title: 'common/InnerTable',
  component: InnerTable,
  decorators: [
    Story => (
      <TestContext>
        <Paper elevation={3} sx={{ padding: 2, margin: 2, maxWidth: '800px' }}>
          <Typography variant="h6" gutterBottom>
            Outer Container Title
          </Typography>
          <Story />
        </Paper>
      </TestContext>
    ),
  ],
  argTypes: {
    columns: { control: 'object', description: 'Array of column definitions.' },
    data: { control: 'object', description: 'Array of data objects for the table rows.' },
    emptyMessage: { control: 'text' },
    noTableHeader: { control: 'boolean' },
  },
} as Meta<typeof InnerTable>;

const Template: StoryFn<InnerTableStoryProps> = args => <InnerTable {...args} />;

const sampleData = [
  { id: 1, name: 'Feature A', status: 'Enabled', priority: 'High' },
  { id: 2, name: 'Feature B', status: 'Disabled', priority: 'Medium' },
  { id: 3, name: 'Bug Fix C', status: 'In Progress', priority: 'High' },
];

const sampleColumns = [
  {
    label: 'ID',
    datum: 'id',
  },
  {
    label: 'Name',
    datum: 'name',
  },
  {
    label: 'Status',
    datum: 'status',
  },
  {
    label: 'Priority',
    datum: 'priority',
  },
];

export const Default = Template.bind({});
Default.args = {
  columns: sampleColumns,
  data: sampleData,
};
Default.storyName = 'Basic Inner Table';

export const WithFewRows = Template.bind({});
WithFewRows.args = {
  columns: sampleColumns,
  data: [{ id: 1, name: 'Single Item', status: 'Active', priority: 'Low' }],
};

export const EmptyTable = Template.bind({});
EmptyTable.args = {
  columns: sampleColumns,
  data: [],
  emptyMessage: 'No inner data available.',
};

export const WithoutTableHeader = Template.bind({});
WithoutTableHeader.args = {
  columns: sampleColumns,
  data: sampleData.slice(0, 2),
  noTableHeader: true,
};

export const InsideAnotherComponent = () => (
  <Box sx={{ border: '1px dashed grey', padding: 2 }}>
    <Typography variant="subtitle1">Section Containing InnerTable</Typography>
    <InnerTable
      columns={[
        { label: 'Key', datum: 'key' },
        { label: 'Value', datum: 'value' },
      ]}
      data={[
        { key: 'config_option_1', value: 'true' },
        { key: 'config_option_2', value: '12345' },
      ]}
    />
  </Box>
);
InsideAnotherComponent.storyName = 'Nested within a Box';
