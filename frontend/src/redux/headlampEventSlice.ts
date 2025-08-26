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
import { createAction, createListenerMiddleware, createSlice } from '@reduxjs/toolkit';
import { useDispatch } from 'react-redux';
import type Event from '../lib/k8s/event';
import type { KubeObject } from '../lib/k8s/KubeObject';
import type Pod from '../lib/k8s/pod';
import type { Plugin } from '../plugin/lib';
import type { RootState } from './reducers/reducers';

/**
 * The types of default events that can be tracked.
 */
export enum HeadlampEventType {
  /** Events related to an error boundary. */
  ERROR_BOUNDARY = 'headlamp.error-boundary',
  /** Events related to deleting a resource. */
  DELETE_RESOURCE = 'headlamp.delete-resource',
  /** Events related to deleting multiple resources. */
  DELETE_RESOURCES = 'headlamp.delete-resources',
  /** Events related to creating a resource. */
  CREATE_RESOURCE = 'headlamp.create-resource',
  /** Events related to editing a resource. */
  EDIT_RESOURCE = 'headlamp.edit-resource',
  /** Events related to scaling a resource. */
  SCALE_RESOURCE = 'headlamp.scale-resource',
  /** Events related to restarting a resource. */
  RESTART_RESOURCE = 'headlamp.restart-resource',
  /** Events related to restarting multiple resources. */
  RESTART_RESOURCES = 'headlamp.restart-resources',
  /** Events related to viewing logs. */
  LOGS = 'headlamp.logs',
  /** Events related to opening a terminal. */
  TERMINAL = 'headlamp.terminal',
  /** Events related to attaching to a pod. */
  POD_ATTACH = 'headlamp.pod-attach',
  /** Events related to loading a plugin. */
  PLUGIN_LOADING_ERROR = 'headlamp.plugin-loading-error',
  /** Events related to loading all plugins. */
  PLUGINS_LOADED = 'headlamp.plugins-loaded',
  /** Events related to loading a resource in the details view. */
  DETAILS_VIEW = 'headlamp.details-view',
  /** Events related to loading a resource in the list view. */
  LIST_VIEW = 'headlamp.list-view',
  /** Events related to loading events for a resource. */
  OBJECT_EVENTS = 'headlamp.object-events',
}

/**
 * The status of an event. This list may grow in the future to accommodate more statuses.
 */
export enum EventStatus {
  /** The status of the event is unknown. */
  UNKNOWN = 'unknown',
  /** The event has to do with opening a dialog/action. */
  OPENED = 'open',
  /** The event has to do with closing a dialog/action. */
  CLOSED = 'closed',
  /** The event has to do with confirming a dialog/action. */
  CONFIRMED = 'confirmed',
  /** The event has to do with finishing a dialog/action. */
  FINISHED = 'finished',
}

/**
 * Represents a Headlamp event. It can be one of the default events or a custom event.
 */
export interface HeadlampEvent<EventType = HeadlampEventType | string> {
  type: EventType;
  data?: unknown;
}

/**
 * Event fired when an error boundary is triggered.
 */
export interface ErrorBoundaryEvent {
  type: HeadlampEventType.ERROR_BOUNDARY;
  /** The error that was thrown. */
  data: Error;
}

/**
 * Event fired when a resource is to be deleted.
 */
export interface DeleteResourceEvent extends HeadlampEvent<HeadlampEventType.DELETE_RESOURCE> {
  data: {
    /** The resource for which the deletion was called. */
    resource: KubeObject;
    /** What exactly this event represents. 'CONFIRMED' when the user confirms the deletion of a resource.
     * For now only 'CONFIRMED' is sent.
     */
    status: EventStatus.CONFIRMED;
  };
}

/**
 * Event fired when resources is to be deleted.
 */
export interface DeleteResourcesEvent extends HeadlampEvent<HeadlampEventType.DELETE_RESOURCES> {
  data: {
    /** Resources for which the deletion was called. */
    resources: KubeObject[];
    /** What exactly this event represents. 'CONFIRMED' when the user confirms the deletion of resources.
     * For now only 'CONFIRMED' is sent.
     */
    status: EventStatus.CONFIRMED;
  };
}

/**
 * Event fired when editing a resource.
 */
export interface EditResourceEvent {
  type: HeadlampEventType.EDIT_RESOURCE;
  data: {
    /** The resource for which the deletion was called. */
    resource: KubeObject;
    /** What exactly this event represents. 'OPEN' when the edit dialog is opened. 'CLOSED' when it
     * is closed.
     */
    status: EventStatus.OPENED | EventStatus.CLOSED;
  };
}

/**
 * Event fired when scaling a resource.
 */
export interface ScaleResourceEvent {
  type: HeadlampEventType.SCALE_RESOURCE;
  data: {
    /** The resource for which the deletion was called. */
    resource: KubeObject;
    /** What exactly this event represents. 'CONFIRMED' when the scaling is selected by the user.
     * For now only 'CONFIRMED' is sent.
     */
    status: EventStatus.CONFIRMED;
  };
}

/**
 * Event fired when restarting a resource.
 */
export interface RestartResourceEvent extends HeadlampEvent<HeadlampEventType.RESTART_RESOURCE> {
  data: {
    /** The resource for which restart was called. */
    resource: KubeObject;
    /** What exactly this event represents. 'CONFIRMED' when restart is selected by the user.
     * For now only 'CONFIRMED' is sent.
     */
    status: EventStatus.CONFIRMED;
  };
}

/**
 * Event fired when restarting multiple resources.
 */
export interface RestartResourcesEvent extends HeadlampEvent<HeadlampEventType.RESTART_RESOURCES> {
  data: {
    /** Resources for which restart was called. */
    resources: KubeObject[];
    /** What exactly this event represents. 'CONFIRMED' when the user confirms restart of resources.
     * For now only 'CONFIRMED' is sent.
     */
    status: EventStatus.CONFIRMED;
  };
}

/**
 * Event fired when viewing pod logs.
 */
export interface LogsEvent {
  type: HeadlampEventType.LOGS;
  data: {
    /** The resource for which the terminal was opened (currently this only happens for Pod instances). */
    resource?: KubeObject;
    /** What exactly this event represents. 'OPEN' when the terminal is opened. 'CLOSED' when it
     * is closed.
     */
    /** What exactly this event represents. 'OPEN' when the logs dialog is opened. 'CLOSED' when it
     * is closed.
     */
    status: EventStatus.OPENED | EventStatus.CLOSED;
  };
}

/**
 * Event fired when using the terminal.
 */
export interface TerminalEvent {
  type: HeadlampEventType.TERMINAL;
  data: {
    /** The resource for which the terminal was opened (currently this only happens for Pod instances). */
    resource?: KubeObject;
    /** What exactly this event represents. 'OPEN' when the terminal is opened. 'CLOSED' when it
     * is closed.
     */
    status: EventStatus.OPENED | EventStatus.CLOSED;
  };
}

/**
 * Event fired when attaching to a pod.
 */
export interface PodAttachEvent {
  type: HeadlampEventType.POD_ATTACH;
  data: {
    /** The resource for which the terminal was opened (currently this only happens for Pod instances). */
    resource?: Pod;
    /** What exactly this event represents. 'OPEN' when the attach dialog is opened. 'CLOSED' when it
     * is closed.
     */
    status: EventStatus.OPENED | EventStatus.CLOSED;
  };
}

/**
 * Event fired when creating a resource.
 */
export interface CreateResourceEvent {
  type: HeadlampEventType.CREATE_RESOURCE;
  data: {
    /** What exactly this event represents. 'CONFIRMED' when the user chooses to apply the new resource.
     * For now only 'CONFIRMED' is sent.
     */
    status: EventStatus.CONFIRMED;
  };
}

/**
 * Event fired when there is an error while loading a plugin.
 */
export interface PluginLoadingErrorEvent {
  type: HeadlampEventType.PLUGIN_LOADING_ERROR;
  data: {
    /** Information about the plugin. */
    pluginInfo: {
      /** The name of the plugin. */
      name: string;
      /** The version of the plugin. */
      version: string;
    };
    /** The error that occurred while loading the plugin. */
    error: Error;
  };
}

/**
 * Event fired when all plugins are loaded.
 */
export interface PluginsLoadedEvent {
  type: HeadlampEventType.PLUGINS_LOADED;
  data: {
    /** The list of loaded plugins. */
    plugins: {
      /** The name of the plugin. */
      name: string;
      /** The version of the plugin. */
      version: string;
      /** Whether the plugin is enabled. */
      isEnabled: boolean;
    }[];
  };
}

/**
 * Event fired when a resource is loaded in the details view.
 */
export interface ResourceDetailsViewLoadedEvent {
  type: HeadlampEventType.DETAILS_VIEW;
  data: {
    /** The resource that was loaded. */
    resource: KubeObject;
    /** The error, if an error has occurred */
    error?: Error;
  };
}

/**
 * Event fired when a list view is loaded for a resource.
 */
export interface ResourceListViewLoadedEvent {
  type: HeadlampEventType.LIST_VIEW;
  data: {
    /** The list of resources that were loaded. */
    resources: KubeObject[];
    /** The kind of resource that was loaded. */
    resourceKind: string;
    /** The error, if an error has occurred */
    error?: Error;
  };
}

/**
 * Event fired when kubernetes events are loaded (for a resource or not).
 */
export interface EventListEvent {
  type: HeadlampEventType.OBJECT_EVENTS;
  data: {
    /** The resource for which the events were loaded. */
    resource?: KubeObject;
    /** The list of events that were loaded. */
    events: Event[];
  };
}

export type HeadlampEventCallback = (data: HeadlampEvent) => void;

const initialState: {
  trackerFuncs: HeadlampEventCallback[];
} = {
  trackerFuncs: [],
};

export const eventAction = createAction<HeadlampEvent>('headlamp/event');

export const listenerMiddleware =
  createListenerMiddleware<Pick<RootState, 'eventCallbackReducer'>>();
listenerMiddleware.startListening({
  actionCreator: eventAction,
  effect: async (action, listernerApi) => {
    const trackerFuncs = listernerApi.getState()?.eventCallbackReducer?.trackerFuncs;
    for (const trackerFunc of trackerFuncs) {
      try {
        trackerFunc(action.payload);
      } catch (e) {
        console.error(
          `Error running tracker func ${trackerFunc} with payload ${action.payload}: ${e}`
        );
      }
    }
  },
});

export const headlampEventSlice = createSlice({
  name: 'headlampEvents',
  initialState,
  reducers: {
    addEventCallback(state, action: PayloadAction<HeadlampEventCallback>) {
      state.trackerFuncs.push(action.payload);
    },
  },
});

export const { addEventCallback } = headlampEventSlice.actions;

export default headlampEventSlice.reducer;

type EventDataType<T extends HeadlampEvent> = T['data'];

export function useEventCallback(): (eventInfo: HeadlampEvent | HeadlampEvent['type']) => void;
export function useEventCallback(
  eventType: HeadlampEventType.ERROR_BOUNDARY
): (error: Error) => void;
export function useEventCallback(
  eventType: HeadlampEventType.DELETE_RESOURCE
): (data: EventDataType<DeleteResourceEvent>) => void;
export function useEventCallback(
  eventType: HeadlampEventType.DELETE_RESOURCES
): (data: EventDataType<DeleteResourcesEvent>) => void;
export function useEventCallback(
  eventType: HeadlampEventType.EDIT_RESOURCE
): (data: EventDataType<EditResourceEvent>) => void;
export function useEventCallback(
  eventType: HeadlampEventType.SCALE_RESOURCE
): (data: EventDataType<ScaleResourceEvent>) => void;
export function useEventCallback(
  eventType: HeadlampEventType.RESTART_RESOURCE
): (data: EventDataType<RestartResourceEvent>) => void;
export function useEventCallback(
  eventType: HeadlampEventType.RESTART_RESOURCES
): (data: EventDataType<RestartResourcesEvent>) => void;
export function useEventCallback(
  eventType: HeadlampEventType.LOGS
): (data: EventDataType<LogsEvent>) => void;
export function useEventCallback(
  eventType: HeadlampEventType.TERMINAL
): (data: EventDataType<TerminalEvent>) => void;
export function useEventCallback(
  eventType: HeadlampEventType.POD_ATTACH
): (data: EventDataType<PodAttachEvent>) => void;
export function useEventCallback(
  eventType: HeadlampEventType.CREATE_RESOURCE
): (data: EventDataType<CreateResourceEvent>) => void;
export function useEventCallback(
  eventType: HeadlampEventType.PLUGIN_LOADING_ERROR
): (plugin: Plugin) => void;
export function useEventCallback(
  eventType: HeadlampEventType.PLUGINS_LOADED
): (plugins: Plugin[]) => void;
export function useEventCallback(
  eventType: HeadlampEventType.DETAILS_VIEW
): (data: EventDataType<ResourceDetailsViewLoadedEvent>) => void;
export function useEventCallback(
  eventType: HeadlampEventType.LIST_VIEW
): (data: EventDataType<ResourceListViewLoadedEvent>) => void;
export function useEventCallback(
  eventInfo: HeadlampEventType.OBJECT_EVENTS
): (events: Event[], resource?: KubeObject) => void;
export function useEventCallback(eventType?: HeadlampEventType | string) {
  const dispatch = useDispatch();

  function dispatchDataEventFunc<T extends HeadlampEvent>(eventType: HeadlampEventType) {
    return (data: EventDataType<T>) => {
      dispatch(
        eventAction({
          type: eventType,
          data,
        })
      );
    };
  }

  switch (eventType) {
    case HeadlampEventType.ERROR_BOUNDARY:
      return (error: Error) => {
        dispatch(
          eventAction({
            type: HeadlampEventType.ERROR_BOUNDARY,
            data: error,
          })
        );
      };
    case HeadlampEventType.DELETE_RESOURCE:
      return dispatchDataEventFunc<DeleteResourceEvent>(HeadlampEventType.DELETE_RESOURCE);
    case HeadlampEventType.DELETE_RESOURCES:
      return dispatchDataEventFunc<DeleteResourcesEvent>(HeadlampEventType.DELETE_RESOURCES);
    case HeadlampEventType.EDIT_RESOURCE:
      return dispatchDataEventFunc<EditResourceEvent>(HeadlampEventType.EDIT_RESOURCE);
    case HeadlampEventType.SCALE_RESOURCE:
      return dispatchDataEventFunc<ScaleResourceEvent>(HeadlampEventType.SCALE_RESOURCE);
    case HeadlampEventType.RESTART_RESOURCE:
      return dispatchDataEventFunc<RestartResourceEvent>(HeadlampEventType.RESTART_RESOURCE);
    case HeadlampEventType.LOGS:
      return dispatchDataEventFunc<LogsEvent>(HeadlampEventType.LOGS);
    case HeadlampEventType.TERMINAL:
      return dispatchDataEventFunc<TerminalEvent>(HeadlampEventType.TERMINAL);
    case HeadlampEventType.POD_ATTACH:
      return dispatchDataEventFunc<PodAttachEvent>(HeadlampEventType.POD_ATTACH);
    case HeadlampEventType.CREATE_RESOURCE:
      return dispatchDataEventFunc<CreateResourceEvent>(HeadlampEventType.CREATE_RESOURCE);
    case HeadlampEventType.PLUGIN_LOADING_ERROR:
      return (plugin: Plugin) => {
        dispatch(
          eventAction({
            type: HeadlampEventType.PLUGIN_LOADING_ERROR,
            data: plugin,
          })
        );
      };
    case HeadlampEventType.PLUGINS_LOADED:
      return (plugins: Plugin[]) => {
        dispatch(
          eventAction({
            type: HeadlampEventType.PLUGINS_LOADED,
            data: plugins,
          })
        );
      };
    case HeadlampEventType.DETAILS_VIEW:
      return dispatchDataEventFunc<ResourceDetailsViewLoadedEvent>(HeadlampEventType.DETAILS_VIEW);
    case HeadlampEventType.LIST_VIEW:
      return dispatchDataEventFunc<ResourceListViewLoadedEvent>(HeadlampEventType.LIST_VIEW);
    case HeadlampEventType.OBJECT_EVENTS:
      return (events: Event[], resource?: KubeObject) => {
        dispatch(
          eventAction({
            type: HeadlampEventType.OBJECT_EVENTS,
            data: {
              resource,
              events,
            },
          })
        );
      };
    default:
      break;
  }

  return (eventInfo: HeadlampEvent | HeadlampEvent['type']) => {
    let event: HeadlampEvent;
    if (typeof eventInfo === 'string') {
      event = { type: eventInfo };
    } else {
      event = eventInfo;
    }

    dispatch(eventAction(event));
  };
}
