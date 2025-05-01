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

import { AppLogoType } from '../../components/App/AppLogo';
import { ClusterChooserType } from '../../components/cluster/ClusterChooser';

export const HEADLAMP_EVENT = 'HEADLAMP_EVENT';
export const UI_SET_CLUSTER_CHOOSER_BUTTON = 'UI_SET_CLUSTER_CHOOSER_BUTTON';
export const UI_HIDE_APP_BAR = 'UI_HIDE_APP_BAR';
export const UI_FUNCTIONS_OVERRIDE = 'UI_FUNCTIONS_OVERRIDE';
export const UI_VERSION_DIALOG_OPEN = 'UI_VERSION_DIALOG_OPEN';
export const UI_INITIALIZE_PLUGIN_VIEWS = 'UI_INITIALIZE_PLUGIN_VIEWS';
export const UI_SET_IS_FULLWIDTH = 'UI_SET_IS_FULLWIDTH';

export interface BrandingProps {
  logo: AppLogoType;
}

export interface Action {
  type: string;
  [propName: string]: any;
}

export function setHideAppBar(hideAppBar: boolean | undefined) {
  return { type: UI_HIDE_APP_BAR, hideAppBar };
}

export function setClusterChooserButtonComponent(component: ClusterChooserType) {
  return { type: UI_SET_CLUSTER_CHOOSER_BUTTON, component };
}

export function setVersionDialogOpen(isVersionDialogOpen: boolean) {
  return { type: UI_VERSION_DIALOG_OPEN, isVersionDialogOpen };
}

export type FunctionsToOverride = {
  [key: string]: (...args: any) => any;
};

export function setFunctionsToOverride(override: FunctionsToOverride) {
  return { type: UI_FUNCTIONS_OVERRIDE, override };
}

export function setIsFullWidth(isFullWidth?: boolean) {
  return { type: UI_SET_IS_FULLWIDTH, isFullWidth };
}
