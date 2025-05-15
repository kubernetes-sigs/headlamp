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

import { Link, Paper, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import VPA from '../../lib/k8s/vpa';
import { SectionBox } from '../common';
import Empty from '../common/EmptyContent';
import ResourceListView from '../common/Resource/ResourceListView';

export default function VpaList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const [vpaEnabled, setVpaEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const vpaStatus = async () => {
      const enabled = await VPA.isEnabled();
      setVpaEnabled(enabled);
    };
    vpaStatus();
  }, []);

  return (
    <>
      {vpaEnabled === null ? (
        <SectionBox title={t('glossary|Vertical Pod Autoscalers')}>
          <Paper variant="outlined">
            <Empty>
              <Typography style={{ textAlign: 'center' }}>
                {t('glossary|Checking if Vertical Pod Autoscaler is enabled…')}
              </Typography>
            </Empty>
          </Paper>
        </SectionBox>
      ) : vpaEnabled ? (
        <ResourceListView
          title={t('glossary|Vertical Pod Autoscalers')}
          resourceClass={VPA}
          columns={[
            'name',
            'namespace',
            'cluster',
            {
              id: 'cpu',
              label: t('glossary|CPU'),
              getValue: item => item?.targetRecommendations?.cpu ?? null,
            },
            {
              id: 'memory',
              label: t('glossary|Memory'),
              getValue: item => item?.targetRecommendations?.memory ?? null,
            },
            {
              id: 'provided',
              label: t('translation|Provided'),
              getValue: item => item?.status?.conditions?.[0]?.status ?? null,
            },
            'age',
          ]}
        />
      ) : (
        <SectionBox title={t('glossary|Vertical Pod Autoscalers')}>
          <Paper variant="outlined">
            <Empty>
              <Typography style={{ textAlign: 'center' }}>
                <Trans t={t}>
                  Vertical Pod Autoscaler is not enabled.&nbsp;
                  <Link
                    href="https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler#installation"
                    target="_blank"
                    rel="noopener"
                  >
                    Learn More
                  </Link>
                </Trans>
              </Typography>
            </Empty>
          </Paper>
        </SectionBox>
      )}
    </>
  );
}
