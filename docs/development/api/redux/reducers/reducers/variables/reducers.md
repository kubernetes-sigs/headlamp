# Variable: reducers

```ts
const reducers: Reducer<{
  actionButtons: HeaderActionState;
  activity: ActivityState;
  clusterAction: ClusterState;
  clusterProvider: ClusterProviderSliceState;
  config: ConfigState;
  detailsViewSection: DetailsViewSectionState;
  detailsViewSections: DetailsViewSectionState;
  drawerMode: DrawerModeState;
  eventCallbackReducer: {
     trackerFuncs: HeadlampEventCallback[];
  };
  filter: FilterState;
  graphView: GraphViewSliceState;
  notifications: NotificationsState;
  overviewCharts: OverviewChartsState;
  pluginConfigs: PluginConfigState;
  plugins: PluginsState;
  projects: ProjectsState;
  resourceTable: ResourceTableState;
  routes: RoutesState;
  shortcuts: ShortcutsState;
  sidebar: SidebarState;
  theme: ThemeState;
  ui: UIState;
}, UnknownAction, Partial<{
  actionButtons: HeaderActionState | undefined;
  activity: ActivityState | undefined;
  clusterAction: ClusterState | undefined;
  clusterProvider: ClusterProviderSliceState | undefined;
  config: ConfigState | undefined;
  detailsViewSection: DetailsViewSectionState | undefined;
  detailsViewSections: DetailsViewSectionState | undefined;
  drawerMode: DrawerModeState | undefined;
  eventCallbackReducer:   | {
     trackerFuncs: HeadlampEventCallback[];
   }
     | undefined;
  filter: FilterState | undefined;
  graphView: GraphViewSliceState | undefined;
  notifications: NotificationsState | undefined;
  overviewCharts: OverviewChartsState | undefined;
  pluginConfigs: PluginConfigState | undefined;
  plugins: PluginsState | undefined;
  projects: ProjectsState | undefined;
  resourceTable: ResourceTableState | undefined;
  routes: RoutesState | undefined;
  shortcuts: ShortcutsState | undefined;
  sidebar: SidebarState | undefined;
  theme: ThemeState | undefined;
  ui: UIState | undefined;
}>>;
```

Defined in: [redux/reducers/reducers.tsx:40](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/reducers/reducers.tsx#L40)
