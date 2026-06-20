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
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem, { type ListItemProps } from '@mui/material/ListItem';
import ListSubheader from '@mui/material/ListSubheader';
import type { SxProps, Theme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import React, { memo } from 'react';
import { generatePath } from 'react-router';
import { formatClusterPathParam, getClusterPrefixedPath } from '../../lib/cluster';
import { useSelectedClusters } from '../../lib/k8s';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { getRoute } from '../../lib/router/getRoute';
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

const SidebarItemBase = memo((props: SidebarItemProps & { clusters?: string[] }) => {
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
    entryType = 'link',
    sx,
    clusters = [],
    ...other
  } = props;

  if (hide) {
    return null;
  }

  if (entryType === 'subheader') {
    const sidebarColor = (theme: Theme) =>
      theme.palette.sidebar.color ??
      theme.palette.getContrastText(theme.palette.sidebar.background);

    if (!fullWidth) {
      return (
        <Divider
          component="li"
          sx={theme => ({
            borderColor: alpha(sidebarColor(theme), 0.15),
            listStyle: 'none',
            margin: theme.spacing(1, 2),
          })}
        />
      );
    }

    const subheaderSx: SxProps<Theme> = [
      theme => ({
        backgroundColor: 'transparent',
        color: alpha(sidebarColor(theme), 0.6),
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        lineHeight: 1.5,
        minHeight: 0,
        overflow: 'hidden',
        padding: theme.spacing(1.5, 2, 0.5),
        textOverflow: 'ellipsis',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }),
      ...(sx ? (Array.isArray(sx) ? sx : [sx]) : []),
    ];

    return (
      <React.Fragment>
        <ListSubheader disableSticky sx={subheaderSx}>
          {label}
        </ListSubheader>
        {subList.length > 0 && (
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
                fullWidth={fullWidth}
                search={search}
                tabIndex={tabIndex}
                {...item}
              />
            ))}
          </List>
        )}
      </React.Fragment>
    );
  }

  let fullURL = url;
  if (fullURL && useClusterURL && clusters.length && !fullURL.startsWith('http')) {
    fullURL = generatePath(getClusterPrefixedPath(url), {
      cluster: clusters.length ? formatClusterPathParam(clusters) : '',
    });
  }

  if (!fullURL) {
    fullURL = getFullURLOnRoute(name, isCR, subList);
  }

  return (
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
        <Collapse component="li" in={fullWidth && isSelected} sx={{ width: '100%' }} unmountOnExit>
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
      )}
    </React.Fragment>
  );
});

const SidebarItemWithCluster = memo((props: SidebarItemProps) => {
  const clusters = useSelectedClusters();
  return <SidebarItemBase {...props} clusters={clusters} />;
});

const SidebarItem = memo((props: SidebarItemProps) => {
  if (props.useClusterURL) {
    return <SidebarItemWithCluster {...props} />;
  }
  return <SidebarItemBase {...props} />;
});

export default SidebarItem;
