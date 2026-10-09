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

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import Job from '../../lib/k8s/job';
import { clusterAction } from '../../redux/clusterActionSlice';
import { AppDispatch } from '../../redux/stores/store';
import ActionButton, { ButtonStyle } from '../common/ActionButton';
import AuthVisible from '../common/Resource/AuthVisible';
import { jobSuspendKey, useJobSuspendState } from './jobSuspendState';

export interface JobSuspendButtonProps {
  item: Job;
  buttonStyle?: ButtonStyle;
  afterConfirm?: () => void;
}

export function JobSuspendButton(props: JobSuspendButtonProps) {
  const { item, buttonStyle, afterConfirm } = props;
  const { t } = useTranslation(['translation']);
  const dispatch: AppDispatch = useDispatch();
  const [{ isPendingSuspend, optimisticSuspended }, setSuspendState] = useJobSuspendState(
    jobSuspendKey(item)
  );

  const actualSuspended = item.spec?.suspend ?? false;

  // Only drop the optimistic override once the watched value actually catches up to it, so an
  // unrelated status-only update (or the button remounting after a menu close/reopen) can't
  // prematurely revert the label mid-request.
  useEffect(() => {
    if (optimisticSuspended !== null && actualSuspended === optimisticSuspended) {
      setSuspendState({ optimisticSuspended: null });
    }
  }, [actualSuspended, optimisticSuspended, setSuspendState]);

  const isSuspended = optimisticSuspended ?? actualSuspended;

  function applySuspend(suspend: boolean) {
    if (isPendingSuspend) {
      return;
    }

    setSuspendState({ isPendingSuspend: true, optimisticSuspended: suspend });
    afterConfirm?.();
    dispatch(
      clusterAction(
        () =>
          item
            .patch({ spec: { suspend } })
            .catch(err => {
              setSuspendState({ optimisticSuspended: null });
              throw err;
            })
            .finally(() => setSuspendState({ isPendingSuspend: false })),
        {
          cancelCallback: () => {
            setSuspendState({ optimisticSuspended: null, isPendingSuspend: false });
          },
          startMessage: suspend
            ? t('translation|Suspending Job {{ newItemName }}...', {
                newItemName: item.metadata.name,
              })
            : t('translation|Resuming Job {{ newItemName }}...', {
                newItemName: item.metadata.name,
              }),
          cancelledMessage: suspend
            ? t('translation|Cancelled suspending Job {{ newItemName }}.', {
                newItemName: item.metadata.name,
              })
            : t('translation|Cancelled resuming Job {{ newItemName }}.', {
                newItemName: item.metadata.name,
              }),
          successMessage: suspend
            ? t('translation|Suspended Job {{ newItemName }}.', {
                newItemName: item.metadata.name,
              })
            : t('translation|Resumed Job {{ newItemName }}.', {
                newItemName: item.metadata.name,
              }),
          errorMessage: suspend
            ? t('translation|Failed to suspend Job {{ newItemName }}.', {
                newItemName: item.metadata.name,
              })
            : t('translation|Failed to resume Job {{ newItemName }}.', {
                newItemName: item.metadata.name,
              }),
        }
      )
    );
  }

  return (
    <AuthVisible authVerb="patch" item={item} namespace={item.metadata.namespace}>
      <ActionButton
        description={isSuspended ? t('translation|Resume') : t('translation|Suspend')}
        onClick={() => applySuspend(!isSuspended)}
        icon={isSuspended ? 'mdi:play-circle' : 'mdi:pause-circle'}
        buttonStyle={buttonStyle}
        iconButtonProps={{ disabled: isPendingSuspend }}
      />
    </AuthVisible>
  );
}

export default JobSuspendButton;
