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

import Button from '@mui/material/Button';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { TestContext } from '../../../test';
import { ResourceTableColumn } from './ResourceTable';
import ColumnsPopup from './ResourceTableColumnChooser';

export default {
  title: 'Resource/ResourceTableColumnChooser',
  component: ColumnsPopup,
  argTypes: {
    onToggleColumn: { action: 'column toggled' },
    onClose: { action: 'closed' },
  },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

interface ColumnsPopupWithAnchorProps {
  columns: ResourceTableColumn<any>[];
  onToggleColumn: (cols: ResourceTableColumn<any>[]) => void;
  onClose: () => void;
  startOpen?: boolean;
}

function ColumnsPopupWithAnchor(props: ColumnsPopupWithAnchorProps) {
  const { columns: initialColumns, onToggleColumn, onClose, startOpen = true } = props;
  const [columns, setColumns] = React.useState(initialColumns);
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (startOpen && buttonRef.current) {
      setAnchorEl(buttonRef.current);
    }
  }, [startOpen]);

  const handleClose = () => {
    setAnchorEl(null);
    onClose();
  };
  const handleToggleColumn = (newColumns: ResourceTableColumn<any>[]) => {
    setColumns(newColumns);
    onToggleColumn(newColumns);
  };
  return (
    <>
      <Button ref={buttonRef} variant="outlined" onClick={e => setAnchorEl(e.currentTarget)}>
        Choose Columns
      </Button>
      <ColumnsPopup
        columns={columns}
        onToggleColumn={handleToggleColumn}
        onClose={handleClose}
        anchorEl={anchorEl}
      />
    </>
  );
}

const Template: StoryFn<ColumnsPopupWithAnchorProps> = args => <ColumnsPopupWithAnchor {...args} />;

const defaultColumns: ResourceTableColumn<any>[] = [
  { id: 'name', label: 'Name', show: true, getValue: item => item.name },
  { id: 'namespace', label: 'Namespace', show: true, getValue: item => item.namespace },
  { id: 'age', label: 'Age', show: true, getValue: item => item.age },
  { id: 'status', label: 'Status', show: false, getValue: item => item.status },
  { id: 'labels', label: 'Labels', show: false, getValue: item => item.labels },
];

const defaultArgs = {
  columns: defaultColumns,
  startOpen: true,
};

// Column list with checkboxes - some visible, some hidden
export const Default = Template.bind({});
Default.args = {
  ...defaultArgs,
};

// All columns selected
export const AllColumnsVisible = Template.bind({});
AllColumnsVisible.args = {
  ...defaultArgs,
  columns: [
    { id: 'name', label: 'Name', show: true, getValue: item => item.name },
    { id: 'namespace', label: 'Namespace', show: true, getValue: item => item.namespace },
    { id: 'age', label: 'Age', show: true, getValue: item => item.age },
    { id: 'status', label: 'Status', show: true, getValue: item => item.status },
    { id: 'labels', label: 'Labels', show: true, getValue: item => item.labels },
  ],
};

// All columns deselected
export const AllColumnsHidden = Template.bind({});
AllColumnsHidden.args = {
  ...defaultArgs,
  columns: [
    { id: 'name', label: 'Name', show: false, getValue: item => item.name },
    { id: 'namespace', label: 'Namespace', show: false, getValue: item => item.namespace },
    { id: 'age', label: 'Age', show: false, getValue: item => item.age },
    { id: 'status', label: 'Status', show: false, getValue: item => item.status },
    { id: 'labels', label: 'Labels', show: false, getValue: item => item.labels },
  ],
};

// Many columns to allow scrolling
export const ManyColumns = Template.bind({});
ManyColumns.args = {
  ...defaultArgs,
  columns: [
    { id: 'name', label: 'Name', show: true, getValue: () => '' },
    { id: 'namespace', label: 'Namespace', show: true, getValue: () => '' },
    { id: 'age', label: 'Age', show: true, getValue: () => '' },
    { id: 'status', label: 'Status', show: true, getValue: () => '' },
    { id: 'ready', label: 'Ready', show: false, getValue: () => '' },
    { id: 'restarts', label: 'Restarts', show: false, getValue: () => '' },
    { id: 'node', label: 'Node', show: false, getValue: () => '' },
    { id: 'ip', label: 'IP', show: false, getValue: () => '' },
    { id: 'labels', label: 'Labels', show: false, getValue: () => '' },
    { id: 'annotations', label: 'Annotations', show: false, getValue: () => '' },
  ],
};

// Popover closed state
export const Closed = Template.bind({});
Closed.args = {
  ...defaultArgs,
  startOpen: false,
};
