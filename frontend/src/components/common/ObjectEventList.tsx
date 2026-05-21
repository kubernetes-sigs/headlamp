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
import { useTranslation } from 'react-i18next';
import Event, { KubeEvent } from '../../lib/k8s/event';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { localeDate, timeAgo } from '../../lib/util';
import { HeadlampEventType, useEventCallback } from '../../redux/headlampEventSlice';
import { HoverInfoLabel } from '../common/Label';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';
import ShowHideLabel from './ShowHideLabel';

export interface ObjectEventListProps {
  object: KubeObject;
  events?: Event[];
}

function getObjectEventsKey(object: KubeObject | null) {
  if (!object) {
    return '';
  }

  return [
    object.cluster,
    object.kind,
    object.metadata.namespace,
    object.metadata.name,
    object.metadata.uid,
  ]
    .filter(Boolean)
    .join('/');
}

export function useObjectEvents(object: KubeObject | null) {
  const [events, setEvents] = useState<Event[]>([]);
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
        const events = await Event.objectEvents(currentObject);
        if (!canceled) {
          setEvents(events.map((e: KubeEvent) => new Event(e, currentObject.cluster)));
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

export default function ObjectEventList(props: ObjectEventListProps) {
  const fetchedEvents = useObjectEvents(props.events === undefined ? props.object : null);
  const events = props.events ?? fetchedEvents;
  const dispatchEventList = useEventCallback(HeadlampEventType.OBJECT_EVENTS);

  useEffect(() => {
    if (events) {
      dispatchEventList(events, props.object);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const { t } = useTranslation(['translation', 'glossary']);

  return (
    <SectionBox title={t('glossary|Events')}>
      <SimpleTable
        columns={[
          {
            label: t('Type'),
            getter: item => {
              return item.type;
            },
          },
          {
            label: t('Reason'),
            getter: item => {
              return item.reason;
            },
          },
          {
            label: t('From'),
            getter: item => {
              return item.source.component;
            },
          },
          {
            label: t('Message'),
            getter: item => {
              return (
                item && (
                  <ShowHideLabel labelId={item?.metadata?.uid || ''}>
                    {item.message || ''}
                  </ShowHideLabel>
                )
              );
            },
          },
          {
            label: t('Age'),
            getter: item => {
              const eventDate = timeAgo(item.lastOccurrence, { format: 'mini' });
              let label: string;
              if (item.count > 1) {
                label = t('{{ eventDate }} ({{ count }} times since {{ firstEventDate }})', {
                  eventDate,
                  count: item.count,
                  firstEventDate: timeAgo(item.firstOccurrence),
                });
              } else {
                label = eventDate;
              }

              return (
                <HoverInfoLabel
                  label={label}
                  hoverInfo={localeDate(item.lastOccurrence)}
                  icon="mdi:calendar"
                />
              );
            },
            sort: (item: Event) => -new Date(item.lastOccurrence).getTime(),
          },
        ]}
        data={events}
      />
    </SectionBox>
  );
}
