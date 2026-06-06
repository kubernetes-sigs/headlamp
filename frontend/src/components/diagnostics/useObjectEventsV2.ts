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

import { useEffect, useState } from 'react';
import EventV2, { KubeEventV2 } from '../../lib/k8s/eventV2';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { getObjectEventsKey } from '../common/ObjectEventListUtils';

export function useObjectEventsV2(object: KubeObject | null) {
  const [events, setEvents] = useState<EventV2[]>([]);
  const objectKey = getObjectEventsKey(object);

  useEffect(() => {
    let canceled = false;

    async function fetchEvents() {
      const currentObject = object;
      setEvents(previousEvents => (previousEvents.length === 0 ? previousEvents : []));

      if (!currentObject) {
        return;
      }

      try {
        const events = await EventV2.objectEvents(currentObject);
        if (!canceled) {
          setEvents(events.map((e: KubeEventV2) => new EventV2(e, currentObject.cluster)));
        }
      } catch (e) {
        console.error('Failed to fetch events for object:', currentObject, e);
        if (!canceled) {
          setEvents([]);
        }
      }
    }

    fetchEvents();

    return () => {
      canceled = true;
    };
    // Use stable Kubernetes identity fields because callers can recreate wrappers each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectKey]);

  return events;
}
