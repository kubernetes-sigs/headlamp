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

import _ from 'lodash';
import { ClusterChooserType } from '../../plugin/registry';
import {
  Action,
  FunctionsToOverride,
  UI_FUNCTIONS_OVERRIDE,
  UI_HIDE_APP_BAR,
  UI_INITIALIZE_PLUGIN_VIEWS,
  UI_SET_CLUSTER_CHOOSER_BUTTON,
  UI_SET_IS_FULLWIDTH,
  UI_VERSION_DIALOG_OPEN,
} from '../actions/actions';

export interface UIState {
  isVersionDialogOpen: boolean;
  clusterChooserButtonComponent?: ClusterChooserType;
  hideAppBar?: boolean;
  isFullWidth?: boolean;
  functionsToOverride: FunctionsToOverride;
}

export const INITIAL_STATE: UIState = {
  isVersionDialogOpen: false,
  hideAppBar: false,
  isFullWidth: false,
  functionsToOverride: {},
};

function reducer(state = _.cloneDeep(INITIAL_STATE), action: Action) {
  const newFilters = { ..._.cloneDeep(state) };

  switch (action.type) {
    case UI_HIDE_APP_BAR: {
      newFilters.hideAppBar = action.hideAppBar;
      break;
    }
    case UI_INITIALIZE_PLUGIN_VIEWS: {
      const newState = _.cloneDeep(INITIAL_STATE);
      return newState;
    }
    case UI_SET_CLUSTER_CHOOSER_BUTTON: {
      const component = action.component;
      newFilters.clusterChooserButtonComponent = component;
      break;
    }
    case UI_VERSION_DIALOG_OPEN: {
      newFilters.isVersionDialogOpen = action.isVersionDialogOpen;
      break;
    }
    case UI_FUNCTIONS_OVERRIDE: {
      const functionToOverride = action.override;
      for (const key in functionToOverride) {
        if (functionToOverride.hasOwnProperty(key)) {
          newFilters.functionsToOverride[key] = functionToOverride[key];
        }
      }
      break;
    }
    case UI_SET_IS_FULLWIDTH: {
      newFilters.isFullWidth = action.isFullWidth;
      break;
    }
    default:
      return state;
  }

  return newFilters;
}

export default reducer;
