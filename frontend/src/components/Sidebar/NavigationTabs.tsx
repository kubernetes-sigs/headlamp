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
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useHistory } from 'react-router';
import { getCluster, getClusterPrefixedPath } from '../../lib/cluster';
import { getRoute } from '../../lib/router';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { useTypedSelector } from '../../redux/hooks';
import Tabs from '../common/Tabs';
import { SidebarItemProps } from '../Sidebar';
import { getFullURLOnRoute } from './SidebarItem';
import { useSidebarItems } from './useSidebarItems';

export default function NavigationTabs() {
  const history = useHistory();
  const { item, sidebar } = useTypedSelector(state => state.sidebar.selected);
  const isSidebarOpen = useTypedSelector(state => state.sidebar.isSidebarOpen);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('xs'));
  const isSmallSideBar = useMediaQuery(theme.breakpoints.only('sm'));
  const { t } = useTranslation();

  const sidebarItems = useSidebarItems(sidebar ?? undefined);

  // Root sidebar entry that contains selected item
  const rootSelectedItem = useMemo(
    () =>
      sidebarItems.findLast(
        it =>
          it.name === item ||
          it?.subList?.find(it => it.name === item || it?.subList?.find(it => it.name === item))
      ),
    [sidebarItems, item]
  );

  const level1Tabs = useMemo(
    () =>
      [
        // If there's a route for the root entry then it should be a Tab
        getRoute(rootSelectedItem?.name ?? undefined)
          ? // we remove subList here because those items are already included in level 1
            { ...rootSelectedItem, subList: [] }
          : undefined,
        ...(rootSelectedItem?.subList ?? []),
      ].filter(Boolean) as Omit<SidebarItemProps, 'sidebar'>[],
    [rootSelectedItem]
  );
  const level1SelectedItem = useMemo(
    () => level1Tabs?.find(it => it.name === item || it.subList?.find(it => it.name === item)),
    [level1Tabs, item]
  );

  const level2Tabs = useMemo(() => level1SelectedItem?.subList, [level1SelectedItem]);

  const level2SelectedItem = useMemo(
    () => level2Tabs?.find(it => it.name === item),
    [level2Tabs, item]
  );

  const tabChangeHandler = useCallback(
    (index: number) => {
      const item = level1Tabs[index];
      if (item.url && item.useClusterURL && getCluster()) {
        history.push({
          pathname: generatePath(getClusterPrefixedPath(item.url), { cluster: getCluster()! }),
        });
      } else if (item.url) {
        history.push(item.url);
      } else {
        history.push({ pathname: getFullURLOnRoute(item.name, item.isCR, item.subList ?? []) });
      }
    },
    [level1Tabs]
  );

  const tabSecondLevelChangeHandler = useCallback(
    (index: number) => {
      if (!level2Tabs) {
        return;
      }
      const tab = level2Tabs[index];
      const url = tab.url;
      const useClusterURL = !!tab.useClusterURL;
      if (url && useClusterURL && getCluster()) {
        history.push({
          pathname: generatePath(getClusterPrefixedPath(url), { cluster: getCluster()! }),
        });
      } else if (url) {
        history.push(url);
      } else {
        if (tab.isCR) {
          history.push({
            pathname: createRouteURL('customresources', {
              crd: tab.name,
            }),
          });
        } else {
          history.push({ pathname: createRouteURL(tab.name) });
        }
      }
    },
    [level2Tabs]
  );

  // Always show the navigation tabs when the sidebar is the small version
  if (!isSmallSideBar && (isSidebarOpen || isMobile)) {
    return null;
  }

  if (!level1Tabs.length) {
    return null;
  }

  const level1TabRoutes = level1Tabs
    .filter(item => !item.hide)
    .map((item: SidebarItemProps) => ({ label: item.label, component: <></> }));

  const level2TabRoutes = level2Tabs
    ?.filter(item => !item.hide)
    ?.map((item: SidebarItemProps) => ({ label: item.label, component: <></> }));

  return (
    <Box mb={2} component="nav" aria-label={t('translation|Main Navigation')}>
      <Tabs
        tabs={level1TabRoutes}
        onTabChanged={tabChangeHandler}
        defaultIndex={level1SelectedItem ? level1Tabs.indexOf(level1SelectedItem) : 0}
        sx={{
          maxWidth: '85vw',
          [theme.breakpoints.down('sm')]: {
            paddingTop: theme.spacing(1),
          },
        }}
        ariaLabel={t('translation|Navigation Tabs')}
      />
      <Divider role="separator" />
      {level2TabRoutes && level2TabRoutes.length !== 0 && (
        <>
          <Tabs
            tabs={level2TabRoutes!!}
            defaultIndex={
              level2Tabs && level2SelectedItem ? level2Tabs?.indexOf(level2SelectedItem) : 0
            }
            onTabChanged={tabSecondLevelChangeHandler}
            ariaLabel={t('translation|Navigation Tabs')}
          />
          <Divider role="separator" />
        </>
      )}
    </Box>
  );
}
