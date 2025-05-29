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

import { Icon } from '@iconify/react';
import { Box } from '@mui/system';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KubeObject } from '../../../lib/k8s/cluster';
import Deployment from '../../../lib/k8s/deployment';
import Endpoints from '../../../lib/k8s/endpoints';
import Event from '../../../lib/k8s/event';
import HPA from '../../../lib/k8s/hpa';
import Pod from '../../../lib/k8s/pod';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import Service from '../../../lib/k8s/service';
import { DateLabel } from '../../common/Label';
import { DeploymentGlance } from './DeploymentGlance';
import { EndpointsGlance } from './EndpointsGlance';
import { HorizontalPodAutoscalerGlance } from './HorizontalPodAutoscalerGlance';
import { PodGlance } from './PodGlance';
import { ReplicaSetGlance } from './ReplicaSetGlance';
import { ServiceGlance } from './ServiceGlance';

/**
 * Little Popup preview of a Kube object
 */
export const KubeObjectGlance = memo(({ resource }: { resource: KubeObject }) => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    Event.objectEvents(resource).then(it => setEvents(it));
  }, []);

  const kind = resource.kind;

  const sections = [];

  if (kind === 'Pod') {
    sections.push(<PodGlance pod={resource as Pod} />);
  }

  if (kind === 'Deployment') {
    sections.push(<DeploymentGlance deployment={resource as Deployment} />);
  }

  if (kind === 'Service') {
    sections.push(<ServiceGlance service={resource as Service} />);
  }

  if (kind === 'Endpoints') {
    sections.push(<EndpointsGlance endpoints={resource as Endpoints} />);
  }

  if (kind === 'ReplicaSet' || kind === 'StatefulSet') {
    sections.push(<ReplicaSetGlance set={resource as ReplicaSet} />);
  }

  if (kind === 'HorizontalPodAutoscaler') {
    sections.push(<HorizontalPodAutoscalerGlance hpa={resource as HPA} />);
  }

  if (events.length > 0) {
    sections.push(
      <Box key="events" mt={2}>
        <Box display="flex" alignItems="center" gap={1} mb={1} fontSize={14}>
          <Icon icon="mdi:message-notification" />
          {t('glossary|Events')}
        </Box>
        {events.slice(0, 5).map(it => (
          <Box
            display="flex"
            gap={1}
            alignItems="center"
            mb={0.5}
            width="100%"
            key={it.message + it.lastOccurrence}
          >
            <Box
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
              mr="auto"
              maxWidth="300px"
              title={it.message}
            >
              {it.message}
            </Box>
            <DateLabel date={it.lastOccurrence} format="mini" />
          </Box>
        ))}
      </Box>
    );
  }

  return sections;
});
