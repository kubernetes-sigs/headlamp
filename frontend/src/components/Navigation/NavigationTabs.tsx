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
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';
import { useTypedSelector } from '../../redux/hooks';
import Tabs from '../common/Tabs';
import { useSidebarInfo } from '../Sidebar/Sidebar';
import { DefaultSidebars } from '../Sidebar/sidebarSlice';
import { containsPath, matchesPath, NavNode } from './navigationUtils';
import { useNavigationTree } from './useNavigationTree';

/**
 * Finds the active tab and optional active child within it.
 * Searches descendants recursively.
 */
function findSelected(
  tabs: NavNode[],
  pathname: string
): { rootIndex: number; childIndex: number | undefined } {
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    if (tab.children) {
      const childIdx = tab.children.findIndex(c => containsPath(c, pathname));
      if (childIdx >= 0) {
        return { rootIndex: i, childIndex: childIdx };
      }
    }
    if (matchesPath(pathname, tab.url)) {
      return { rootIndex: i, childIndex: undefined };
    }
  }
  return { rootIndex: -1, childIndex: undefined };
}

/**
 * Navigation tabs that appear above the main content when the sidebar is collapsed.
 * Shows two levels of horizontal tabs for navigating within the active section.
 */
export default function NavigationTabs() {
  const { isOpen, isTemporary } = useSidebarInfo();
  const theme = useTheme();
  const sidebar = useTypedSelector(state => state.sidebar);
  const sidebarName = sidebar.selected.sidebar ?? DefaultSidebars.IN_CLUSTER;
  const { nodes: rootTabs } = useNavigationTree(sidebarName);
  const history = useHistory();
  const location = useLocation();
  const { t } = useTranslation();

  // Find which root (level 0) item is active based on the current URL
  const { rootIndex } = useMemo(
    () => findSelected(rootTabs, location.pathname),
    [rootTabs, location.pathname]
  );

  const activeRoot = rootIndex >= 0 ? rootTabs[rootIndex] : undefined;
  // Level 1 tabs = children of the active root item
  const level1Tabs = activeRoot?.children;

  // Find which level 1 tab is active, and whether it has level 2 children
  const { rootIndex: level1Index, childIndex: level2Index } = useMemo(
    () => (level1Tabs ? findSelected(level1Tabs, location.pathname) : { rootIndex: -1, childIndex: undefined }),
    [level1Tabs, location.pathname]
  );

  const activeLevel1 = level1Tabs && level1Index >= 0 ? level1Tabs[level1Index] : undefined;
  const level2Tabs = activeLevel1?.children;

  if (isOpen || isTemporary || !level1Tabs || level1Tabs.length === 0) {
    return null;
  }

  return (
    <Box mb={2} component="nav" aria-label={t('translation|Main Navigation')}>
      <Tabs
        tabs={level1Tabs.map(tab => ({ label: tab.label, component: <></> }))}
        onTabChanged={index => history.push(level1Tabs[index].url)}
        defaultIndex={level1Index >= 0 ? level1Index : 0}
        sx={{
          maxWidth: '85vw',
          [theme.breakpoints.down('sm')]: {
            paddingTop: theme.spacing(1),
          },
        }}
        ariaLabel={t('translation|Navigation Tabs')}
      />
      <Divider role="separator" />
      {level2Tabs && level2Tabs.length > 0 && (
        <>
          <Tabs
            tabs={level2Tabs.map(tab => ({ label: tab.label, component: <></> }))}
            defaultIndex={level2Index ?? 0}
            onTabChanged={index => history.push(level2Tabs[index].url)}
            ariaLabel={t('translation|Navigation Tabs')}
          />
          <Divider role="separator" />
        </>
      )}
    </Box>
  );
}
