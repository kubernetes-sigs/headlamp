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
import { getSupportedLocales, isLocaleSupported, useTranslation } from './plugin/pluginI18n';
import { PluginSettingsDetailsProps } from './plugin/pluginsSlice';
import type {
  CallbackActionOptions,
  HeadlampEvent,
 } from './plugin/registry';
import Registry, {
  AppLogoProps,
  clusterAction,
  ClusterChooserProps,
  ConfigStore,
  DefaultAppBarAction,
  DefaultDetailsViewSection,
  DefaultHeadlampEvents,
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
  registerClusterStatus,
  registerCustomCreateProject,
  registerDetailsViewHeaderAction,
  registerDetailsViewHeaderActionsProcessor,
  registerDetailsViewSection,
  registerDetailsViewSectionsProcessor,
  registerGetTokenFunction,
  registerHeadlampEventCallback,
  registerKindIcon,
  registerKubeObjectGlance,
  registerMapSource,
  registerOverviewChartsProcessor,
  registerPluginSettings,
  registerProjectDeleteButton,
  registerProjectDetailsTab,
  registerProjectHeaderAction,
  registerProjectOverviewSection,
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
  DefaultAppBarAction,
  DefaultDetailsViewSection,
  DefaultHeadlampEvents,
  DetailsViewDefaultHeaderActions,
  getHeadlampAPIHeaders,
  registerAppLogo,
  registerAppBarAction,
  registerClusterChooser,
  registerDetailsViewHeaderAction,
  registerDetailsViewSection,
  registerDetailsViewSectionsProcessor,
  registerRoute,
  registerRouteFilter,
  registerSidebarEntry,
  registerSidebarEntryFilter,
  registerDetailsViewHeaderActionsProcessor,
  registerGetTokenFunction,
  registerResourceTableColumnsProcessor,
  registerOverviewChartsProcessor,
  registerPluginSettings,
  clusterAction,
  runCommand,
  registerAddClusterProvider,
  registerClusterProviderDialog,
  registerClusterProviderMenuItem,
  registerHeadlampEventCallback,
  ConfigStore,
  registerKindIcon,
  registerMapSource,
  PluginManager,
  registerUIPanel,
  registerAppTheme,
  registerKubeObjectGlance,
  useTranslation,
  isLocaleSupported,
  getSupportedLocales,
  registerCustomCreateProject,
  registerProjectDetailsTab,
  registerProjectOverviewSection,
  registerProjectHeaderAction,
  registerClusterStatus,
  registerProjectDeleteButton,
};

export type {
  AppLogoProps,
  PluginSettingsDetailsProps,
  CallbackActionOptions,
  ClusterChooserProps,
  DetailsViewSectionProps,
  DefaultSidebars,
  HeadlampEvent,
};
