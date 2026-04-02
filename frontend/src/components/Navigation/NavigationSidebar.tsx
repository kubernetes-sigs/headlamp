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
import Drawer from '@mui/material/Drawer';
import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useTypedSelector } from '../../redux/hooks';
import ActionButton from '../common/ActionButton';
import Loader from '../common/Loader';
import CreateButton from '../common/Resource/CreateButton';
import { drawerWidth, drawerWidthClosed, useSidebarInfo } from '../Sidebar/Sidebar';
import { DefaultSidebars, setWhetherSidebarOpen } from '../Sidebar/sidebarSlice';
import VersionButton from '../Sidebar/VersionButton';
import { NavigationSidebarNode } from './NavigationSidebarNode';
import { useNavigationTree } from './useNavigationTree';

export default function NavigationSidebar() {
  const sidebar = useTypedSelector(state => state.sidebar);
  const dispatch = useDispatch();
  const { isOpen, isTemporary, isNarrow, canExpand } = useSidebarInfo();
  const sidebarName = sidebar.selected.sidebar ?? DefaultSidebars.IN_CLUSTER;
  const { nodes, isLoading } = useNavigationTree(sidebarName);
  const { t } = useTranslation();
  const isNarrowOnly = isNarrow && !canExpand;

  const largeSideBarOpen = isOpen && !isNarrowOnly;
  const isInCluster = sidebarName === DefaultSidebars.IN_CLUSTER;

  if (sidebar.selected.sidebar === null || !sidebar?.isVisible) {
    return null;
  }

  return (
    <Box
      component="nav"
      aria-label={t('translation|Navigation')}
      sx={{ minHeight: 0, gridColumn: '1 / 2', gridRow: '1 / 3' }}
    >
      <Drawer
        variant={isTemporary ? 'temporary' : 'permanent'}
        open={isTemporary ? isOpen : undefined}
        onClose={isTemporary ? () => dispatch(setWhetherSidebarOpen(false)) : undefined}
        PaperProps={{
          sx: {
            borderTop: 'none',
            position: 'initial',
          },
        }}
        sx={theme => {
          const base = {
            flexShrink: 0,
            height: '100%',
            background: theme.palette.sidebar.background,
            color: theme.palette.sidebar.color,
          };

          if (largeSideBarOpen) {
            return {
              ...base,
              width: drawerWidth,
              zIndex: 1300,
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
              '& .MuiPaper-root': {
                width: drawerWidth,
                background: theme.palette.sidebar.background,
              },
            };
          }

          return {
            ...base,
            width: drawerWidthClosed,
            overflowX: 'hidden',
            transition: theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
            '& .MuiPaper-root': {
              width: drawerWidthClosed,
              background: theme.palette.sidebar.background,
              overflowX: 'hidden',
            },
          };
        }}
      >
        <Grid
          container
          direction="column"
          justifyContent="space-between"
          wrap="nowrap"
          sx={{ height: '100%' }}
        >
          <Grid item sx={{ overflowY: 'auto', flex: 1, scrollbarWidth: 'thin' }}>
            <List>
              {nodes.map(node => (
                <NavigationSidebarNode key={node.label} node={node} isOpen={largeSideBarOpen} />
              ))}
              {isInCluster && isLoading && (
                <Box p={2}>
                  <Loader title={t('translation|Loading resources…')} />
                </Box>
              )}
            </List>
          </Grid>

          <Grid item>
            <Box textAlign="center">
              {isInCluster && <CreateButton isNarrow={!largeSideBarOpen} />}
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                flexDirection={largeSideBarOpen ? 'row' : 'column'}
                p={1}
              >
                {isInCluster && largeSideBarOpen && <VersionButton />}
                <SidebarToggleButton />
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Drawer>
    </Box>
  );
}

function SidebarToggleButton() {
  const dispatch = useDispatch();
  const { isOpen, isNarrow, canExpand, isTemporary } = useSidebarInfo();
  const { t } = useTranslation();

  if (isTemporary || (isNarrow && !canExpand)) {
    return null;
  }

  return (
    <ActionButton
      iconButtonProps={{
        size: 'small',
        sx: theme => ({ color: theme.palette.sidebar.color }),
      }}
      onClick={() => dispatch(setWhetherSidebarOpen(!isOpen))}
      icon={isOpen ? 'mdi:chevron-left-box-outline' : 'mdi:chevron-right-box-outline'}
      description={isOpen ? t('translation|Shrink sidebar') : t('translation|Expand sidebar')}
    />
  );
}
