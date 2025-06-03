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

import { combineReducers } from 'redux';
import notificationsReducer from '../../components/App/Notifications/notificationsSlice';
import themeReducer from '../../components/App/themeSlice';
import graphViewReducer from '../../components/resourceMap/graphViewSlice';
import pluginsReducer from '../../plugin/pluginsSlice';
import actionButtons from '../actionButtonsSlice';
import clusterAction from '../clusterActionSlice';
import clusterProviderReducer from '../clusterProviderSlice';
import configReducer from '../configSlice';
import drawerModeSlice from '../drawerModeSlice';
import filterReducer from '../filterSlice';
import eventCallbackReducer from '../headlampEventSlice';
import overviewChartsReducer from '../overviewChartsSlice';
import routesReducer from '../routesSlice';
import uiReducer from '../uiSlice';
import resourceTableReducer from './../../components/common/Resource/resourceTableSlice';
import detailsViewSectionReducer from './../../components/DetailsViewSection/detailsViewSectionSlice';
import sidebarReducer from './../../components/Sidebar/sidebarSlice';
import pluginConfigReducer from './../../plugin/pluginConfigSlice';

const reducers = combineReducers({
  filter: filterReducer,
  ui: uiReducer,
  clusterAction: clusterAction,
  config: configReducer,
  plugins: pluginsReducer,
  actionButtons: actionButtons,
  notifications: notificationsReducer,
  theme: themeReducer,
  resourceTable: resourceTableReducer,
  detailsViewSection: detailsViewSectionReducer,
  routes: routesReducer,
  sidebar: sidebarReducer,
  detailsViewSections: detailsViewSectionReducer,
  eventCallbackReducer,
  pluginConfigs: pluginConfigReducer,
  overviewCharts: overviewChartsReducer,
  drawerMode: drawerModeSlice,
  graphView: graphViewReducer,
  clusterProvider: clusterProviderReducer,
});

export type RootState = ReturnType<typeof reducers>;

export default reducers;
