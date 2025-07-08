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

import { Theme } from '@mui/material/styles';

declare module '@mui/private-theming' {
  interface DefaultTheme extends Theme {}
}

import * as CommonComponents from './components/common';
import * as K8s from './lib/k8s';
import * as ApiProxy from './lib/k8s/apiProxy';
import * as Notification from './lib/notification';
import * as Router from './lib/router';
import * as Utils from './lib/util';
import { Headlamp, Plugin } from './plugin/lib';
import { PluginSettingsDetailsProps } from './plugin/pluginsSlice';
import Registry, {
  AppLogoProps,
  clusterAction,
  ClusterChooserProps,
  ConfigStore,
  DefaultSidebars,
  DetailsViewDefaultHeaderActions,
  DetailsViewSectionProps,
  getHeadlampAPIHeaders,
  PluginManager,
  registerAddClusterProvider,
  registerAppBarAction,
  registerAppLogo,
  registerAppTheme,
  registerClusterChooser,
  registerClusterProviderDialog,
  registerClusterProviderMenuItem,
  registerDetailsViewHeaderAction,
  registerDetailsViewHeaderActionsProcessor,
  registerDetailsViewSection,
  registerGetTokenFunction,
  registerKindIcon,
  registerKubeObjectGlance,
  registerMapSource,
  registerPluginSettings,
  registerResourceTableColumnsProcessor,
  registerRoute,
  registerRouteFilter,
  registerSidebarEntry,
  registerSidebarEntryFilter,
  registerUIPanel,
  runCommand,
} from './plugin/registry';

// We export k8s (lowercase) since someone may use it as we do in the Headlamp source code.
export {
  ApiProxy,
  K8s,
  K8s as k8s,
  CommonComponents,
  Utils,
  Router,
  Plugin,
  Registry,
  Headlamp,
  Notification,
  DetailsViewDefaultHeaderActions,
  getHeadlampAPIHeaders,
  registerAppLogo,
  registerAppBarAction,
  registerClusterChooser,
  registerDetailsViewHeaderAction,
  registerDetailsViewSection,
  registerRoute,
  registerRouteFilter,
  registerSidebarEntry,
  registerSidebarEntryFilter,
  registerDetailsViewHeaderActionsProcessor,
  registerGetTokenFunction,
  registerResourceTableColumnsProcessor,
  registerPluginSettings,
  clusterAction,
  runCommand,
  registerAddClusterProvider,
  registerClusterProviderDialog,
  registerClusterProviderMenuItem,
  ConfigStore,
  registerKindIcon,
  registerMapSource,
  PluginManager,
  registerUIPanel,
  registerAppTheme,
  registerKubeObjectGlance,
};

export type {
  AppLogoProps,
  PluginSettingsDetailsProps,
  ClusterChooserProps,
  DetailsViewSectionProps,
  DefaultSidebars,
};
