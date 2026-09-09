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

import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import { MRT_TableInstance } from 'material-react-table';
import { useId, useState } from 'react';

export function ColumnVisibilityButton<T extends Record<string, any>>({
  table,
}: {
  table: MRT_TableInstance<T>;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const isOpen = !!anchorEl;
  const {
    icons: { ViewColumnIcon },
    localization,
  } = table.options;

  const columns = table
    .getAllLeafColumns()
    .filter(
      col =>
        col.columnDef.enableHiding !== false &&
        col.columnDef.visibleInShowHideMenu !== false &&
        col.columnDef.columnDefType !== 'display'
    );
  const hideableColumns = columns.filter(col => col.getCanHide());
  const hasVisibleHideableColumns = hideableColumns.some(col => col.getIsVisible());
  const hasHiddenHideableColumns = hideableColumns.some(col => !col.getIsVisible());

  const handleToggleAll = (visible: boolean) => {
    hideableColumns.forEach(col => col.toggleVisibility(visible));
  };

  return (
    <>
      <Tooltip title={localization.showHideColumns}>
        <IconButton
          aria-label={localization.showHideColumns}
          aria-haspopup="menu"
          aria-expanded={isOpen || undefined}
          aria-controls={isOpen ? menuId : undefined}
          onClick={event => setAnchorEl(event.currentTarget)}
        >
          <ViewColumnIcon />
        </IconButton>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={isOpen}
        onClose={() => setAnchorEl(null)}
        disableScrollLock
      >
        <MenuItem disabled={!hasVisibleHideableColumns} onClick={() => handleToggleAll(false)}>
          {localization.hideAll}
        </MenuItem>
        <MenuItem disabled={!hasHiddenHideableColumns} onClick={() => handleToggleAll(true)}>
          {localization.showAll}
        </MenuItem>
        <Divider />
        {columns.map(column => (
          <MenuItem
            key={column.id}
            role="menuitemcheckbox"
            aria-checked={column.getIsVisible()}
            disabled={!column.getCanHide()}
            onClick={() => column.toggleVisibility()}
          >
            <Switch
              size="small"
              checked={column.getIsVisible()}
              readOnly
              tabIndex={-1}
              inputProps={{ 'aria-hidden': true, tabIndex: -1 }}
              edge="start"
              sx={{ mr: 1, pointerEvents: 'none' }}
            />
            <ListItemText>{column.columnDef.header}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
