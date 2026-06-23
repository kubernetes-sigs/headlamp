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

import { configureStore } from '@reduxjs/toolkit';
import eventCallbackReducer, {
  addEventCallback,
  AIAssistantOpenEvent,
  eventAction,
  HeadlampEventType,
  listenerMiddleware,
} from './headlampEventSlice';

function getStore() {
  return configureStore({
    reducer: {
      eventCallbackReducer,
    },
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: false,
      }).prepend(listenerMiddleware.middleware),
  });
}

describe('eventsSlice', () => {
  let store = getStore();

  beforeEach(() => {
    store = getStore();
  });

  describe('addEventCallback', () => {
    it('should add a new event callback', () => {
      const eventCallback = () => {};
      store.dispatch(addEventCallback(eventCallback));

      const storedCb = store.getState().eventCallbackReducer.trackerFuncs[0];
      expect(storedCb).toEqual(eventCallback);
    });

    it('should run event callback', () => {
      const eventCallback = vi.fn(async () => {});
      store.dispatch(addEventCallback(eventCallback));

      store.dispatch(
        eventAction({
          type: 'test',
          data: {},
        })
      );

      expect(eventCallback).toHaveBeenCalled();
    });

    it('should run multiple event callbacks sequentially', () => {
      const callbackResponses: number[] = [];
      const eventCallback = vi.fn(async () => {
        callbackResponses.push(0);
      });
      store.dispatch(addEventCallback(eventCallback));

      const eventCallback1 = vi.fn(async () => {
        callbackResponses.push(1);
      });
      store.dispatch(addEventCallback(eventCallback1));

      store.dispatch(
        eventAction({
          type: 'test',
          data: {},
        })
      );

      expect(callbackResponses).toEqual([0, 1]);
    });
  });

  describe('AI_ASSISTANT_OPEN event', () => {
    it('should dispatch AI_ASSISTANT_OPEN with prompt only', () => {
      const received: AIAssistantOpenEvent[] = [];
      store.dispatch(
        addEventCallback(event => {
          if (event.type === HeadlampEventType.AI_ASSISTANT_OPEN) {
            received.push(event as AIAssistantOpenEvent);
          }
        })
      );

      store.dispatch(
        eventAction({
          type: HeadlampEventType.AI_ASSISTANT_OPEN,
          data: { prompt: 'Why is this pod crashlooping?' },
        })
      );

      expect(received).toHaveLength(1);
      expect(received[0].data.prompt).toBe('Why is this pod crashlooping?');
      expect(received[0].data.context).toBeUndefined();
    });

    it('should dispatch AI_ASSISTANT_OPEN with prompt and full context', () => {
      const received: AIAssistantOpenEvent[] = [];
      store.dispatch(
        addEventCallback(event => {
          if (event.type === HeadlampEventType.AI_ASSISTANT_OPEN) {
            received.push(event as AIAssistantOpenEvent);
          }
        })
      );

      store.dispatch(
        eventAction({
          type: HeadlampEventType.AI_ASSISTANT_OPEN,
          data: {
            prompt: 'Explain this finding.',
            context: {
              sourcePlugin: 'kubebuddy',
              cluster: 'prod-cluster',
              resource: {
                kind: 'Service',
                name: 'network-observability',
                namespace: 'kube-system',
                apiVersion: 'v1',
              },
            },
          },
        })
      );

      expect(received).toHaveLength(1);
      expect(received[0].data.context?.sourcePlugin).toBe('kubebuddy');
      expect(received[0].data.context?.resource?.kind).toBe('Service');
      expect(received[0].data.context?.resource?.namespace).toBe('kube-system');
    });

    it('should not trigger other event handlers for unrelated event types', () => {
      const aiReceived: AIAssistantOpenEvent[] = [];
      store.dispatch(
        addEventCallback(event => {
          if (event.type === HeadlampEventType.AI_ASSISTANT_OPEN) {
            aiReceived.push(event as AIAssistantOpenEvent);
          }
        })
      );

      store.dispatch(eventAction({ type: 'some.other-event', data: {} }));

      expect(aiReceived).toHaveLength(0);
    });
  });
});
