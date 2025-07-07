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

import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItem, { ListItemProps } from '@mui/material/ListItem';
import React, { memo } from 'react';
import { generatePath } from 'react-router';
import { formatClusterPathParam, getClusterPrefixedPath } from '../../lib/cluster';
import { useSelectedClusters } from '../../lib/k8s';
import { createRouteURL, getRoute } from '../../lib/router';
import ListItemLink from './ListItemLink';
import { SidebarEntry } from './sidebarSlice';

export function getFullURLOnRoute(
  name: string,
  isCR: boolean | undefined,
  subList: Omit<SidebarItemProps, 'sidebar'>[]
) {
  let routeName = name;
  if (isCR) {
    if (name.startsWith('group-')) {
      routeName = subList.length > 0 ? subList[0].name : '';
    }
    return createRouteURL('customresources', { crd: routeName });
  } else {
    if (!getRoute(name)) {
      routeName = subList.length > 0 ? subList[0].name : '';
    }
    return createRouteURL(routeName);
  }
}

/**
 * Adds onto SidebarEntryProps for the display of the sidebars.
 */
export interface SidebarItemProps extends ListItemProps, SidebarEntry {
  /** Whether this item is selected. */
  isSelected?: boolean;
  /** The navigation is a child. */
  hasParent?: boolean;
  /** Displayed wide with icon and text, otherwise with just a small icon. */
  fullWidth?: boolean;
  /** Search part of the URL. */
  search?: string;
  /** If a menu item has sub menu items, they will be in here. */
  subList?: Omit<this, 'sidebar'>[];
  /** Whether to hide the sidebar item. */
  hide?: boolean;
  level?: number;
  isCR?: boolean;
}

const SidebarItem = memo((props: SidebarItemProps) => {
  const {
    label,
    name,
    subtitle,
    url = null,
    search,
    useClusterURL = false,
    subList = [],
    isSelected,
    hasParent = false,
    level = 0,
    icon,
    fullWidth = true,
    hide,
    tabIndex,
    isCR,
    ...other
  } = props;
  const clusters = useSelectedClusters();
  let fullURL = url;
  if (fullURL && useClusterURL && clusters.length) {
    fullURL = generatePath(getClusterPrefixedPath(url), {
      cluster: clusters.length ? formatClusterPathParam(clusters) : '',
    });
  }

  if (!fullURL) {
    fullURL = getFullURLOnRoute(name, isCR, subList);
  }

  return hide ? null : (
    <React.Fragment>
      <ListItemLink
        selected={isSelected}
        pathname={fullURL || ''}
        primary={fullWidth ? label : ''}
        icon={icon}
        name={label}
        subtitle={subtitle}
        search={search}
        iconOnly={!fullWidth}
        tabIndex={tabIndex}
        hasParent={hasParent}
        level={level}
        fullWidth={fullWidth}
        {...other}
      />
      {subList.length > 0 && (
        <ListItem
          sx={{
            padding: 0,
          }}
        >
          <Collapse in={fullWidth && isSelected} sx={{ width: '100%' }}>
            <List
              component="ul"
              disablePadding
              sx={{
                '& .MuiListItem-root': {
                  fontSize: '.875rem',
                  paddingTop: '2px',
                  paddingBottom: '2px',
                },
              }}
            >
              {subList.map((item: SidebarItemProps) => (
                <SidebarItem
                  key={item.name}
                  isSelected={item.isSelected}
                  hasParent
                  level={level + 1}
                  search={search}
                  {...item}
                />
              ))}
            </List>
          </Collapse>
        </ListItem>
      )}
    </React.Fragment>
  );
});

export default SidebarItem;
