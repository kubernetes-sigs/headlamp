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

import { has } from 'lodash';
import React, { ReactNode } from 'react';
import { AppLogoProps, AppLogoType } from '../components/App/AppLogo';
import { PluginManager } from '../components/App/pluginManager';
import { runCommand } from '../components/App/runCommand';
import { setBrandingAppLogoComponent, themeSlice } from '../components/App/themeSlice';
import { ClusterChooserProps, ClusterChooserType } from '../components/cluster/ClusterChooser';
import {
  addResourceTableColumnsProcessor,
  TableColumnsProcessor,
} from '../components/common/Resource/resourceTableSlice';
import { SectionBox } from '../components/common/SectionBox';
import { DetailsViewSectionProps, DetailsViewSectionType } from '../components/DetailsViewSection';
import {
  addDetailsViewSectionsProcessor,
  DefaultDetailsViewSection,
  DetailsViewsSectionProcessor,
  setDetailsViewSection,
} from '../components/DetailsViewSection/detailsViewSectionSlice';
import { GraphSource } from '../components/resourceMap/graph/graphModel';
import { Glance, graphViewSlice, IconDefinition } from '../components/resourceMap/graphViewSlice';
import { DefaultSidebars, SidebarEntryProps } from '../components/Sidebar';
import { setSidebarItem, setSidebarItemFilter } from '../components/Sidebar/sidebarSlice';
import { getHeadlampAPIHeaders } from '../helpers/getHeadlampAPIHeaders';
import { AppTheme } from '../lib/AppTheme';
import { KubeObject } from '../lib/k8s/KubeObject';
import type { Route } from '../lib/router/Route';
import {
  addDetailsViewHeaderActionsProcessor,
  AppBarAction,
  AppBarActionProcessorType,
  AppBarActionsProcessor,
  AppBarActionType,
  DefaultAppBarAction,
  DefaultHeaderAction,
  HeaderActionsProcessor,
  HeaderActionType,
  setAppBarAction,
  setAppBarActionsProcessor,
  setDetailsViewHeaderAction,
} from '../redux/actionButtonsSlice';
import {
  CallbackAction,
  CallbackActionOptions,
  clusterAction as sendClusterAction,
} from '../redux/clusterActionSlice';
import {
  addAddClusterProvider,
  addClusterStatus,
  addDialog,
  addMenuItem,
  ClusterProviderInfo,
  ClusterStatusComponent,
  DialogComponent,
  MenuItemComponent,
} from '../redux/clusterProviderSlice';
import {
  addEventCallback,
  CreateResourceEvent,
  DeleteResourceEvent,
  EditResourceEvent,
  ErrorBoundaryEvent,
  EventListEvent,
  HeadlampEvent,
  HeadlampEventCallback,
  HeadlampEventType,
  LogsEvent,
  PluginLoadingErrorEvent,
  PluginsLoadedEvent,
  PodAttachEvent,
  ResourceDetailsViewLoadedEvent,
  ResourceListViewLoadedEvent,
  RestartResourceEvent,
  ScaleResourceEvent,
  TerminalEvent,
} from '../redux/headlampEventSlice';
import { addOverviewChartsProcessor, OverviewChartsProcessor } from '../redux/overviewChartsSlice';
import {
  addCustomCreateProject,
  addDetailsTab,
  addOverviewSection,
  CustomCreateProject,
  ProjectDeleteButton,
  ProjectDetailsTab,
  ProjectOverviewSection,
  setProjectDeleteButton,
} from '../redux/projectsSlice';
import { setRoute, setRouteFilter } from '../redux/routesSlice';
import store from '../redux/stores/store';
import { UIPanel, uiSlice } from '../redux/uiSlice';
import { ConfigStore } from './configStore';
import {
  PluginSettingsComponentType,
  PluginSettingsDetailsProps,
  setPluginSettingsComponent,
} from './pluginsSlice';

export interface SectionFuncProps {
  title: string;
  component: (props: { resource: any }) => ReactNode;
}

export type {
  AppLogoProps,
  AppLogoType,
  ClusterChooserProps,
  ClusterChooserType,
  DefaultSidebars,
  DetailsViewSectionProps,
  DetailsViewSectionType,
  SidebarEntryProps,
  HeadlampEventCallback,
  HeadlampEvent,
  ErrorBoundaryEvent,
  DeleteResourceEvent,
  EditResourceEvent,
  ScaleResourceEvent,
  RestartResourceEvent,
  LogsEvent,
  TerminalEvent,
  PodAttachEvent,
  CreateResourceEvent,
  PluginLoadingErrorEvent,
  PluginsLoadedEvent,
  ResourceDetailsViewLoadedEvent,
  ResourceListViewLoadedEvent,
  EventListEvent,
  PluginSettingsDetailsProps,
  PluginSettingsComponentType,
  GraphSource,
  IconDefinition,
  OverviewChartsProcessor,
};
export const DefaultHeadlampEvents = HeadlampEventType;
export const DetailsViewDefaultHeaderActions = DefaultHeaderAction;
export type { AppBarActionProcessorType };
/**
 * @deprecated please used DetailsViewSectionType and registerDetailViewSection
 */
export type sectionFunc = (resource: KubeObject) => SectionFuncProps | null | undefined;

// @todo: these might be better with a more well defined interface.
//        So that things like importing material-ui stuff,
//        tooltips and a11y stuff can be done.
//        Maybe in a ResourceAction component? That is used by Headlamp too.
// @todo: these should also have a *Props
// @todo: HeaderActionType should be deprecated.
export type DetailsViewHeaderActionType = HeaderActionType;
export type DetailsViewHeaderActionsProcessor = HeaderActionsProcessor;

export default class Registry {
  /**
   * @deprecated Registry.registerSidebarItem is deprecated. Please use registerSidebarItem.
   */
  registerSidebarItem(
    parentName: string | null,
    itemName: string,
    itemLabel: string,
    url: string,
    opts: Pick<SidebarEntryProps, 'sidebar' | 'useClusterURL' | 'icon'> = { useClusterURL: true }
  ) {
    console.warn('Registry.registerSidebarItem is deprecated. Please use registerSidebarItem.');
    const { useClusterURL = true, ...options } = opts;
    store.dispatch(
      setSidebarItem({
        name: itemName,
        label: itemLabel,
        url,
        parent: parentName,
        useClusterURL,
        ...options,
      })
    );
  }

  /**
   * @deprecated Registry.registerRoute is deprecated. Please use registerRoute.
   */
  registerRoute(routeSpec: Route) {
    console.warn('Registry.registerRoute is deprecated. Please use registerRoute.');
    return registerRoute(routeSpec);
  }

  /**
   * @deprecated Registry.registerDetailsViewHeaderAction is deprecated. Please use registerDetailsViewHeaderAction.
   */
  registerDetailsViewHeaderAction(actionName: string, actionFunc: HeaderActionType) {
    console.warn(
      'Registry.registerDetailsViewHeaderAction is deprecated. Please use registerDetailsViewHeaderAction.'
    );
    store.dispatch(setDetailsViewHeaderAction(actionFunc));
  }

  /**
   * @deprecated Registry.registerAppBarAction is deprecated. Please use registerAppBarAction.
   */
  registerAppBarAction(actionName: string, actionFunc: (...args: any[]) => ReactNode) {
    console.warn('Registry.registerAppBarAction is deprecated. Please use registerAppBarAction.');
    return registerAppBarAction(actionFunc);
  }

  /**
   * @deprecated Registry.registerDetailsViewSection is deprecated. Please use registerDetailsViewSection.
   *
   * ```tsx
   *
   * register.registerDetailsViewSection('biolatency', resource => {
   *   if (resource?.kind === 'Node') {
   *     return {
   *       title: 'Block I/O Latency',
   *       component: () => <CustomComponent />,
   *     };
   *   }
   *   return null;
   * });
   *
   * ```
   */
  registerDetailsViewSection(
    sectionName: string,
    sectionFunc: (resource: KubeObject) => SectionFuncProps | null
  ) {
    console.warn(
      'Registry.registerDetailsViewSection is deprecated. Please use registerDetailsViewSection.'
    );

    function OurComponent({ resource }: DetailsViewSectionProps) {
      const res = sectionFunc(resource);
      if (res === null) {
        return null;
      }

      return (
        <SectionBox title={sectionName}>
          <res.component resource={resource} />
        </SectionBox>
      );
    }

    return registerDetailsViewSection(OurComponent);
  }

  /**
   * @deprecated Registry.registerAppLogo is deprecated. Please use registerAppLogo.
   */
  registerAppLogo(logo: AppLogoType) {
    console.warn('Registry.registerAppLogo is deprecated. Please use registerAppLogo.');
    return registerAppLogo(logo);
  }

  /**
   * @deprecated Registry.registerClusterChooserComponent is deprecated. Please use registerClusterChooser.
   */
  registerClusterChooserComponent(component: React.ComponentType<ClusterChooserProps> | null) {
    console.warn(
      'Registry.registerClusterChooserComponent is deprecated. Please use registerClusterChooser.'
    );
    return registerClusterChooser(component);
  }
}

/**
 * Add a Sidebar Entry to the menu (on the left side of Headlamp).
 *
 * @example
 *
 * ```tsx
 * import { registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
 * registerSidebarEntry({ parent: 'cluster', name: 'traces', label: 'Traces', url: '/traces' });
 *
 * ```
 *
 * @see {@link http://github.com/kinvolk/headlamp/plugins/examples/sidebar/ Sidebar Example}
 */
export function registerSidebarEntry({
  parent,
  name,
  label,
  url,
  useClusterURL = true,
  icon,
  sidebar,
}: SidebarEntryProps) {
  store.dispatch(
    setSidebarItem({
      name,
      label,
      url,
      parent,
      useClusterURL,
      icon,
      sidebar,
    })
  );
}

/**
 * Custom glance component for Kubernetes objects in Headlamp's graph view.
 *
 * @param glance - The glance object with a unique id and a React component to render.
 *
 * @example
 *
 * ```tsx
import { registerKubeObjectGlance } from '@kinvolk/headlamp-plugin/lib';

const NodeGlance = ({ node }) => {
  // Check if the node represents a Kubernetes Node object
  if (node.kubeObject && node.kubeObject.kind === 'Node') {
    return (
      <div>
        <strong>Node:</strong> {node.kubeObject.metadata?.name} (CPU: {node.kubeObject.status?.capacity?.cpu || 'N/A'})
      </div>
    );
  }

  // Handle non-Kubernetes nodes with label or fallback to a default
  if (node.label) {
    return (
      <div>
        <strong>Node:</strong> {node.label}
      </div>
    );
  }

  // Return null if the node cannot be rendered by this glance
  return null;
};

registerKubeObjectGlance({ id: 'node-glance', component: NodeGlance });
 * ```
 */
export function registerKubeObjectGlance(glance: Glance) {
  store.dispatch(graphViewSlice.actions.setGlance(glance));
}

/**
 * Remove sidebar menu items.
 *
 * @param filterFunc - a function for filtering sidebar entries.
 *
 * @example
 *
 * ```tsx
 * import { registerSidebarEntryFilter } from '@kinvolk/headlamp-plugin/lib';
 *
 * registerSidebarEntryFilter(entry => (entry.name === 'workloads' ? null : entry));
 * ```
 */
export function registerSidebarEntryFilter(
  filterFunc: (entry: SidebarEntryProps) => SidebarEntryProps | null
) {
  store.dispatch(setSidebarItemFilter(filterFunc));
}

/**
 * Remove routes.
 *
 * @param filterFunc - a function for filtering routes.
 *
 * @example
 *
 * ```tsx
 * import { registerRouteFilter } from '@kinvolk/headlamp-plugin/lib';
 *
 * registerRouteFilter(route => (route.path === '/workloads' ? null : route));
 * ```
 */
export function registerRouteFilter(filterFunc: (entry: Route) => Route | null) {
  store.dispatch(setRouteFilter(filterFunc));
}

/**
 * Add a Route for a component.
 *
 * @param routeSpec - details of URL, highlighted sidebar and component to use.
 *
 * @example
 *
 * ```tsx
 * import { registerRoute } from '@kinvolk/headlamp-plugin/lib';
 *
 * // Add a route that will display the given component and select
 * // the "traces" sidebar item.
 * registerRoute({
 *   path: '/traces',
 *   sidebar: 'traces',
 *   component: () => <TraceList />
 * });
 * ```
 *
 * @see {@link https://github.com/kinvolk/headlamp/blob/main/frontend/src/lib/router.tsx Route examples}
 * @see {@link http://github.com/kinvolk/headlamp/plugins/examples/sidebar/ Sidebar Example}
 *
 */
export function registerRoute(routeSpec: Route) {
  store.dispatch(setRoute(routeSpec));
}

/**
 * Add a component into the details view header.
 *
 * @param headerAction - The action (link) to put in the app bar.
 *
 * @example
 *
 * ```tsx
 * import { ActionButton } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
 * import { registerDetailsViewHeaderAction } from '@kinvolk/headlamp-plugin/lib';
 *
 * function IconAction() {
 *   return (
 *     <ActionButton
 *      description="Launch"
 *      icon="mdi:comment-quote"
 *      onClick={() => console.log('Hello from IconAction!')}
 *    />
 *   )
 * }
 *
 * registerDetailsViewHeaderAction(IconAction);
 * ```
 */
export function registerDetailsViewHeaderAction(headerAction: DetailsViewHeaderActionType) {
  store.dispatch(setDetailsViewHeaderAction(headerAction));
}

/**
 * Add a processor for the details view header actions. Allowing the modification of header actions.
 *
 * @param processor - The processor to add. Receives a resource (for which we are processing the header actions) and the current header actions and returns the new header actions. Return an empty array to remove all header actions.
 *
 * @example
 *
 * ```tsx
 * import { registerDetailsViewHeaderActionsProcessor, DetailsViewDefaultHeaderActions } from '@kinvolk/headlamp-plugin/lib';
 *
 * // Processor that removes the default edit action.
 * registerDetailsViewHeaderActionsProcessor((resource, headerActions) => {
 *  return headerActions.filter(action => action.name !== DetailsViewDefaultHeaderActions.EDIT);
 * });
 *
 * More complete detail view example in plugins/examples/details-view:
 * @see {@link http://github.com/kinvolk/headlamp/plugins/examples/details-view/ Detail View Example}
 *
 */
export function registerDetailsViewHeaderActionsProcessor(
  processor: DetailsViewHeaderActionsProcessor | DetailsViewHeaderActionsProcessor['processor']
) {
  store.dispatch(addDetailsViewHeaderActionsProcessor(processor));
}

/**
 * Add a processor for the resource table columns. Allowing the modification of what tables show.
 *
 * @param processor - The processor ID and function. See #TableColumnsProcessor.
 *
 * @example
 *
 * ```tsx
 * import { registerResourceTableColumnsProcessor } from '@kinvolk/headlamp-plugin/lib';
 *
 * // Processor that adds a column to show how many init containers pods have (in the default pods' list table).
 * registerResourceTableColumnsProcessor(function ageRemover({ id, columns }) {
 *   if (id === 'headlamp-pods') {
 *     columns.push({
 *       label: 'Init Containers',
 *       // return plain value to allow filtering and sorting
 *       getValue: (pod: Pod) => {
 *         return pod.spec.initContainers.length;
 *       }
 *       // (optional) customise how the cell value is rendered
 *       render: (pod: Pod) => <div style={{ color: "red" }}>{pod.spec.initContainers.length}</div>
 *     });
 *   }
 *
 *   return columns;
 * });
 * ```
 */
export function registerResourceTableColumnsProcessor(
  processor: TableColumnsProcessor | TableColumnsProcessor['processor']
) {
  store.dispatch(addResourceTableColumnsProcessor(processor));
}

function isProcessor(
  headerAction: AppBarActionType | AppBarAction | AppBarActionsProcessor | AppBarActionProcessorType
): boolean {
  return !!(
    headerAction &&
    (has(headerAction, 'processor') ||
      (typeof headerAction === 'function' && headerAction.length === 1))
  );
}

/**
 * Add a component into the app bar (at the top of the app).
 *
 * @param headerAction - The action (link) to put in the app bar.
 *
 * @example
 *
 * ```tsx
 * import { registerAppBarAction } from '@kinvolk/headlamp-plugin/lib';
 * import { Button } from '@mui/material';
 *
 * function ConsoleLogger() {
 *   return (
 *     <Button
 *       onClick={() => {
 *         console.log('Hello from ConsoleLogger!')
 *       }}
 *     >
 *       Print Log
 *     </Button>
 *   );
 * }
 *
 * registerAppBarAction(ConsoleLogger);
 * ```
 */
export function registerAppBarAction(
  headerAction: AppBarActionType | AppBarAction | AppBarActionsProcessor | AppBarActionProcessorType
) {
  if (isProcessor(headerAction)) {
    store.dispatch(setAppBarActionsProcessor(headerAction as AppBarActionsProcessor));
  }
  store.dispatch(setAppBarAction(headerAction as AppBarAction));
}

/**
 * Append a component to the details view for a given resource.
 *
 * @param viewSection - The section to add on different view screens.
 *
 * @example
 *
 * ```tsx
 * import {
 *   registerDetailsViewSection,
 *   DetailsViewSectionProps
 * } from '@kinvolk/headlamp-plugin/lib';
 *
 * registerDetailsViewSection(({ resource }: DetailsViewSectionProps) => {
 *   if (resource.kind === 'Pod') {
 *     return (
 *       <SectionBox title="A very fine section title">
 *         The body of our Section for {resource.kind}
 *       </SectionBox>
 *     );
 *   }
 *   return null;
 * });
 * ```
 */
export function registerDetailsViewSection(viewSection: DetailsViewSectionType) {
  store.dispatch(setDetailsViewSection(viewSection));
}

/**
 * Add a processor for the details view sections. Allowing the modification of what sections are shown.
 *
 * @param processor - The processor to add. Receives a resource (for which we are processing the sections) and the current sections and returns the new sections. Return an empty array to remove all sections.
 *
 * @example
 *
 * ```tsx
 * import { registerDetailsViewSectionsProcessor } from '@kinvolk/headlamp-plugin/lib';
 *
 * registerDetailsViewSectionsProcessor(function addTopSection( resource, sections ) {
 *   // Ignore if there is no resource.
 *   if (!resource) {
 *    return sections;
 *   }
 *
 *   // Check if we already have added our custom section (this function may be called multiple times).
 *   const customSectionId = 'my-custom-section';
 *   if (sections.findIndex(section => section.id === customSectionId) !== -1) {
 *     return sections;
 *   }
 *
 *   return [
 *     {
 *       id: 'my-custom-section',
 *       section: (
 *         <SectionBox title="I'm the top of the world!" />
         ),
 *     },
 *     ...sections,
 *   ];
 * });
 * ```
 */
export function registerDetailsViewSectionsProcessor(
  processor: DetailsViewsSectionProcessor | DetailsViewsSectionProcessor['processor']
) {
  store.dispatch(addDetailsViewSectionsProcessor(processor));
}

/**
 * Add a logo for Headlamp to use instead of the default one.
 *
 * @param logo is a React Component that takes two required props
 * `logoType` which is a constant string literal that accepts either
 * of the two values `small` or `large` depending on whether
 * the sidebar is in shrink or expanded state so that you can change your logo
 * from small to large and the other optional prop is the `themeName`
 * which is a string with two values 'light' and 'dark' base on which theme is selected.
 *
 * @example
 *
 * ```tsx
 * import { registerAppLogo } from '@kinvolk/headlamp-plugin/lib';
 *
 * registerAppLogo(<p>my logo</p>)
 * ```
 *
 * More complete logo example in plugins/examples/change-logo:
 * @see {@link http://github.com/kinvolk/headlamp/plugins/examples/change-logo/ Change Logo Example}
 *
 */
export function registerAppLogo(logo: AppLogoType) {
  store.dispatch(setBrandingAppLogoComponent(logo));
}

/**
 * Use a custom cluster chooser button
 *
 * @param chooser is a React Component that takes one required props ```clickHandler``` which is the
 * action handler that happens when the custom chooser button component click event occurs
 *
 * @example
 *
 * ```tsx
 * import { ClusterChooserProps, registerClusterChooser } from '@kinvolk/headlamp-plugin/lib';
 *
 * registerClusterChooser(({ clickHandler, cluster }: ClusterChooserProps) => {
 *   return <button onClick={clickHandler}>my chooser Current cluster: {cluster}</button>;
 * })
 * ```
 *
 * @see {@link http://github.com/kinvolk/headlamp/plugins/examples/cluster-chooser/ Cluster Chooser example}
 *
 */
export function registerClusterChooser(chooser: ClusterChooserType) {
  store.dispatch(uiSlice.actions.setClusterChooserButton(chooser));
}

/**
 * Override headlamp setToken method
 * @param override - The setToken override method to use.
 *
 * @example
 *
 * ```ts
 * registerSetTokenFunction((cluster: string, token: string | null) => {
 * // set token logic here
 * });
 * ```
 */
export function registerSetTokenFunction(
  override: (cluster: string, token: string | null) => void
) {
  store.dispatch(uiSlice.actions.setFunctionsToOverride({ setToken: override }));
}

/**
 * Override headlamp getToken method
 * @param override - The getToken override method to use.
 *
 * @example
 *
 * ```ts
 * registerGetTokenFunction(() => {
 * // set token logic here
 * });
 * ```
 */
export function registerGetTokenFunction(override: (cluster: string) => string | undefined) {
  store.dispatch(uiSlice.actions.setFunctionsToOverride({ getToken: override }));
}

/**
 * Add a callback for headlamp events.
 * @param callback - The callback to add.
 *
 * @example
 *
 * ```ts
 * import {
 *   DefaultHeadlampEvents,
 *   registerHeadlampEventCallback,
 *   HeadlampEvent,
 * } from '@kinvolk/headlamp-plugin/lib';
 *
 * registerHeadlampEventCallback((event: HeadlampEvent) => {
 *   if (event.type === DefaultHeadlampEvents.ERROR_BOUNDARY) {
 *     console.error('Error:', event.data);
 *   } else {
 *     console.log(`Headlamp event of type ${event.type}: ${event.data}`)
 *   }
 * });
 * ```
 */
export function registerHeadlampEventCallback(callback: HeadlampEventCallback) {
  store.dispatch(addEventCallback(callback));
}

/**
 * Register a plugin settings component.
 *
 * @param name - The name of the plugin.
 * @param component - The component to use for the settings.
 * @param displaySaveButton - Whether to display the save button.
 * @returns void
 *
 * @example
 *
 * ```tsx
 * import { registerPluginSettings } from '@kinvolk/headlamp-plugin/lib';
 * import { TextField } from '@mui/material';
 *
 * function MyPluginSettingsComponent(props: PluginSettingsDetailsProps) {
 *   const { data, onDataChange } = props;
 *
 *   function onChange(value: string) {
 *     if (onDataChange) {
 *       onDataChange({ works: value });
 *     }
 *   }
 *
 *   return (
 *     <TextField
 *       value={data?.works || ''}
 *       onChange={e => onChange(e.target.value)}
 *       label="Normal Input"
 *       variant="outlined"
 *       fullWidth
 *     />
 *   );
 * }
 *
 * const displaySaveButton = true;
 * // Register a plugin settings component.
 * registerPluginSettings('my-plugin', MyPluginSettingsComponent, displaySaveButton);
 * ```
 *
 * More complete plugin settings example in plugins/examples/change-logo:
 * @see {@link https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/change-logo Change Logo Example}
 */
export function registerPluginSettings(
  name: string,
  component: PluginSettingsComponentType,
  displaySaveButton: boolean = false
) {
  store.dispatch(setPluginSettingsComponent({ name, component, displaySaveButton }));
}

/**
 * Add a processor for the overview charts section. Allowing the addition or modification of charts.
 *
 * @param processor - The processor to add. Returns the new charts to be displayed.
 *
 * @example
 *
 * ```tsx
 * import { registerOverviewChartsProcessor } from '@kinvolk/headlamp-plugin/lib';
 *
 * registerOverviewChartsProcessor(function addFailedPodsChart(charts) {
 *   return [
 *     ...charts,
 *     {
 *       id: 'failed-pods',
 *       component: () => <FailedPodsChart />
 *     }
 *   ];
 * });
 * ```
 */
export function registerOverviewChartsProcessor(processor: OverviewChartsProcessor) {
  store.dispatch(addOverviewChartsProcessor(processor));
}

/**
 * Registers a new graph source in the store.
 *
 * @param {GraphSource} source - The graph source to be registered.
 * @example
 *
 * ```tsx
 * const mySource = {
 *   id: 'my-source',
 *   label: 'Sample source',
 *   useData() {
 *     return {
 *       nodes: [{ id: 'my-node', type: 'kubeObject', data: { resource: myCustomResource } }],
 *       edges: []
 *     };
 *   }
 * }
 *
 * registerMapSource(mySource);
 * ```
 */
export function registerMapSource(source: GraphSource) {
  store.dispatch(graphViewSlice.actions.addGraphSource(source));
}

/**
 * Register Icon for a resource kind
 *
 * @param kind - Resource kind
 * @param {IconDefinition} definition - icon definition
 * @param definition.icon - React Element of the icon
 * @param definition.color - Color for the icon, optional
 *
 * @example
 *
 * ```tsx
 * registerKindIcon("MyCustomResource", { icon: <MyIcon />, color: "#FF0000" })
 * ```
 */
export function registerKindIcon(kind: string, definition: IconDefinition) {
  store.dispatch(graphViewSlice.actions.addKindIcon({ kind, definition }));
}

/**
 * Register a new cluster action menu item.
 * @param item - The item to add to the cluster action menu.
 *
 * @example
 *
 * ```tsx
 * import { registerClusterProviderMenuItem } from '@kinvolk/headlamp-plugin/lib';
 * import { MenuItem, ListItemText } from '@mui/material';
 * registerClusterProviderMenuItem(({cluster, setOpenConfirmDialog, handleMenuClose}) => {
 *  const isMinikube =
 *   cluster.meta_data?.extensions?.context_info?.provider === 'minikube.sigs.k8s.io';
 *   if (!isElectron() !! !isMinikube) {
 *     return null;
 *   }
 *   return (
 *     <MenuItem
 *       onClick={() => {
 *        setOpenConfirmDialog('deleteMinikube');
 *        handleMenuClose();
 *       }}
 *     >
 *       <ListItemText>{t('translation|Delete')}</ListItemText>
 *     </MenuItem>
 *   );
 * )}
 * ```
 *
 */
export function registerClusterProviderMenuItem(item: MenuItemComponent) {
  store.dispatch(addMenuItem(item));
}

/**
 * Register a new cluster status component.
 *
 * @param item - The component to add to the cluster status.
 * Item is a function/component and its props are cluster and error.
 *
 * @example
 * ```tsx
 * import { registerClusterStatus } from '@kinvolk/headlamp-plugin/lib';
 * import { ClusterStatus } from './ClusterStatus';
 * registerClusterStatus(({ cluster, error }) => {
 *   if (!isElectron() || !isMinikube(cluster)) {
 *     return null;
 *   }
 *   return <ClusterStatus cluster={cluster} error={error} />;
 * });
 * ```
 */
export function registerClusterStatus(item: ClusterStatusComponent) {
  store.dispatch(addClusterStatus(item));
}

/**
 * Register a new cluster provider dialog.
 *
 * These dialogs are used to show actions that can be performed on a cluster.
 * For example, starting, stopping, or deleting a cluster.
 *
 * @param item - The item to add to the cluster provider dialog.
 * @param item.cluster - The cluster to show the dialog for.
 * @param item.openConfirmDialog - The name of the dialog to open. Null if no dialog is open.
 * @param item.setOpenConfirmDialog - The function to set the dialog to open.
 *                                    Call it with null when dialog is closed.
 *
 * @example
 *
 * ```tsx
 * import { registerClusterProviderDialog } from '@kinvolk/headlamp-plugin/lib';
 * import { CommandCluster } from './CommandCluster';
 *
 * registerClusterProviderDialog(({cluster, openConfirmDialog, setOpenConfirmDialog}) => {
 *
 *   const isMinikube =
 *   cluster.meta_data?.extensions?.context_info?.provider === 'minikube.sigs.k8s.io';
 *   if (!isElectron() !! !isMinikube) {
 *     return null;
 *   }
 *
 *   return (
 *     <CommandCluster
 *       initialClusterName={cluster.name}
 *       open={openConfirmDialog === 'startMinikube'}
 *       handleClose={() => setOpenConfirmDialog(null)}
 *       onConfirm={() => {
 *         setOpenConfirmDialog(null);
 *       }}
 *       command={'start'}
 *       finishedText={'Done! kubectl is now configured'}
 *     />
 *   );
 * });
 *
 * ```
 *
 */
export function registerClusterProviderDialog(item: DialogComponent) {
  store.dispatch(addDialog(item));
}

/**
 * For adding a card to the Add Cluster page in the providers list.
 * @param item - The iformation to add to the Add Cluster page.
 *
 * @example
 *
 * ```tsx
 * import { useTranslation } from 'react-i18next';
 * import { registerAddClusterProvider } from '@kinvolk/headlamp-plugin/lib';
 * import { Card, CardHeader, CardContent, Typography, Button } from '@mui/material';
 * import { MinikubeIcon } from './MinikubeIcon';
 * const { t } = useTranslation();
 *
 * registerAddClusterProvider({
 *   title: 'Minikube',
 *   icon: MinikubeIcon,
 *   description:
 *     'Minikube is a lightweight tool that simplifies the process of setting up a Kubernetes environment on your local PC. It provides a localStorage, single-node Kubernetes cluster that you can use for learning, development, and testing purposes.',
 *   url: '/create-cluster-minikube',
 * });
 *
 * ```
 *
 */
export function registerAddClusterProvider(item: ClusterProviderInfo) {
  store.dispatch(addAddClusterProvider(item));
}

/**
 * Add a new theme that will be available in the settings.
 * Theme name should be unique
 *
 * @param theme - App Theme definition
 *
 * @example
 *
 * ```ts
 * registerAppTheme({
 *   name: "My Custom Theme",
 *   base: "light",
 *   primary: "#ff0000",
 *   secondary: "#333",
 * })
 *
 */
export function registerAppTheme(theme: AppTheme) {
  store.dispatch(themeSlice.actions.addCustomAppTheme(theme));
}

/**
 * Starts an action after a period of time giving the user an opportunity to cancel the action.
 *
 * @param callback - called after some time.
 * @param actionOptions - options for text messages and callbacks.
 *
 * @example
 *
 * ```tsx
 *   clusterAction(() => runFunc(clusterName), {
 *     startMessage: `About to "${command}" cluster "${clusterName}"…`,
 *     cancelledMessage: `Cancelled "${command}" cluster "${clusterName}".`,
 *     successMessage: `Cluster "${command}" of "${clusterName}" begun.`,
 *     errorMessage: `Failed to "${command}" ${clusterName}.`,
 *     cancelCallback: () => {
 *       setActing(false);
 *       setRunning(false);
 *       handleClose();
 *       setOpenDialog(false);
 *   })
 * ```
 *
 */
export function clusterAction(
  callback: CallbackAction['callback'],
  actionOptions: CallbackActionOptions = {}
) {
  store.dispatch(sendClusterAction(callback, actionOptions));
}

/**
 * Registers a UI panel in the application's UI.
 *
 * See {@link UIPanel} for more details on Panel definition
 *
 * @param panel - The UI panel configuration object to be registered
 * @example
 * ```tsx
 * registerUIPanel({
 *   id: 'my-panel',
 *   location: 'right'
 *   component: () => <div style={{ width: '100px', flexShrink: 0 }}>Hello world</div>,
 * });
 * ```
 */
export function registerUIPanel(panel: UIPanel) {
  store.dispatch(uiSlice.actions.addUIPanel(panel));
}

/**
 * Register a new way to create Headlamp 'Projects'
 *
 * @param customCreateProject - Definition for custom creator
 *
 * @example
 * ```tsx
 * registerCustomCreateProject({
 *   id: "custom-create",
 *   name: "Create Helm Project",
 *   description: "Create new project from Helm chart",
 *   Component: ({onBack}) => <div>
 *     Create project
 *     <input name="helm-chart-id" />
 *     <button>Create</button>
 *     <button onClick={onBack}>Back</button>
 *   </div>,
 * })
 * ```
 */
export function registerCustomCreateProject(customCreateProject: CustomCreateProject) {
  store.dispatch(addCustomCreateProject(customCreateProject));
}

/**
 * Register a new tab in the project details view.
 *
 * This allows plugins to add custom tabs to the project details page,
 * extending the information displayed about a project.
 *
 * @param projectDetailsTab - The tab configuration to register
 * @param projectDetailsTab.id - Unique identifier for the tab
 * @param projectDetailsTab.label - Display label for the tab
 * @param projectDetailsTab.icon - Display icon for the tab
 * @param projectDetailsTab.component - React component to render in the tab content
 * @param projectDetailsTab.isEnabled - Optional function to determine if tab is displayed
 *
 * @example
 * ```tsx
 * registerProjectDetailsTab({
 *   id: 'custom-metrics',
 *   label: 'Metrics',
 *   component: ({ project }) => <ProjectMetrics project={project} />
 * });
 * ```
 */
export function registerProjectDetailsTab(projectDetailsTab: ProjectDetailsTab) {
  store.dispatch(addDetailsTab(projectDetailsTab));
}

/**
 * Register a new section in the project overview page.
 *
 * This allows plugins to add custom sections to the project overview,
 * providing additional information or functionality on the main project page.
 *
 * @param projectOverviewSection - The section configuration to register
 * @param projectOverviewSection.id - Unique identifier for the section
 * @param projectOverviewSection.component - React component to render in the section
 *
 * @example
 * ```tsx
 * registerProjectOverviewSection({
 *   id: 'resource-usage',
 *   component: ({ project }) => <ResourceUsageChart project={project} />
 * });
 * ```
 */
export function registerProjectOverviewSection(projectOverviewSection: ProjectOverviewSection) {
  store.dispatch(addOverviewSection(projectOverviewSection));
}

/**
 * Override default project delete button
 *
 * @param projectDeleteButton.component - React component for custom delete button
 * @param projectDeleteButton.isEnabled - Optional function to determine if button is enabled
 */
export function registerProjectDeleteButton(projectDeleteButton: ProjectDeleteButton) {
  store.dispatch(setProjectDeleteButton(projectDeleteButton));
}

export {
  DefaultAppBarAction,
  DefaultDetailsViewSection,
  getHeadlampAPIHeaders,
  runCommand,
  PluginManager,
  ConfigStore,
};

export type { CallbackActionOptions };
