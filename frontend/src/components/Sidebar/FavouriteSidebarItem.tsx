import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import React, { memo, useState } from 'react';
import { generatePath } from 'react-router';
import { Link as RouterLink, LinkProps as RouterLinkProps } from 'react-router-dom';
import { getClusterPrefixedPath } from '../../lib/cluster';
import { useCluster } from '../../lib/k8s';
import { createRouteURL, getRoute } from '../../lib/router';
import ListItemLink from './ListItemLink';
import SidebarItem, { SidebarItemProps } from './SidebarItem';

export const FavouriteSidebarItem = memo((props: SidebarItemProps) => {
  const {
    label,
    name,
    subtitle,
    url = null,
    search,
    useClusterURL = false,
    subList = [],
    hasParent = false,
    icon,
    fullWidth = true,
    hide,
    ...other
  } = props;
  // isSelected
  const cluster = useCluster();

  let fullURL = url;
  if (fullURL && useClusterURL && cluster) {
    fullURL = generatePath(getClusterPrefixedPath(url), { cluster });
  }

  if (!fullURL) {
    let routeName = name;
    if (!getRoute(name)) {
      routeName = subList.length > 0 ? subList[0].name : '';
    }
    fullURL = createRouteURL(routeName);
  }

  const [open, setOpen] = useState(false);

  const renderLink = React.forwardRef<any, Omit<RouterLinkProps, 'to'>>((itemProps, ref) => (
    <RouterLink
      to={{ pathname: fullURL, search: search }}
      ref={ref}
      {...itemProps}
      onClick={() => {
        console.log('click me');
        setOpen(!open);
      }}
    />
  ));
  console.log('open', open);
  return hide ? null : (
    <React.Fragment>
      <ListItemLink
        selected={open}
        pathname={''}
        primary={fullWidth ? label : ''}
        icon={icon}
        name={label}
        sidebarName={name}
        subtitle={subtitle}
        search={search}
        iconOnly={!fullWidth}
        hasParent={hasParent}
        fullWidth={fullWidth}
        component={renderLink}
        {...other}
      />
      {subList.length > 0 && (
        <ListItem
          sx={{
            padding: 0,
          }}
        >
          <Collapse in={fullWidth && open} sx={{ width: '100%' }}>
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

export default FavouriteSidebarItem;
