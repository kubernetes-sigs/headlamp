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

import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { getTopCondition } from '../../lib/k8s/conditions';
import LeaderWorkerSet from '../../lib/k8s/leaderWorkerSet';
import Empty from '../common/EmptyContent';
import ResourceListView from '../common/Resource/ResourceListView';
import SectionBox from '../common/SectionBox';

// Explicit priority to make the rendered condition stable and meaningful: an
// in-flight rollout or scale-up says more about the current state than the
// steady-state Available condition it sits alongside.
const conditionPriority = ['UpdateInProgress', 'Progressing', 'Available'];

function getReadyGroups(leaderWorkerSet: LeaderWorkerSet): string {
  return `${leaderWorkerSet.getReadyReplicas()}/${leaderWorkerSet.getDesiredReplicas()}`;
}

/** Number of pods per group: one leader plus its workers. */
function getGroupSize(leaderWorkerSet: LeaderWorkerSet): number | string {
  return leaderWorkerSet.spec?.leaderWorkerTemplate?.size ?? '-';
}

export default function LeaderWorkerSetList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const [lwsEnabled, setLwsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    LeaderWorkerSet.isEnabled().then(setLwsEnabled);
  }, []);

  if (lwsEnabled === null) {
    return (
      <SectionBox title={t('glossary|Leader Worker Sets')}>
        <Paper variant="outlined">
          <Empty>
            <Typography style={{ textAlign: 'center' }}>
              {t('glossary|Checking if LeaderWorkerSet is enabled…')}
            </Typography>
          </Empty>
        </Paper>
      </SectionBox>
    );
  }

  if (!lwsEnabled) {
    return (
      <SectionBox title={t('glossary|Leader Worker Sets')}>
        <Paper variant="outlined">
          <Empty>
            <Typography style={{ textAlign: 'center' }}>
              <Trans t={t}>
                LeaderWorkerSet is not enabled on this cluster.&nbsp;
                <Link
                  href="https://github.com/kubernetes-sigs/lws#installation"
                  target="_blank"
                  rel="noopener"
                  sx={{ textDecoration: 'underline' }}
                >
                  Learn More
                </Link>
              </Trans>
            </Typography>
          </Empty>
        </Paper>
      </SectionBox>
    );
  }

  return (
    <ResourceListView
      title={t('glossary|Leader Worker Sets')}
      resourceClass={LeaderWorkerSet}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'groups',
          label: t('translation|Ready'),
          disableFiltering: true,
          gridTemplate: 'min-content',
          getValue: (leaderWorkerSet: LeaderWorkerSet) => getReadyGroups(leaderWorkerSet),
        },
        {
          id: 'size',
          label: t('translation|Group Size'),
          disableFiltering: true,
          gridTemplate: 'min-content',
          getValue: (leaderWorkerSet: LeaderWorkerSet) => getGroupSize(leaderWorkerSet),
        },
        {
          id: 'conditions',
          label: t('translation|Conditions'),
          gridTemplate: 'min-content',
          getValue: (leaderWorkerSet: LeaderWorkerSet) =>
            getTopCondition(leaderWorkerSet.status?.conditions, conditionPriority) ?? '-',
        },
        'age',
      ]}
      reflectInURL="leaderworkersets"
      id="headlamp-leaderworkersets"
    />
  );
}
