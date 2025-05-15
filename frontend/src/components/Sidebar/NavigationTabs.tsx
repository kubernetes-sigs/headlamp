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

import { Divider } from '@mui/material';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTranslation } from 'react-i18next';
import { generatePath, useHistory } from 'react-router';
import { getCluster, getClusterPrefixedPath } from '../../lib/cluster';
import { createRouteURL } from '../../lib/router';
import { useTypedSelector } from '../../redux/reducers/reducers';
import Tabs from '../common/Tabs';
import { SidebarItemProps } from '../Sidebar';
import { useSidebarItems } from './useSidebarItems';

function searchNameInSubList(sublist: SidebarItemProps['subList'], name: string): boolean {
  if (!sublist) {
    return false;
  }
  for (let i = 0; i < sublist.length; i++) {
    if (sublist[i].name === name) {
      return true;
    }
  }
  return false;
}

function findParentOfSubList(
  list: SidebarItemProps[],
  name: string | null
): SidebarItemProps | null {
  if (!name) {
    return null;
  }

  let parent = null;
  for (let i = 0; i < list.length; i++) {
    if (searchNameInSubList(list[i].subList, name)) {
      parent = list[i];
    }
  }
  return parent;
}

export default function NavigationTabs() {
  const history = useHistory();
  const sidebar = useTypedSelector(state => state.sidebar);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('xs'));
  const isSmallSideBar = useMediaQuery(theme.breakpoints.only('sm'));
  const { t } = useTranslation();

  let defaultIndex = null;
  const listItemsOriginal = useSidebarItems(sidebar.selected.sidebar ?? undefined);
  // Making a copy because we're going to mutate it later in here
  const listItems = structuredClone(listItemsOriginal);
  let navigationItem = listItems.find(item => item.name === sidebar.selected.item);
  if (!navigationItem) {
    const parent = findParentOfSubList(listItems, sidebar.selected.item);
    if (!parent) {
      return null;
    }
    navigationItem = parent;
  }

  // Always show the navigation tabs when the sidebar is the small version
  if (!isSmallSideBar && (sidebar.isSidebarOpen || isMobile)) {
    return null;
  }

  const subList = navigationItem.subList;
  if (!subList) {
    return null;
  }

  /**
   * This function is used to handle the tab change event.
   *
   * @param index The index of the tab that was clicked.
   * @returns void
   */
  function tabChangeHandler(index: number) {
    if (!subList) {
      return;
    }

    const url = subList[index].url;
    const useClusterURL = !!subList[index].useClusterURL;
    if (url && useClusterURL && getCluster()) {
      history.push({
        pathname: generatePath(getClusterPrefixedPath(url), { cluster: getCluster()! }),
      });
    } else if (url) {
      history.push(url);
    } else {
      history.push({ pathname: createRouteURL(subList[index].name) });
    }
  }

  if (createRouteURL(navigationItem.name)) {
    subList.unshift(navigationItem);
  }

  const tabRoutes = subList
    .filter(item => !item.hide)
    .map((item: SidebarItemProps) => {
      return { label: item.label, component: <></> };
    });

  defaultIndex = subList.findIndex(item => item.name === sidebar.selected.item);
  return (
    <Box mb={2} component="nav" aria-label={t('translation|Main Navigation')}>
      <Tabs
        tabs={tabRoutes}
        onTabChanged={index => {
          tabChangeHandler(index);
        }}
        defaultIndex={defaultIndex}
        sx={{
          maxWidth: '85vw',
          [theme.breakpoints.down('sm')]: {
            paddingTop: theme.spacing(1),
          },
        }}
        ariaLabel={t('translation|Navigation Tabs')}
      />
      <Divider />
    </Box>
  );
}
