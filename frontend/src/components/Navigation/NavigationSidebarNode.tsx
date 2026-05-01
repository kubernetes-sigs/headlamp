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

import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import type { SystemStyleObject } from '@mui/system';
import { alpha } from '@mui/system/colorManipulator';
import { memo, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { containsPath, matchesPath, NavNode } from './navigationUtils';

const ITEM_MX = 0.5;

const itemButtonSx =
  ({
    isChild = false,
    ...overrides
  }: {
    isChild?: boolean;
  } & SystemStyleObject<any> = {}) =>
  (theme: any) => ({
    color: theme.palette.sidebar.color,
    borderRadius: theme.shape.borderRadius + 'px',
    mx: ITEM_MX,
    px: 1,
    py: isChild ? 0.5 : 0.75,
    ...(isChild && {
      pl: 4,
      opacity: 0.9,
      '& *': { fontSize: '.875rem' },
    }),
    ...overrides,
    '& .MuiListItemText-primary': {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    '& .MuiListItemText-secondary': {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      color: 'inherit',
    },
    '&:hover': {
      backgroundColor: alpha(theme.palette.getContrastText(theme.palette.sidebar.background), 0.07),
    },
    '&.Mui-selected': isChild
      ? {
          background: 'none',
          opacity: 1,
          color: theme.palette.sidebar.selectedColor,
          '&:before': {
            content: "''",
            width: '4px',
            borderRadius: theme.shape.borderRadius + 'px',
            background: theme.palette.sidebar.selectedColor,
            position: 'absolute',
            left: '4px',
            top: '7px',
            bottom: '7px',
          },
          '&:hover': {
            backgroundColor: alpha(
              theme.palette.getContrastText(theme.palette.sidebar.background),
              0.07
            ),
          },
        }
      : {
          opacity: 1,
          boxShadow: '1px 1px 4px rgb(0 0 0 / 12%)',
          background: theme.palette.sidebar.selectedBackground,
          color: theme.palette.getContrastText(theme.palette.sidebar.selectedBackground),
          '&:hover': {
            backgroundColor: alpha(theme.palette.sidebar.selectedBackground, 0.8),
          },
        },
  });

const chevronSx = (theme: any) => ({
  color: theme.palette.sidebar.color,
  borderRadius: theme.shape.borderRadius + 'px',
  borderTopLeftRadius: 0,
  borderBottomLeftRadius: 0,
  width: 36,
  alignSelf: 'stretch',
  flexShrink: 0,
  '&:hover': {
    backgroundColor: alpha(theme.palette.getContrastText(theme.palette.sidebar.background), 0.07),
  },
});

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return <Icon icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={18} height={18} />;
}

/** Renders a single navigation node. Recurses for children. */
export const NavigationSidebarNode = memo(
  ({ node, isOpen, depth = 0 }: { node: NavNode; isOpen: boolean; depth?: number }) => {
    const history = useHistory();
    const location = useLocation();
    const [userExpanded, setUserExpanded] = useState<boolean | undefined>();

    const hasChildren = !!node.children?.length;
    const navigates = !!node.url && (!hasChildren || node.url !== node.children?.[0]?.url);
    const selected = navigates && matchesPath(location.pathname, node.url);
    const childSelected = useMemo(
      () => node.children?.some(child => containsPath(child, location.pathname)) ?? false,
      [node, location.pathname]
    );
    const expanded = userExpanded ?? (selected || childSelected);
    const toggle = () => setUserExpanded(prev => !(prev ?? (selected || childSelected)));

    //  Child leaf node
    if (depth > 0 && !hasChildren) {
      return (
        <ListItemButton
          onClick={() => node.url && history.push(node.url)}
          selected={selected}
          sx={itemButtonSx({ isChild: true, pl: depth === 1 ? 4 : 4 + depth })}
        >
          <ListItemText primary={node.label} />
        </ListItemButton>
      );
    }

    //  Child group (e.g. API group within Custom Resources)
    if (depth > 0) {
      return (
        <>
          <ListItemButton
            onClick={() => setUserExpanded(prev => !(prev ?? childSelected))}
            sx={itemButtonSx({ isChild: true, pl: depth === 1 ? 4 : 4 + depth })}
          >
            <ListItemText
              primary={node.label}
              primaryTypographyProps={{ sx: { fontWeight: 500, fontSize: '.875rem' } }}
            />
            <ChevronIcon expanded={expanded} />
          </ListItemButton>
          <Collapse in={expanded} timeout="auto">
            <List component="ul" disablePadding>
              {node.children!.map(child => (
                <NavigationSidebarNode
                  key={child.label}
                  node={child}
                  isOpen={isOpen}
                  depth={depth + 1}
                />
              ))}
            </List>
          </Collapse>
        </>
      );
    }

    //  Root node (depth 0)
    const icon = node.icon || 'mdi:circle-outline';
    const isSelected = hasChildren ? selected || childSelected : selected;

    const handleClick = () => {
      if (navigates) {
        history.push(node.url);
        if (!expanded) setUserExpanded(true);
      } else if (hasChildren) {
        toggle();
      } else if (node.url) {
        history.push(node.url);
      }
    };

    // Narrow (collapsed) sidebar: icon-only button with tooltip
    if (!isOpen) {
      return (
        <Tooltip title={node.label} placement="right">
          <ListItemButton
            onClick={() => node.url && history.push(node.url)}
            selected={isSelected}
            sx={itemButtonSx({ mx: 0, justifyContent: 'center', aspectRatio: '1.3', px: 0 })}
          >
            <ListItemIcon sx={{ minWidth: 0, color: 'inherit' }}>
              <Icon icon={icon} width={24} height={24} />
            </ListItemIcon>
          </ListItemButton>
        </Tooltip>
      );
    }

    // Expanded sidebar, navigating node with children: split button (label | chevron)
    if (hasChildren && navigates) {
      return (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', mx: ITEM_MX, ml: 0 }}>
            <ListItemButton
              onClick={handleClick}
              selected={isSelected}
              sx={theme => ({
                ...itemButtonSx({
                  flex: 1,
                  minWidth: 0,
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  mr: 0,
                })(theme),
                borderRight: `1px solid ${alpha(theme.palette.sidebar.color, 0.15)}`,
              })}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: 1, color: 'inherit' }}>
                <Icon icon={icon} width={20} height={20} />
              </ListItemIcon>
              <ListItemText primary={node.label} secondary={node.subtitle} />
            </ListItemButton>
            <IconButton onClick={toggle} sx={chevronSx}>
              <ChevronIcon expanded={expanded} />
            </IconButton>
          </Box>
          <Collapse in={expanded} timeout="auto">
            <List component="ul" disablePadding>
              {node.children!.map(child => (
                <NavigationSidebarNode key={child.label} node={child} isOpen={isOpen} depth={1} />
              ))}
            </List>
          </Collapse>
        </>
      );
    }

    // Expanded sidebar, non-navigating node with children: single button with inline chevron
    if (hasChildren) {
      return (
        <>
          <ListItemButton onClick={toggle} selected={isSelected} sx={itemButtonSx()}>
            <ListItemIcon sx={{ minWidth: 0, mr: 1, color: 'inherit' }}>
              <Icon icon={icon} width={20} height={20} />
            </ListItemIcon>
            <ListItemText primary={node.label} secondary={node.subtitle} />
            <ChevronIcon expanded={expanded} />
          </ListItemButton>
          <Collapse in={expanded} timeout="auto">
            <List component="ul" disablePadding>
              {node.children!.map(child => (
                <NavigationSidebarNode key={child.label} node={child} isOpen={isOpen} depth={1} />
              ))}
            </List>
          </Collapse>
        </>
      );
    }

    // Expanded sidebar, leaf node
    return (
      <ListItemButton onClick={handleClick} selected={isSelected} sx={itemButtonSx()}>
        {node.icon && (
          <ListItemIcon sx={{ minWidth: 0, mr: 1, color: 'inherit' }}>
            <Icon icon={icon} width={20} height={20} />
          </ListItemIcon>
        )}
        <ListItemText primary={node.label} />
      </ListItemButton>
    );
  }
);
NavigationSidebarNode.displayName = 'SidebarNode';
