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

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import {
  createCustomViewId,
  CustomView,
  CustomViewColSpan,
  CustomViewWidgetInstance,
  MAX_CUSTOM_VIEWS,
  readCustomViews,
  writeCustomViews,
} from '../components/customViews/storage';
import type { KubeObject } from '../lib/k8s/KubeObject';

/** Props passed to a custom view widget renderer component. */
export interface CustomViewWidgetRenderProps<TConfig = Record<string, any>> {
  /** Unique ID of this widget instance inside the view. */
  widgetId: string;
  /** JSON-serializable widget configuration persisted with the view. */
  config: TConfig;
  /** Active cluster name when viewing inside a cluster context. */
  cluster: string;
  /** Allows a widget to update its own persisted configuration. */
  onConfigChange: (nextConfig: TConfig) => void;
}

/** Props passed to a widget type's optional configuration editor component. */
export interface CustomViewWidgetConfigProps<TConfig = Record<string, any>> {
  /** Current draft configuration being edited. */
  config: TConfig;
  /** Callback to update the draft configuration. */
  onChange: (nextConfig: TConfig) => void;
  /** Active cluster name when configuring inside a cluster context. */
  cluster: string;
}

/** Context passed when creating a widget configuration directly from a Kubernetes resource. */
export interface CustomViewWidgetResourceFactoryParams {
  /** Resource from which the user clicked "Add to View". */
  resource: KubeObject;
  /** Cluster name associated with the resource. */
  cluster: string;
}

/**
 * Definition of a widget type that can be added to Headlamp Custom Views / Dashboards.
 * Plugins can register custom widget definitions via `registerCustomViewWidget`.
 */
export interface CustomViewWidgetDefinition<TConfig = Record<string, any>> {
  /** Globally unique widget type ID (plugins should namespace, e.g. 'prometheus.chart'). */
  type: string;
  /** Human-readable label shown in the widget picker and "Add to View" dialog. */
  label: string;
  /** Short description shown in the widget picker. */
  description?: string;
  /** Iconify icon name or React element displayed in widget pickers and headers. */
  icon?: string;
  /** Default 12-column grid span when added to a view. Defaults to 6. */
  defaultColSpan?: CustomViewColSpan;
  /** Component that renders the widget content inside an ErrorBoundary. */
  component: (props: CustomViewWidgetRenderProps<TConfig>) => ReactNode;
  /** Optional editor component rendered when adding or editing this widget type. */
  configComponent?: (props: CustomViewWidgetConfigProps<TConfig>) => ReactNode;
  /**
   * Optional predicate determining whether this widget can be created from a given resource
   * via the "Add to View" action in resource details views.
   */
  supportsResource?: (resource: KubeObject) => boolean;
  /**
   * Optional factory producing the widget title and config from a Kubernetes resource.
   */
  createConfigFromResource?: (params: CustomViewWidgetResourceFactoryParams) => {
    title: string;
    config: TConfig;
  };
}

export type NewCustomViewWidgetInput = Omit<CustomViewWidgetInstance, 'id'> & { id?: string };

export interface CustomViewsState {
  views: CustomView[];
  widgetDefinitions: CustomViewWidgetDefinition<any>[];
}

export const initialState: CustomViewsState = {
  views: readCustomViews(),
  widgetDefinitions: [],
};

const customViewsSlice = createSlice({
  name: 'customViews',
  initialState,
  reducers: {
    createView(
      state,
      action: PayloadAction<{
        id?: string;
        name: string;
        description?: string;
        cluster?: string;
        initialWidget?: NewCustomViewWidgetInput;
      }>
    ) {
      const name = action.payload.name.trim();
      if (!name) {
        return;
      }

      const now = Date.now();
      const widgets: CustomViewWidgetInstance[] = action.payload.initialWidget
        ? [
            {
              ...action.payload.initialWidget,
              id: action.payload.initialWidget.id || createCustomViewId(),
            },
          ]
        : [];

      const newView: CustomView = {
        id: action.payload.id || createCustomViewId(),
        name,
        description: action.payload.description?.trim() || undefined,
        cluster: action.payload.cluster?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        widgets,
      };

      state.views = [newView, ...state.views].slice(0, MAX_CUSTOM_VIEWS);
      writeCustomViews(state.views);
    },

    updateView(state, action: PayloadAction<{ id: string; name?: string; description?: string }>) {
      const view = state.views.find(v => v.id === action.payload.id);
      if (!view) {
        return;
      }

      if (action.payload.name !== undefined) {
        const trimmed = action.payload.name.trim();
        if (trimmed) {
          view.name = trimmed;
        }
      }

      if (action.payload.description !== undefined) {
        view.description = action.payload.description.trim() || undefined;
      }

      view.updatedAt = Date.now();
      writeCustomViews(state.views);
    },

    deleteView(state, action: PayloadAction<string>) {
      state.views = state.views.filter(v => v.id !== action.payload);
      writeCustomViews(state.views);
    },

    duplicateView(state, action: PayloadAction<{ id: string; copySuffix?: string }>) {
      const source = state.views.find(v => v.id === action.payload.id);
      if (!source) {
        return;
      }

      const now = Date.now();
      const suffix = action.payload.copySuffix ?? '(Copy)';
      const copy: CustomView = {
        ...source,
        id: createCustomViewId(),
        name: `${source.name} ${suffix}`.trim(),
        createdAt: now,
        updatedAt: now,
        widgets: source.widgets.map(widget => ({
          ...widget,
          id: createCustomViewId(),
          config: { ...widget.config },
        })),
      };

      state.views = [copy, ...state.views].slice(0, MAX_CUSTOM_VIEWS);
      writeCustomViews(state.views);
    },

    importView(state, action: PayloadAction<CustomView>) {
      state.views = [action.payload, ...state.views].slice(0, MAX_CUSTOM_VIEWS);
      writeCustomViews(state.views);
    },

    addWidgetToView(
      state,
      action: PayloadAction<{ viewId: string; widget: NewCustomViewWidgetInput }>
    ) {
      const view = state.views.find(v => v.id === action.payload.viewId);
      if (!view) {
        return;
      }

      view.widgets.push({
        ...action.payload.widget,
        id: action.payload.widget.id || createCustomViewId(),
      });
      view.updatedAt = Date.now();
      writeCustomViews(state.views);
    },

    updateWidgetInView(
      state,
      action: PayloadAction<{
        viewId: string;
        widgetId: string;
        title?: string;
        colSpan?: CustomViewColSpan;
        config?: Record<string, any>;
      }>
    ) {
      const view = state.views.find(v => v.id === action.payload.viewId);
      const widget = view?.widgets.find(w => w.id === action.payload.widgetId);
      if (!view || !widget) {
        return;
      }

      if (action.payload.title !== undefined && action.payload.title.trim()) {
        widget.title = action.payload.title.trim();
      }
      if (action.payload.colSpan !== undefined) {
        widget.colSpan = action.payload.colSpan;
      }
      if (action.payload.config !== undefined) {
        widget.config = action.payload.config;
      }

      view.updatedAt = Date.now();
      writeCustomViews(state.views);
    },

    removeWidgetFromView(state, action: PayloadAction<{ viewId: string; widgetId: string }>) {
      const view = state.views.find(v => v.id === action.payload.viewId);
      if (!view) {
        return;
      }

      view.widgets = view.widgets.filter(w => w.id !== action.payload.widgetId);
      view.updatedAt = Date.now();
      writeCustomViews(state.views);
    },

    moveWidgetInView(
      state,
      action: PayloadAction<{ viewId: string; widgetId: string; direction: 'left' | 'right' }>
    ) {
      const view = state.views.find(v => v.id === action.payload.viewId);
      if (!view) {
        return;
      }

      const index = view.widgets.findIndex(w => w.id === action.payload.widgetId);
      if (index === -1) {
        return;
      }

      const targetIndex = action.payload.direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= view.widgets.length) {
        return;
      }

      const [moved] = view.widgets.splice(index, 1);
      view.widgets.splice(targetIndex, 0, moved);
      view.updatedAt = Date.now();
      writeCustomViews(state.views);
    },

    registerWidgetDefinition(state, action: PayloadAction<CustomViewWidgetDefinition<any>>) {
      const def = action.payload;
      const existingIndex = state.widgetDefinitions.findIndex(w => w.type === def.type);
      if (existingIndex !== -1) {
        state.widgetDefinitions[existingIndex] = def;
      } else {
        state.widgetDefinitions.push(def);
      }
    },

    unregisterWidgetDefinition(state, action: PayloadAction<string>) {
      state.widgetDefinitions = state.widgetDefinitions.filter(w => w.type !== action.payload);
    },
  },
});

export const {
  createView,
  updateView,
  deleteView,
  duplicateView,
  importView,
  addWidgetToView,
  updateWidgetInView,
  removeWidgetFromView,
  moveWidgetInView,
  registerWidgetDefinition,
  unregisterWidgetDefinition,
} = customViewsSlice.actions;

export default customViewsSlice.reducer;
