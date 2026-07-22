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

import { configureStore } from '@reduxjs/toolkit';
import { setBrandingAppLogoComponent } from '../../components/App/themeSlice';
import { addResourceTableColumnsProcessor } from '../../components/common/Resource/resourceTableSlice';
import {
  addDetailsViewSectionsProcessor,
  setDetailsView,
  setDetailsViewSection,
} from '../../components/DetailsViewSection/detailsViewSectionSlice';
import {
  addGraphSource,
  addKindIcon,
  setGlance,
} from '../../components/resourceMap/graphViewSlice';
import {
  setHomeSidebarItemFilter,
  setSidebarItem,
  setSidebarItemFilter,
} from '../../components/Sidebar/sidebarSlice';
import {
  addDetailsViewHeaderActionsProcessor,
  setAppBarAction,
  setAppBarActionsProcessor,
  setDetailsViewHeaderAction,
} from '../actionButtonsSlice';
import { initialState as CLUSTER_ACTIONS_INITIAL_STATE } from '../clusterActionSlice';
import {
  addAddClusterProvider,
  addClusterStatus,
  addDialog,
  addMenuItem,
} from '../clusterProviderSlice';
import { initialState as CLUSTER_PROVIDER_INITIAL_STATE } from '../clusterProviderSlice';
import { initialState as CONFIG_INITIAL_STATE } from '../configSlice';
import { initialState as FILTER_INITIAL_STATE } from '../filterSlice';
import { addEventCallback, listenerMiddleware } from '../headlampEventSlice';
import { addOverviewChartsProcessor } from '../overviewChartsSlice';
import {
  addCustomCreateProject,
  addDetailsTab,
  addHeaderAction,
  addOverviewSection,
  setProjectDeleteButton,
} from '../projectsSlice';
import reducers from '../reducers/reducers';
import { setRoute, setRouteFilter } from '../routesSlice';
import { uiSlice } from '../uiSlice';

export const serializableCheckOptions = {
  ignoredActions: [
    setBrandingAppLogoComponent.type,
    addDetailsViewSectionsProcessor.type,
    setDetailsView.type,
    setDetailsViewSection.type,
    setHomeSidebarItemFilter.type,
    setSidebarItem.type,
    setSidebarItemFilter.type,
    addResourceTableColumnsProcessor.type,
    addGraphSource.type,
    addKindIcon.type,
    setGlance.type,
    addDetailsViewHeaderActionsProcessor.type,
    setAppBarAction.type,
    setAppBarActionsProcessor.type,
    setDetailsViewHeaderAction.type,
    addAddClusterProvider.type,
    addClusterStatus.type,
    addDialog.type,
    addMenuItem.type,
    addEventCallback.type,
    addOverviewChartsProcessor.type,
    addCustomCreateProject.type,
    addDetailsTab.type,
    addHeaderAction.type,
    addOverviewSection.type,
    setProjectDeleteButton.type,
    setRoute.type,
    setRouteFilter.type,
    uiSlice.actions.addUIPanel.type,
    uiSlice.actions.setClusterChooserButton.type,
    uiSlice.actions.setFunctionsToOverride.type,
  ],
  ignoredPaths: [
    'actionButtons.appBarActions',
    'actionButtons.appBarActionsProcessors',
    'actionButtons.headerActions',
    'actionButtons.headerActionsProcessors',
    'clusterProvider.clusterProviders',
    'clusterProvider.clusterStatuses',
    'clusterProvider.dialogs',
    'clusterProvider.menuItems',
    'detailsViewSection.detailViews',
    'detailsViewSection.detailsViewSections',
    'detailsViewSection.detailsViewSectionsProcessors',
    'detailsViewSections.detailViews',
    'detailsViewSections.detailsViewSections',
    'detailsViewSections.detailsViewSectionsProcessors',
    'filter.namespaces',
    'routes.routes',
    'routes.routeFilters',
    'eventCallbackReducer.trackerFuncs',
    'graphView.glances',
    'graphView.graphSources',
    'graphView.kindIcons',
    'overviewCharts.processors',
    'projects.customCreateProject',
    'projects.detailsTabs',
    'projects.headerActions',
    'projects.overviewSections',
    'projects.projectDeleteButton',
    'resourceTable.tableColumnsProcessors',
    'sidebar.entries',
    'sidebar.filters',
    'sidebar.homeFilters',
    'theme.logo',
    'ui.clusterChooserButtonComponent',
    'ui.functionsToOverride',
    'ui.panels',
  ],
};

export function createStore() {
  return configureStore({
    reducer: reducers,
    preloadedState: {
      filter: FILTER_INITIAL_STATE,
      config: CONFIG_INITIAL_STATE,
      clusterAction: CLUSTER_ACTIONS_INITIAL_STATE,
      clusterProvider: CLUSTER_PROVIDER_INITIAL_STATE,
    },
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: serializableCheckOptions,
        thunk: true,
      }).prepend(listenerMiddleware.middleware),
  });
}

const store = createStore();

export default store;

export type AppStore = ReturnType<typeof createStore>;
export type AppDispatch = AppStore['dispatch'];
export type RootState = ReturnType<AppStore['getState']>;
