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

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Input from '@mui/material/Input';
import InputLabel from '@mui/material/InputLabel';
import _ from 'lodash';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useParams } from 'react-router-dom';
import { apply } from '../../lib/k8s/api/v1/apply';
import CronJob from '../../lib/k8s/cronJob';
import Job from '../../lib/k8s/job';
import { clusterAction } from '../../redux/clusterActionSlice';
import { AppDispatch } from '../../redux/stores/store';
import ActionButton from '../common/ActionButton';
import { DetailsGrid } from '../common/Resource';
import AuthVisible from '../common/Resource/AuthVisible';
import { JobsListRenderer } from '../job/List';
import { getLastScheduleTime, getSchedule } from './List';

// method to generate a unique string
const uniqueString = () => {
  const timestamp = Date.now().toString(36);
  const randomNum = Math.random().toString(36).substr(2, 5);
  return `${timestamp}-${randomNum}`;
};

const maxNameLength = 63;

function SpawnJobDialog(props: { cronJob: CronJob; onClose: () => void }) {
  const { cronJob, onClose } = props;
  const { t } = useTranslation(['translation']);
  const dispatch: AppDispatch = useDispatch();

  const suffix = `-manual-spawn-${uniqueString()}`;

  const [jobName, setJobName] = useState(
    () => `${cronJob?.metadata?.name.substring(0, maxNameLength - suffix.length)}${suffix}`
  );

  function handleSpawn() {
    const job = _.cloneDeep(cronJob.spec.jobTemplate);
    // set all the fields that are assumed on the jobTemplate
    job.kind = 'Job';
    job.metadata = _.cloneDeep(job.metadata) || {};
    job.metadata.namespace = cronJob.metadata.namespace;
    job.apiVersion = 'batch/v1';
    job.metadata.name = jobName;
    job.metadata.annotations = {
      ...job.metadata.annotations,
      'cronjob.kubernetes.io/instantiate': 'manual',
    };
    if (!!cronJob.jsonData) {
      job.metadata.ownerReferences = [
        {
          apiVersion: cronJob.jsonData.apiVersion,
          blockOwnerDeletion: true,
          controller: true,
          kind: cronJob.jsonData.kind,
          name: cronJob.metadata.name,
          uid: cronJob.metadata.uid,
        },
      ];
    }
    onClose();
    dispatch(
      clusterAction(() => apply(job), {
        startMessage: t('translation|Spawning Job {{ newItemName }}…', {
          newItemName: jobName,
        }),
        successMessage: t('translation|Job {{ newItemName }} spawned', {
          newItemName: jobName,
        }),
        errorMessage: t('translation|Failed to spawn Job {{ newItemName }}', {
          newItemName: jobName,
        }),
      })
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby="form-dialog-title" maxWidth="sm">
      <DialogTitle id="form-dialog-title">{t('translation|Spawn Job')}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t('translation|This will trigger a new Job based on the CronJob {{ name }}', {
            name: cronJob.getName(),
          })}
        </DialogContentText>
        <Box mb={1}>
          <InputLabel htmlFor="name">{t('translation|Job Name')}</InputLabel>
        </Box>
        <Input
          margin="dense"
          id="name"
          type="text"
          fullWidth
          value={jobName}
          onChange={e => {
            setJobName(e.target.value);
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          {t('translation|Cancel')}
        </Button>
        <Button onClick={handleSpawn} color="primary">
          {t('translation|Spawn')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function CronJobDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;

  const { t, i18n } = useTranslation('glossary');
  const dispatch: AppDispatch = useDispatch();

  const [cronJob] = CronJob.useGet(name, namespace);
  const { items: jobs, errors } = Job.useList({ namespace, cluster: cronJob?.cluster });
  const [isSpawnDialogOpen, setIsSpawnDialogOpen] = useState(false);
  const [isPendingSuspend, setIsPendingSuspend] = useState(false);
  const isCronSuspended = cronJob?.spec.suspend;

  const ownedJobs = useMemo(
    () =>
      jobs?.filter(job =>
        job.metadata.ownerReferences?.find(ref => ref.kind === 'CronJob' && ref.name === name)
      ) ?? [],
    [jobs, name]
  );

  function applySuspend(cronJob: CronJob, suspend: boolean) {
    setIsPendingSuspend(true);
    dispatch(
      clusterAction(
        () => cronJob.patch({ spec: { suspend } }).finally(() => setIsPendingSuspend(false)),
        {
          cancelCallback: () => setIsPendingSuspend(false),
          startMessage: suspend
            ? t('translation|Suspending CronJob {{ newItemName }}…', {
                newItemName: cronJob.metadata.name,
              })
            : t('translation|Resuming CronJob {{ newItemName }}…', {
                newItemName: cronJob.metadata.name,
              }),
          cancelledMessage: suspend
            ? t('translation|Cancelled suspending CronJob {{ newItemName }}.', {
                newItemName: cronJob.metadata.name,
              })
            : t('translation|Cancelled resuming CronJob {{ newItemName }}.', {
                newItemName: cronJob.metadata.name,
              }),
          successMessage: suspend
            ? t('translation|Suspended CronJob {{ newItemName }}.', {
                newItemName: cronJob.metadata.name,
              })
            : t('translation|Resumed CronJob {{ newItemName }}.', {
                newItemName: cronJob.metadata.name,
              }),
          errorMessage: suspend
            ? t('translation|Failed to suspend CronJob {{ newItemName }}.', {
                newItemName: cronJob.metadata.name,
              })
            : t('translation|Failed to resume CronJob {{ newItemName }}.', {
                newItemName: cronJob.metadata.name,
              }),
        }
      )
    );
  }

  const actions = cronJob
    ? [
        <AuthVisible authVerb="create" item={Job} namespace={cronJob.getNamespace()}>
          <ActionButton
            description={t('translation|Spawn Job')}
            onClick={() => setIsSpawnDialogOpen(true)}
            icon="mdi:lightning-bolt-circle"
          />
          {isSpawnDialogOpen && (
            <SpawnJobDialog cronJob={cronJob} onClose={() => setIsSpawnDialogOpen(false)} />
          )}
        </AuthVisible>,
        <AuthVisible authVerb="update" item={cronJob}>
          <ActionButton
            description={isCronSuspended ? t('translation|Resume') : t('translation|Suspend')}
            onClick={() => applySuspend(cronJob, !isCronSuspended)}
            icon={isCronSuspended ? 'mdi:play-circle' : 'mdi:pause-circle'}
            iconButtonProps={{ disabled: isPendingSuspend }}
          />
        </AuthVisible>,
      ]
    : [];

  return (
    <DetailsGrid
      resourceType={CronJob}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      actions={actions}
      extraInfo={item =>
        item && [
          {
            name: t('Schedule'),
            value: getSchedule(item, i18n.language),
          },
          {
            name: t('translation|Suspend'),
            value: item.spec.suspend.toString(),
          },
          {
            name: t('Starting deadline'),
            value: `${item.spec.startingDeadlineSeconds}s`,
            hide: !item.spec.startingDeadlineSeconds,
          },
          {
            name: t('Last Schedule'),
            value: getLastScheduleTime(item),
          },
        ]
      }
      extraSections={cronJob =>
        cronJob && [
          <JobsListRenderer
            jobs={ownedJobs}
            errors={errors}
            hideColumns={['namespace']}
            noNamespaceFilter
          />,
        ]
      }
    />
  );
}
