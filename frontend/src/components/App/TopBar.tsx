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
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useQueries } from '@tanstack/react-query';
import { has } from 'lodash';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { getProductName, getVersion } from '../../helpers/getProductInfo';
import { logout } from '../../lib/auth';
import { useCluster, useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { ClusterUserInfo, getClusterUserInfo } from '../../lib/k8s/api/v1/clusterApi';
import { createRouteURL } from '../../lib/router/createRouteURL';
import {
  AppBarAction,
  AppBarActionsProcessor,
  AppBarActionType,
  DefaultAppBarAction,
} from '../../redux/actionButtonsSlice';
import { useTypedSelector } from '../../redux/hooks';
import { uiSlice } from '../../redux/uiSlice';
import { SettingsButton } from '../App/Settings';
import { ClusterTitle } from '../cluster/Chooser';
import ErrorBoundary from '../common/ErrorBoundary';
import { GlobalSearch } from '../globalSearch/GlobalSearch';
import HeadlampButton from '../Sidebar/HeadlampButton';
import { setWhetherSidebarOpen } from '../Sidebar/sidebarSlice';
import { AppLogo } from './AppLogo';

export interface TopBarProps {}

export function useAppBarActionsProcessed() {
  const appBarActions = useTypedSelector(state => state.actionButtons.appBarActions);
  const appBarActionsProcessors = useTypedSelector(
    state => state.actionButtons.appBarActionsProcessors
  );

  return { appBarActions, appBarActionsProcessors };
}

export function processAppBarActions(
  appBarActions: AppBarAction[],
  appBarActionsProcessors: AppBarActionsProcessor[]
): AppBarAction[] {
  let appBarActionsProcessed = [...appBarActions];
  for (const appBarActionsProcessor of appBarActionsProcessors) {
    appBarActionsProcessed = appBarActionsProcessor.processor({
      actions: appBarActionsProcessed,
    });
  }
  return appBarActionsProcessed;
}

/**
 * Handles the logic for updating the URL after a user logs out from a cluster.
 * If the user logs out from a specific cluster in a multi-cluster context,
 * it removes that cluster from the URL. Otherwise, it redirects to the home page.
 *
 * @param clusterToLogout - The name of the cluster the user is logging out from.
 * @param currentPath - The current URL path (e.g., from history.location.pathname).
 * @param historyPush - Function to navigate to a new path (e.g., history.push).
 */
function handleLogoutPathUpdate(
  clusterToLogout: string | undefined,
  currentPath: string,
  historyPush: (path: string) => void
) {
  if (clusterToLogout) {
    const clusterSegmentMatch = currentPath.match(/\/c\/([^/]+)(\/|$)/);
    if (clusterSegmentMatch) {
      const currentClusterParam = clusterSegmentMatch[1];
      const clustersInPath = currentClusterParam.split('+');
      const remainingClustersInPath = clustersInPath.filter(c => c !== clusterToLogout);
      if (remainingClustersInPath.length > 0) {
        const newClusterParam = remainingClustersInPath.join('+');
        const newPath = currentPath.replace(`/c/${currentClusterParam}`, `/c/${newClusterParam}`);
        historyPush(newPath);
      } else {
        historyPush('/');
      }
    } else {
      historyPush('/');
    }
  } else {
    historyPush('/');
  }
}

/**
 * Gets the display name for a user in a cluster.
 *
 * @param clusterName - The name of the cluster.
 * @param clusterUserInfoMap - A map of cluster names to user info objects.
 * @returns The username if available, otherwise the cluster name.
 */
function getUserDisplayName(
  clusterName: string,
  clusterUserInfoMap: Record<string, ClusterUserInfo | undefined>
): string {
  const userInfo = clusterUserInfoMap[clusterName];
  if (userInfo?.username) {
    return userInfo.username;
  }
  return clusterName;
}

function ClusterLogoutMenuItem({
  clusterName,
  userName,
  logout,
  onClose,
}: {
  clusterName: string;
  userName: string;
  logout: (cluster: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <MenuItem
      key={`logout-${clusterName}`}
      onClick={async () => {
        await logout(clusterName);
        onClose();
      }}
    >
      <ListItemIcon>
        <Icon icon="mdi:logout" />
      </ListItemIcon>
      <ListItemText
        primary={
          <Box display="flex" flexDirection="column">
            <Typography variant="body2" component="span">
              {t('Log out')}: {userName}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="span">
              {clusterName}
            </Typography>
          </Box>
        }
      />
    </MenuItem>
  );
}

export default function TopBar({}: TopBarProps) {
  const dispatch = useDispatch();
  const isMedium = useMediaQuery('(max-width:960px)');

  const isSidebarOpen = useTypedSelector(state => state.sidebar.isSidebarOpen);
  const isSidebarOpenUserSelected = useTypedSelector(
    state => state.sidebar.isSidebarOpenUserSelected
  );
  const hideAppBar = useTypedSelector(state => state.ui.hideAppBar);

  const clustersConfig = useClustersConf();
  const cluster = useCluster();
  const selectedClusters = useSelectedClusters();
  const history = useHistory();
  const { appBarActions, appBarActionsProcessors } = useAppBarActionsProcessed();

  // The logout callback
  const logoutCallback = useCallback(
    async (clusterToLogout?: string) => {
      if (clusterToLogout) {
        await logout(clusterToLogout);
      } else {
        if (selectedClusters.length > 0) {
          await Promise.all(
            selectedClusters.map(async c => {
              await logout(c);
            })
          );
        } else if (cluster) {
          await logout(cluster);
        }
      }

      handleLogoutPathUpdate(clusterToLogout, history.location.pathname, (path: string) =>
        history.push(path)
      );
    },
    [cluster, selectedClusters, history]
  );

  const handletoggleOpen = useCallback(() => {
    // For medium view we default to closed if they have not made a selection.
    // This handles the case when the user resizes the window from large to small.
    // If they have not made a selection then the window size stays the default for
    //   the size.

    const openSideBar = isMedium && isSidebarOpenUserSelected === undefined ? false : isSidebarOpen;

    dispatch(setWhetherSidebarOpen(!openSideBar));
  }, [isMedium, isSidebarOpenUserSelected, isSidebarOpen]);

  if (hideAppBar) {
    return null;
  }
  return (
    <PureTopBar
      appBarActions={appBarActions}
      appBarActionsProcessors={appBarActionsProcessors}
      logout={logoutCallback}
      isSidebarOpen={isSidebarOpen}
      isSidebarOpenUserSelected={isSidebarOpenUserSelected}
      onToggleOpen={handletoggleOpen}
      cluster={cluster || undefined}
      selectedClusters={selectedClusters}
      clusters={clustersConfig || undefined}
    />
  );
}

export interface PureTopBarProps {
  /** If the sidebar is fully expanded open or shrunk. */
  appBarActions: AppBarAction[];
  /** functions which filter the app bar action buttons */
  appBarActionsProcessors?: AppBarActionsProcessor[];
  logout: (cluster?: string) => Promise<any> | void;
  clusters?: {
    [clusterName: string]: any;
  };
  cluster?: string;
  selectedClusters?: string[];
  isSidebarOpen?: boolean;
  isSidebarOpenUserSelected?: boolean;

  /** Called when sidebar toggles between open and closed. */
  onToggleOpen: () => void;
}

function AppBarActionsMenu({
  appBarActions,
}: {
  appBarActions: Array<AppBarAction | AppBarActionType>;
}) {
  const actions = (function stateActions() {
    return React.Children.toArray(
      appBarActions.map(action => {
        const Action = has(action, 'action') ? action.action : action;
        if (React.isValidElement(Action)) {
          return (
            <ErrorBoundary>
              <MenuItem>{Action}</MenuItem>
            </ErrorBoundary>
          );
        } else if (Action === null) {
          return null;
        } else if (typeof Action === 'function') {
          const ActionComponent = Action as React.FC;
          return (
            <ErrorBoundary>
              <MenuItem>
                <ActionComponent />
              </MenuItem>
            </ErrorBoundary>
          );
        }
      })
    );
  })();

  return <>{actions}</>;
}
function AppBarActions({
  appBarActions,
}: {
  appBarActions: Array<AppBarAction | AppBarActionType>;
}) {
  const actions = (function stateActions() {
    return React.Children.toArray(
      appBarActions.map(action => {
        const Action = has(action, 'action') ? action.action : action;
        if (React.isValidElement(Action)) {
          return <ErrorBoundary>{Action}</ErrorBoundary>;
        } else if (Action === null) {
          return null;
        } else if (typeof Action === 'function') {
          const ActionComponent = Action as React.FC;
          return (
            <ErrorBoundary>
              <ActionComponent />
            </ErrorBoundary>
          );
        }
      })
    );
  })();

  return <>{actions}</>;
}

export const PureTopBar = memo(
  ({
    appBarActions,
    appBarActionsProcessors = [],
    logout,
    cluster,
    selectedClusters,
    clusters,
    isSidebarOpen,
    isSidebarOpenUserSelected,
    onToggleOpen,
  }: PureTopBarProps) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
    const dispatch = useDispatch();
    const history = useHistory();

    const openSideBar = !!(isSidebarOpenUserSelected === undefined ? false : isSidebarOpen);

    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const [mobileMoreAnchorEl, setMobileMoreAnchorEl] = React.useState<null | HTMLElement>(null);
    const isClusterContext = !!cluster;

    const isMenuOpen = Boolean(anchorEl);
    const isMobileMenuOpen = Boolean(mobileMoreAnchorEl);

    const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
    };

    const handleMobileMenuClose = () => {
      setMobileMoreAnchorEl(null);
    };

    const handleMenuClose = () => {
      setAnchorEl(null);
      handleMobileMenuClose();
    };

    const handleMobileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
      setMobileMoreAnchorEl(event.currentTarget);
    };
    const userMenuId = 'primary-user-menu';

    const clustersToQuery =
      selectedClusters && selectedClusters.length > 0 ? selectedClusters : cluster ? [cluster] : [];

    const userInfoQueries = useQueries({
      queries: clustersToQuery.map(clusterName => ({
        queryKey: ['clusterMe', clusterName],
        queryFn: () => getClusterUserInfo(clusterName),
        staleTime: 5 * 60 * 1000,
        retry: 1,
      })),
    });

    const clusterUserInfoMap: Record<string, ClusterUserInfo | undefined> = {};
    clustersToQuery.forEach((clusterName, index) => {
      if (userInfoQueries[index]?.data) {
        clusterUserInfoMap[clusterName] = userInfoQueries[index].data;
      }
    });

    const showUserMenu = (!!selectedClusters && selectedClusters.length > 0) || isClusterContext;

    const renderUserMenu = showUserMenu && (
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        id={userMenuId}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={isMenuOpen}
        onClose={() => {
          handleMenuClose();
          handleMobileMenuClose();
        }}
        style={{ zIndex: 1400 }}
        sx={{
          '& .MuiMenu-list': {
            paddingBottom: 0,
          },
        }}
      >
        {selectedClusters && selectedClusters.length > 1 && (
          <MenuItem
            onClick={async () => {
              await logout();
              handleMenuClose();
            }}
          >
            <ListItemIcon>
              <Icon icon="mdi:logout" />
            </ListItemIcon>
            <ListItemText primary={t('Log out from all')} />
          </MenuItem>
        )}

        {selectedClusters && selectedClusters.length > 1 ? (
          selectedClusters.map(clusterName => {
            const userName = getUserDisplayName(clusterName, clusterUserInfoMap);
            return (
              <ClusterLogoutMenuItem
                key={`logout-${clusterName}`}
                clusterName={clusterName}
                userName={userName}
                logout={logout}
                onClose={handleMenuClose}
              />
            );
          })
        ) : (
          <MenuItem
            onClick={async () => {
              await logout();
              handleMenuClose();
            }}
          >
            <ListItemIcon>
              <Icon icon="mdi:logout" />
            </ListItemIcon>
            <ListItemText
              primary={
                cluster ? (
                  <Box display="flex" flexDirection="column">
                    <Typography variant="body2" component="span">
                      {t('Log out')}: {getUserDisplayName(cluster, clusterUserInfoMap)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="span">
                      {cluster}
                    </Typography>
                  </Box>
                ) : (
                  t('Log out')
                )
              }
            />
          </MenuItem>
        )}

        <Divider />

        <MenuItem
          component="a"
          onClick={() => {
            history.push(createRouteURL('settings'));
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <Icon icon="mdi:cog-box" />
          </ListItemIcon>
          <ListItemText>{t('translation|General Settings')}</ListItemText>
        </MenuItem>
        <MenuItem
          component="a"
          onClick={() => {
            dispatch(uiSlice.actions.setVersionDialogOpen(true));
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <Icon icon="mdi:information-outline" />
          </ListItemIcon>
          <ListItemText>
            {getProductName()} {getVersion()['VERSION']}
          </ListItemText>
        </MenuItem>
      </Menu>
    );

    const mobileMenuId = 'primary-menu-mobile';
    const allAppBarActionsMobile: AppBarAction[] = [
      {
        id: DefaultAppBarAction.CLUSTER,
        action: isClusterContext && (
          <ClusterTitle cluster={cluster} clusters={clusters} onClick={() => handleMenuClose()} />
        ),
      },
      ...appBarActions,
      {
        id: DefaultAppBarAction.NOTIFICATION,
        action: null,
      },
      {
        id: DefaultAppBarAction.SETTINGS,
        action: isClusterContext ? <SettingsButton onClickExtra={handleMenuClose} /> : null,
      },
      {
        id: DefaultAppBarAction.USER,
        action: showUserMenu && (
          <IconButton
            aria-label={t('Account of current user')}
            aria-controls={userMenuId}
            aria-haspopup="true"
            color="inherit"
            onClick={event => {
              handleMenuClose();
              handleProfileMenuOpen(event);
            }}
            size="medium"
          >
            <Icon icon="mdi:account" />
          </IconButton>
        ),
      },
    ];
    const renderMobileMenu = (
      <Menu
        anchorEl={mobileMoreAnchorEl}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        id={mobileMenuId}
        keepMounted
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={isMobileMenuOpen}
        onClose={handleMobileMenuClose}
      >
        <AppBarActionsMenu
          appBarActions={processAppBarActions(allAppBarActionsMobile, appBarActionsProcessors)}
        />
      </Menu>
    );

    const allAppBarActions: AppBarAction[] = [
      {
        id: DefaultAppBarAction.GLOBAL_SEARCH,
        action: <GlobalSearch />,
      },
      {
        id: DefaultAppBarAction.CLUSTER,
        action: (
          <Box>
            <ClusterTitle cluster={cluster} clusters={clusters} onClick={handleMobileMenuClose} />
          </Box>
        ),
      },
      ...appBarActions,
      {
        id: DefaultAppBarAction.NOTIFICATION,
        action: null,
      },
      {
        id: DefaultAppBarAction.SETTINGS,
        action: <SettingsButton onClickExtra={handleMenuClose} />,
      },
      {
        id: DefaultAppBarAction.USER,
        action: showUserMenu && (
          <IconButton
            aria-label={t('Account of current user')}
            aria-controls={userMenuId}
            aria-haspopup="true"
            onClick={handleProfileMenuOpen}
            color="inherit"
            size="medium"
          >
            <Icon icon="mdi:account" />
          </IconButton>
        ),
      },
    ];

    const visibleMobileActions = processAppBarActions(
      allAppBarActionsMobile,
      appBarActionsProcessors
    ).filter(action => {
      return (
        React.isValidElement((action as AppBarAction).action) ||
        typeof (action as AppBarAction).action === 'function' ||
        React.isValidElement(action) ||
        typeof action === 'function'
      );
    });

    return (
      <>
        <AppBar
          position="static"
          sx={theme => ({
            backgroundImage: 'none',
            zIndex: theme.zIndex.drawer + 1,
            color:
              theme.palette.navbar.color ??
              theme.palette.getContrastText(theme.palette.navbar.background),
            backgroundColor: theme.palette.navbar.background,
            boxShadow: 'none',
            borderBottom: '1px solid #eee',
            borderColor: theme.palette.divider,
          })}
          elevation={1}
          component="nav"
          aria-label={t('Appbar Tools')}
          enableColorOnDark
        >
          <Toolbar
            sx={{
              [theme.breakpoints.down('sm')]: {
                paddingLeft: 0,
                paddingRight: 0,
              },
            }}
          >
            {isSmall ? (
              <>
                <HeadlampButton open={openSideBar} onToggleOpen={onToggleOpen} />
                <Box sx={{ flexGrow: 1 }} />
                <GlobalSearch isIconButton />
                {visibleMobileActions.length > 0 && (
                  <IconButton
                    aria-label={t('show more')}
                    aria-controls={mobileMenuId}
                    aria-haspopup="true"
                    onClick={handleMobileMenuOpen}
                    color="inherit"
                    size="medium"
                  >
                    <Icon icon="mdi:more-vert" />
                  </IconButton>
                )}
              </>
            ) : (
              <>
                <AppLogo />
                <AppBarActions
                  appBarActions={processAppBarActions(allAppBarActions, appBarActionsProcessors)}
                />
              </>
            )}
          </Toolbar>
        </AppBar>
        {renderUserMenu}
        {isSmall && renderMobileMenu}
      </>
    );
  }
);
