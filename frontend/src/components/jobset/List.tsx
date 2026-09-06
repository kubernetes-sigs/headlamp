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
import JobSet from '../../lib/k8s/jobSet';
import Empty from '../common/EmptyContent';
import ResourceListView from '../common/Resource/ResourceListView';
import SectionBox from '../common/SectionBox';

// Explicit priority to make the rendered condition stable and meaningful.
const conditionPriority = ['Failed', 'Completed', 'Suspended', 'StartupPolicyCompleted'];

export default function JobSetList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const [jobSetEnabled, setJobSetEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const jobSetStatus = async () => {
      const enabled = await JobSet.isEnabled();
      if (!cancelled) {
        setJobSetEnabled(enabled);
      }
    };
    jobSetStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {jobSetEnabled === null ? (
        <SectionBox title={t('glossary|Job Sets')}>
          <Paper variant="outlined">
            <Empty>
              <Typography style={{ textAlign: 'center' }}>
                {t('glossary|Checking if JobSet is enabled…')}
              </Typography>
            </Empty>
          </Paper>
        </SectionBox>
      ) : jobSetEnabled ? (
        <ResourceListView
          title={t('glossary|Job Sets')}
          resourceClass={JobSet}
          columns={[
            'name',
            'namespace',
            'cluster',
            {
              id: 'conditions',
              label: t('translation|Conditions'),
              gridTemplate: 'min-content',
              getValue: (jobSet: JobSet) =>
                getTopCondition(jobSet.status?.conditions, conditionPriority) ?? '-',
            },
            'age',
          ]}
          reflectInURL="jobsets"
          id="headlamp-jobsets"
        />
      ) : (
        <SectionBox title={t('glossary|Job Sets')}>
          <Paper variant="outlined">
            <Empty>
              <Typography style={{ textAlign: 'center' }}>
                <Trans
                  t={t}
                  ns="glossary"
                  i18nKey="JobSet is not enabled. <1>Learn More</1>"
                  components={{
                    1: (
                      <Link
                        href="https://jobset.sigs.k8s.io/docs/installation/"
                        target="_blank"
                        rel="noopener"
                        sx={{ textDecoration: 'underline' }}
                      />
                    ),
                  }}
                />
              </Typography>
            </Empty>
          </Paper>
        </SectionBox>
      )}
    </>
  );
}
