# plugin/registry

## Index

### Enumerations

| Enumeration | Description |
| ------ | ------ |
| [DefaultAppBarAction](enumerations/DefaultAppBarAction.md) | - |
| [DefaultDetailsViewSection](enumerations/DefaultDetailsViewSection.md) | - |
| [DefaultSidebars](enumerations/DefaultSidebars.md) | - |

### Classes

| Class | Description |
| ------ | ------ |
| [ConfigStore](classes/ConfigStore.md) | A class to manage the configuration state for plugins in a Redux store. |
| [PluginManager](classes/PluginManager.md) | A wrapper class for initiating calls to Electron via desktopApi for managing plugins. |
| [Registry](classes/Registry.md) | - |

### Interfaces

| Interface | Description |
| ------ | ------ |
| [AppLogoProps](interfaces/AppLogoProps.md) | - |
| [CallbackActionOptions](interfaces/CallbackActionOptions.md) | - |
| [ClusterChooserProps](interfaces/ClusterChooserProps.md) | - |
| [CreateResourceEvent](interfaces/CreateResourceEvent.md) | Event fired when creating a resource. |
| [DeleteResourceEvent](interfaces/DeleteResourceEvent.md) | Event fired when a resource is to be deleted. |
| [DetailsViewSectionProps](interfaces/DetailsViewSectionProps.md) | - |
| [EditResourceEvent](interfaces/EditResourceEvent.md) | Event fired when editing a resource. |
| [ErrorBoundaryEvent](interfaces/ErrorBoundaryEvent.md) | Event fired when an error boundary is triggered. |
| [EventListEvent](interfaces/EventListEvent.md) | Event fired when kubernetes events are loaded (for a resource or not). |
| [HeadlampEvent](interfaces/HeadlampEvent.md) | Represents a Headlamp event. It can be one of the default events or a custom event. |
| [IconDefinition](interfaces/IconDefinition.md) | - |
| [LogsEvent](interfaces/LogsEvent.md) | Event fired when viewing pod logs. |
| [OverviewChartsProcessor](interfaces/OverviewChartsProcessor.md) | - |
| [PluginLoadingErrorEvent](interfaces/PluginLoadingErrorEvent.md) | Event fired when there is an error while loading a plugin. |
| [PluginSettingsDetailsProps](interfaces/PluginSettingsDetailsProps.md) | Props for PluginSettingsDetailsProps component. |
| [PluginsLoadedEvent](interfaces/PluginsLoadedEvent.md) | Event fired when all plugins are loaded. |
| [PodAttachEvent](interfaces/PodAttachEvent.md) | Event fired when attaching to a pod. |
| [ResourceDetailsViewLoadedEvent](interfaces/ResourceDetailsViewLoadedEvent.md) | Event fired when a resource is loaded in the details view. |
| [ResourceListViewLoadedEvent](interfaces/ResourceListViewLoadedEvent.md) | Event fired when a list view is loaded for a resource. |
| [RestartResourceEvent](interfaces/RestartResourceEvent.md) | Event fired when restarting a resource. |
| [ScaleResourceEvent](interfaces/ScaleResourceEvent.md) | Event fired when scaling a resource. |
| [SectionFuncProps](interfaces/SectionFuncProps.md) | - |
| [SidebarEntryProps](interfaces/SidebarEntryProps.md) | Represents an entry in the sidebar menu. |
| [TerminalEvent](interfaces/TerminalEvent.md) | Event fired when using the terminal. |

### Type Aliases

| Type alias | Description |
| ------ | ------ |
| [AppBarActionProcessorType](type-aliases/AppBarActionProcessorType.md) | - |
| [AppLogoType](type-aliases/AppLogoType.md) | - |
| [ClusterChooserType](type-aliases/ClusterChooserType.md) | - |
| [DetailsViewHeaderActionType](type-aliases/DetailsViewHeaderActionType.md) | - |
| [DetailsViewHeaderActionsProcessor](type-aliases/DetailsViewHeaderActionsProcessor.md) | - |
| [DetailsViewSectionType](type-aliases/DetailsViewSectionType.md) | - |
| [GraphSource](type-aliases/GraphSource.md) | Graph Source defines a group of Nodes and Edges that can be loaded on the Map |
| [HeadlampEventCallback](type-aliases/HeadlampEventCallback.md) | - |
| [PluginSettingsComponentType](type-aliases/PluginSettingsComponentType.md) | PluginSettingsComponentType is the type of the component associated with the plugin's settings. |
| [sectionFunc](type-aliases/sectionFunc.md) | - |

### Variables

| Variable | Description |
| ------ | ------ |
| [DefaultHeadlampEvents](variables/DefaultHeadlampEvents.md) | - |
| [DetailsViewDefaultHeaderActions](variables/DetailsViewDefaultHeaderActions.md) | - |

### Functions

| Function | Description |
| ------ | ------ |
| [clusterAction](functions/clusterAction.md) | Starts an action after a period of time giving the user an opportunity to cancel the action. |
| [getHeadlampAPIHeaders](functions/getHeadlampAPIHeaders.md) | Returns headers for making API calls to the headlamp-server backend. |
| [registerAddClusterProvider](functions/registerAddClusterProvider.md) | For adding a card to the Add Cluster page in the providers list. |
| [registerAppBarAction](functions/registerAppBarAction.md) | Add a component into the app bar (at the top of the app). |
| [registerAppLogo](functions/registerAppLogo.md) | Add a logo for Headlamp to use instead of the default one. |
| [registerAppTheme](functions/registerAppTheme.md) | Add a new theme that will be available in the settings. Theme name should be unique |
| [registerClusterChooser](functions/registerClusterChooser.md) | Use a custom cluster chooser button |
| [registerClusterProviderDialog](functions/registerClusterProviderDialog.md) | Register a new cluster provider dialog. |
| [registerClusterProviderMenuItem](functions/registerClusterProviderMenuItem.md) | Register a new cluster action menu item. |
| [registerClusterStatus](functions/registerClusterStatus.md) | Register a new cluster status component. |
| [registerCustomCreateProject](functions/registerCustomCreateProject.md) | Register a new way to create Headlamp 'Projects' |
| [registerDetailsViewHeaderAction](functions/registerDetailsViewHeaderAction.md) | Add a component into the details view header. |
| [registerDetailsViewHeaderActionsProcessor](functions/registerDetailsViewHeaderActionsProcessor.md) | Add a processor for the details view header actions. Allowing the modification of header actions. |
| [registerDetailsViewSection](functions/registerDetailsViewSection.md) | Append a component to the details view for a given resource. |
| [registerDetailsViewSectionsProcessor](functions/registerDetailsViewSectionsProcessor.md) | Add a processor for the details view sections. Allowing the modification of what sections are shown. |
| [registerGetTokenFunction](functions/registerGetTokenFunction.md) | Override headlamp getToken method |
| [registerHeadlampEventCallback](functions/registerHeadlampEventCallback.md) | Add a callback for headlamp events. |
| [registerKindIcon](functions/registerKindIcon.md) | Register Icon for a resource kind |
| [registerKubeObjectGlance](functions/registerKubeObjectGlance.md) | Custom glance component for Kubernetes objects in Headlamp's graph view. |
| [registerMapSource](functions/registerMapSource.md) | Registers a new graph source in the store. |
| [registerOverviewChartsProcessor](functions/registerOverviewChartsProcessor.md) | Add a processor for the overview charts section. Allowing the addition or modification of charts. |
| [registerPluginSettings](functions/registerPluginSettings.md) | Register a plugin settings component. |
| [registerProjectDeleteButton](functions/registerProjectDeleteButton.md) | Override default project delete button |
| [registerProjectDetailsTab](functions/registerProjectDetailsTab.md) | Register a new tab in the project details view. |
| [registerProjectHeaderAction](functions/registerProjectHeaderAction.md) | Register a new action button in the project details header. |
| [registerProjectOverviewSection](functions/registerProjectOverviewSection.md) | Register a new section in the project overview page. |
| [registerResourceTableColumnsProcessor](functions/registerResourceTableColumnsProcessor.md) | Add a processor for the resource table columns. Allowing the modification of what tables show. |
| [registerRoute](functions/registerRoute.md) | Add a Route for a component. |
| [registerRouteFilter](functions/registerRouteFilter.md) | Remove routes. |
| [registerSetTokenFunction](functions/registerSetTokenFunction.md) | Override headlamp setToken method |
| [registerSidebarEntry](functions/registerSidebarEntry.md) | Add a Sidebar Entry to the menu (on the left side of Headlamp). |
| [registerSidebarEntryFilter](functions/registerSidebarEntryFilter.md) | Remove sidebar menu items. |
| [registerUIPanel](functions/registerUIPanel.md) | Registers a UI panel in the application's UI. |
| [runCommand](functions/runCommand.md) | Runs a shell command and returns an object that mimics the interface of a ChildProcess object returned by Node's spawn function. |
