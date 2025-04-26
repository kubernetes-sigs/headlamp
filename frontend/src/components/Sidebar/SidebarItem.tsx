import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItem, { ListItemProps } from '@mui/material/ListItem';
import React, { memo } from 'react';
import { generatePath } from 'react-router';
import { getClusterPrefixedPath } from '../../lib/cluster';
import { useSelectedClusters } from '../../lib/k8s';
import { createRouteURL, getRoute } from '../../lib/router';
import ListItemLink from './ListItemLink';
import { SidebarEntry } from './sidebarSlice';

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
    icon,
    fullWidth = true,
    hide,
    ...other
  } = props;
  const clusters = useSelectedClusters();
  let fullURL = url;
  if (fullURL && useClusterURL && clusters.length) {
    fullURL = generatePath(getClusterPrefixedPath(url), {
      cluster: clusters.length ? clusters.join('+') : '',
    });
  }

  if (!fullURL) {
    let routeName = name;
    if (!getRoute(name)) {
      routeName = subList.length > 0 ? subList[0].name : '';
    }
    fullURL = createRouteURL(routeName);
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
        hasParent={hasParent}
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
