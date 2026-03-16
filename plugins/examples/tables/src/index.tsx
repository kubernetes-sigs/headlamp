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

import { registerResourceTableColumnsProcessor } from '@kinvolk/headlamp-plugin/lib';
import { ActionButton, ResourceTableColumn } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Pod from '@kinvolk/headlamp-plugin/lib/K8s/pod';
import { Menu, MenuItem, Typography } from '@mui/material';
import React from 'react';
import { useHistory } from 'react-router-dom';

export interface ContextMenuProps {
  detailsLink: string;
}

/**
 * Will show a 3-dot menu with two options: Details and Delete.
 */
export function ContextMenu(props: ContextMenuProps) {
  const { detailsLink } = props;
  const [anchorEl, setAnchorEl] = React.useState(null);
  const history = useHistory();

  function openMenu(event: any) {
    setAnchorEl(event.currentTarget);
  }

  function handleClose() {
    setAnchorEl(null);
  }

  return (
    <>
      <ActionButton
        description="Open pod context menu"
        icon="mdi:dots-vertical"
        onClick={openMenu}
      />
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        <MenuItem
          onClick={() => {
            history.push(detailsLink);
          }}
        >
          <Typography>Details</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            alert('Boom! Pod deleted! (just kidding)');
            handleClose();
          }}
        >
          <Typography>Delete</Typography>
        </MenuItem>
      </Menu>
    </>
  );
}

// Add a context menu to the pods table.
// You can see it by going to the pods list view: there will be a 3-dot menu for every row.
registerResourceTableColumnsProcessor(function setupContextMenuForPodsList({ id, columns }) {
  // Not checking for the table ID will add the context menu to all resource tables.
  // How do you find the table id? They follow a convention: headlamp-${name} where `name` will
  // be the plural name of the resource if this table is representing a resource's list view,
  // or it will be the section/role of that table.
  // For example, the pods list view's table has its ID as `headlamp-pods` and the namespaces list view
  // has it as `headlamp-namespaces`. The events table in the cluster overview has a table ID of
  // `headlamp-cluster.overview.events`.
  //
  // So for figuring out which exact ID a table you want to modify has, it's best to list the ID in
  // a processor function and verify that you're using the ID for the right table, during development.
  //
  // Plugins can use their own IDs (with their own prefixes) for tables.
  if (id === 'headlamp-pods') {
    const podColumns = columns as ResourceTableColumn<Pod>[];
    podColumns.push({
      label: '',
      getValue: (pod: Pod) => pod.getDetailsLink(),
      render: (pod: Pod) => <ContextMenu detailsLink={pod.getDetailsLink()} />,
    });
  }

  return columns;
});
