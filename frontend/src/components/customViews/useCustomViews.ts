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

import { useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { ReactReduxContext } from 'react-redux';
import {
  addWidgetToView,
  createView,
  CustomViewWidgetDefinition,
  deleteView,
  duplicateView,
  importView,
  moveWidgetInView,
  NewCustomViewWidgetInput,
  removeWidgetFromView,
  updateView,
  updateWidgetInView,
} from '../../redux/customViewsSlice';
import type { RootState } from '../../redux/reducers/reducers';
import store from '../../redux/stores/store';
import { BUILTIN_VIEW_WIDGET_METADATA } from './builtinWidgetMetadata';
import { CustomView, CustomViewColSpan, readCustomViews } from './storage';

const EMPTY_PLUGIN_WIDGETS: CustomViewWidgetDefinition<any>[] = [];

export type BuiltinWidgetInput = Omit<
  CustomViewWidgetDefinition<any>,
  'component' | 'configComponent'
> &
  Partial<Pick<CustomViewWidgetDefinition<any>, 'component' | 'configComponent'>>;

/**
 * Safely subscribes to custom views state even when a parent component is tested
 * outside a Redux `<Provider>` (for example, isolated component unit tests).
 */
export function useCustomViewsState(
  builtinWidgets: BuiltinWidgetInput[] = BUILTIN_VIEW_WIDGET_METADATA
) {
  const reduxContext = useContext(ReactReduxContext);
  const activeStore = reduxContext?.store ?? store;

  const subscribe = useCallback(
    (onStoreChange: () => void) => activeStore.subscribe(onStoreChange),
    [activeStore]
  );

  const views = useSyncExternalStore(
    subscribe,
    () => (activeStore.getState() as Partial<RootState>)?.customViews?.views ?? readCustomViews(),
    () => []
  );

  const pluginWidgets = useSyncExternalStore(
    subscribe,
    () =>
      (activeStore.getState() as Partial<RootState>)?.customViews?.widgetDefinitions ??
      EMPTY_PLUGIN_WIDGETS,
    () => EMPTY_PLUGIN_WIDGETS
  );

  const widgetDefinitions = useMemo(() => {
    const merged = new Map<string, BuiltinWidgetInput>();
    builtinWidgets.forEach(def => merged.set(def.type, def));
    pluginWidgets.forEach(def => merged.set(def.type, def));
    return Array.from(merged.values()) as CustomViewWidgetDefinition<any>[];
  }, [builtinWidgets, pluginWidgets]);

  const getWidgetDefinition = useCallback(
    (type: string) => widgetDefinitions.find(def => def.type === type),
    [widgetDefinitions]
  );

  const actions = useMemo(
    () => ({
      createView: (payload: {
        id?: string;
        name: string;
        description?: string;
        cluster?: string;
        initialWidget?: NewCustomViewWidgetInput;
      }) => activeStore.dispatch(createView(payload)),
      updateView: (payload: { id: string; name?: string; description?: string }) =>
        activeStore.dispatch(updateView(payload)),
      deleteView: (id: string) => activeStore.dispatch(deleteView(id)),
      duplicateView: (payload: { id: string; copySuffix?: string }) =>
        activeStore.dispatch(duplicateView(payload)),
      importView: (view: CustomView) => activeStore.dispatch(importView(view)),
      addWidgetToView: (payload: { viewId: string; widget: NewCustomViewWidgetInput }) =>
        activeStore.dispatch(addWidgetToView(payload)),
      updateWidgetInView: (payload: {
        viewId: string;
        widgetId: string;
        title?: string;
        colSpan?: CustomViewColSpan;
        config?: Record<string, any>;
      }) => activeStore.dispatch(updateWidgetInView(payload)),
      removeWidgetFromView: (payload: { viewId: string; widgetId: string }) =>
        activeStore.dispatch(removeWidgetFromView(payload)),
      moveWidgetInView: (payload: {
        viewId: string;
        widgetId: string;
        direction: 'left' | 'right';
      }) => activeStore.dispatch(moveWidgetInView(payload)),
    }),
    [activeStore]
  );

  return {
    views,
    widgetDefinitions,
    getWidgetDefinition,
    ...actions,
  };
}
