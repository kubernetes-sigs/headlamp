import { TypedUseSelectorHook, useSelector } from 'react-redux';
import { combineReducers } from 'redux';
import notificationsReducer from '../../components/App/Notifications/notificationsSlice';
import themeReducer from '../../components/App/themeSlice';
import { graphViewSlice } from '../../components/resourceMap/graphViewSlice';
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
import resourceTableReducer from './../../components/common/Resource/resourceTableSlice';
import detailsViewSectionReducer from './../../components/DetailsViewSection/detailsViewSectionSlice';
import sidebarReducer from './../../components/Sidebar/sidebarSlice';
import pluginConfigReducer from './../../plugin/pluginConfigSlice';
import uiReducer from './ui';

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
  graphView: graphViewSlice.reducer,
  clusterProvider: clusterProviderReducer,
});

export type RootState = ReturnType<typeof reducers>;

export const useTypedSelector: TypedUseSelectorHook<RootState> = useSelector;

export default reducers;
