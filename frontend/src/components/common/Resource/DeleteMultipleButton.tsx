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

import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import _, { uniq } from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import Namespace from '../../../lib/k8s/namespace';
import Pod from '../../../lib/k8s/pod';
import { CallbackActionOptions, clusterAction } from '../../../redux/clusterActionSlice';
import {
  EventStatus,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { AppDispatch } from '../../../redux/stores/store';
import { useSettings } from '../../App/Settings/hook';
import ActionButton, { ButtonStyle } from '../ActionButton';
import { ConfirmDialog } from '../Dialog';

interface DeleteMultipleButtonProps {
  items?: KubeObject[];
  options?: CallbackActionOptions;
  buttonStyle?: ButtonStyle;
  afterConfirm?: () => void;
}

interface DeleteMultipleButtonDescriptionProps {
  items?: KubeObject[];
}

// How many Pod names a notification lists before summarising the rest.
const MAX_NAMED_PODS = 5;

function DeleteMultipleButtonDescription(props: DeleteMultipleButtonDescriptionProps) {
  const { t } = useTranslation(['translation']);
  const clusters = uniq(props.items?.map(it => it.cluster));
  return (
    <p>
      {t('Are you sure you want to delete the following items?')}
      <ul>
        {props.items?.map(item => (
          <li key={item.metadata.uid}>
            {item.kind}: {item.metadata.name}{' '}
            {clusters.length > 0 ? `(cluster: ${item.cluster})` : ''}
          </li>
        ))}
      </ul>
    </p>
  );
}

export default function DeleteMultipleButton(props: DeleteMultipleButtonProps) {
  const dispatch: AppDispatch = useDispatch();
  const settingsObj = useSettings();

  const { items, options, afterConfirm, buttonStyle } = props;
  const [openAlert, setOpenAlert] = React.useState(false);
  // For protected (system) namespaces the user must type their names to confirm deletion.
  const [confirmInput, setConfirmInput] = React.useState('');
  const { t } = useTranslation(['translation']);
  const location = useLocation();
  const dispatchDeleteEvent = useEventCallback(HeadlampEventType.DELETE_RESOURCES);

  // Protected namespaces included in the current selection, if any.
  const protectedNamespaces = (items ?? []).filter(
    (item): item is Namespace => Namespace.isClassOf(item) && item.isProtected()
  );
  // Build the confirm string from the same label-or-name value that isProtected() checks,
  // de-duped and sorted alphabetically so the expected order is deterministic for the user.
  const protectedNamespaceNames = uniq(
    protectedNamespaces.map(
      item => item.metadata.labels?.['kubernetes.io/metadata.name'] || item.metadata.name
    )
  ).sort();
  const confirmString = protectedNamespaceNames.join(', ');
  // Normalize the typed input the same way (split on commas, trim, drop blanks, de-dupe,
  // sort) so the comparison is tolerant of spacing and ordering differences.
  const normalizedConfirmInput = uniq(
    confirmInput
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
  ).sort();
  const confirmButtonDisabled =
    protectedNamespaces.length > 0 &&
    normalizedConfirmInput.join(', ') !== protectedNamespaceNames.join(', ');

  const deleteFunc = React.useCallback(
    async (items: KubeObject[]) => {
      if (!items || items.length === 0) {
        return;
      }
      const clonedItems = _.cloneDeep(items);
      const itemsLength = clonedItems.length;

      type EvictionVerdict = 'allowed' | 'denied' | 'error';

      const namespaceVerdicts = new Map<string, Promise<EvictionVerdict>>();
      const podVerdicts = new Map<string, Promise<EvictionVerdict>>();

      const checkEviction = (pod: Pod, podName?: string): Promise<EvictionVerdict> =>
        pod
          .getAuthorization('create', { subresource: 'eviction', name: podName })
          .then((result): EvictionVerdict => {
            // An explicit verdict answers the question that was asked, whether that
            // was namespace-wide or for one Pod. A failed evaluation (for example an
            // authorizer webhook erroring) or a response we cannot read, such as one
            // without an `allowed` verdict, is not an answer, so it must not be taken
            // as permission to delete.
            const status = result?.status;
            if (status?.allowed === true && !status.evaluationError) {
              return 'allowed';
            }
            if (status?.allowed === false && !status.evaluationError) {
              return 'denied';
            }
            console.error(
              `Could not determine the bulk eviction permission for ` +
                `${pod.cluster}/${pod.getNamespace()}${podName ? `/${podName}` : ''}:`,
              result
            );
            return 'error';
          })
          .catch((err: Error) => {
            console.error(
              `Error while getting authorization for bulk eviction of ` +
                `${pod.cluster}/${pod.getNamespace()}${podName ? `/${podName}` : ''}:`,
              err
            );
            return 'error';
          });

      const evictionVerdict = async (pod: Pod): Promise<EvictionVerdict> => {
        const namespaceKey = `${pod.cluster}/${pod.getNamespace()}`;
        let namespaceVerdict = namespaceVerdicts.get(namespaceKey);

        if (!namespaceVerdict) {
          // Reuse a namespace-wide grant; only a denial needs per-pod checks.
          namespaceVerdict = checkEviction(pod);
          namespaceVerdicts.set(namespaceKey, namespaceVerdict);
        }

        const namespaceResult = await namespaceVerdict;
        if (namespaceResult !== 'denied') {
          return namespaceResult;
        }

        const podKey = `${namespaceKey}/${pod.getName()}`;
        let podVerdict = podVerdicts.get(podKey);

        if (!podVerdict) {
          podVerdict = checkEviction(pod, pod.getName());
          podVerdicts.set(podKey, podVerdict);
        }

        return podVerdict;
      };

      // Resolve the authorization questions before dispatching, so the notification
      // can name the Pods that were deleted instead of evicted and the Pods that were
      // skipped because their eviction permission could not be verified.
      const actions = await Promise.all(
        clonedItems.map(async item => {
          if (!settingsObj.useEvict || item.kind !== 'Pod') {
            return { item, operation: 'delete' as const, fallback: false };
          }

          const pod = item as Pod;
          const verdict = await evictionVerdict(pod);
          if (verdict === 'allowed') {
            return { item, operation: 'evict' as const, fallback: false };
          }
          if (verdict === 'denied') {
            // The user asked to delete and eviction is not permitted. Deletion is
            // still attempted, as it was before the eviction check existed (#3619).
            return { item, operation: 'delete' as const, fallback: true };
          }
          // The check itself failed, so we cannot tell whether evicting is allowed.
          // Skip the Pod rather than deleting it and bypassing a PodDisruptionBudget.
          return { item, operation: 'skip' as const, fallback: false };
        })
      );

      const fallbackPods = actions
        .filter(action => action.fallback)
        .map(action => action.item as Pod);
      const skippedPods = actions
        .filter(action => action.operation === 'skip')
        .map(action => action.item as Pod);

      const podList = (pods: Pod[]) => {
        const names = pods.map(pod =>
          [pod.cluster, pod.getNamespace(), pod.getName()].filter(Boolean).join('/')
        );
        if (names.length <= MAX_NAMED_PODS) {
          return names.join(', ');
        }
        const more = t('and {{ count }} more', { count: names.length - MAX_NAMED_PODS });
        return `${names.slice(0, MAX_NAMED_PODS).join(', ')} ${more}`;
      };

      const fallbackMessageFor = (pods: Pod[]) =>
        pods.length > 0
          ? t('Pods deleted instead of evicted because eviction is not permitted: {{ pods }}.', {
              pods: podList(pods),
            })
          : '';
      const fallbackMessage = fallbackMessageFor(fallbackPods);
      const skippedMessage =
        skippedPods.length > 0
          ? t('Pods skipped because their eviction permission could not be verified: {{ pods }}.', {
              pods: podList(skippedPods),
            })
          : '';
      const processedLength = itemsLength - skippedPods.length;
      const outcomeMessage = [
        processedLength > 0
          ? t('Deleted {{ itemsLength }} items.', { itemsLength: processedLength })
          : '',
        fallbackMessage,
        skippedMessage,
      ]
        .filter(Boolean)
        .join(' ');

      dispatch(
        clusterAction(
          async () => {
            const results = await Promise.allSettled(
              actions.map(({ item, operation }) => {
                if (operation === 'evict') {
                  return (item as Pod).evict();
                }
                if (operation === 'delete') {
                  return item.delete();
                }
                return Promise.resolve();
              })
            );

            // A failing item must not hide which Pods were deleted instead of
            // evicted, so report that alongside the failure.
            const failure = results.find(result => result.status === 'rejected');
            if (failure) {
              const reason =
                failure.reason instanceof Error ? failure.reason.message : String(failure.reason);
              const failureMessage = reason && !reason.endsWith('.') ? `${reason}.` : reason;
              // Only name the fallback Pods whose delete actually succeeded.
              const deletedFallbackPods = actions
                .filter((action, index) => action.fallback && results[index].status === 'fulfilled')
                .map(action => action.item as Pod);
              throw new Error(
                [failureMessage, fallbackMessageFor(deletedFallbackPods), skippedMessage]
                  .filter(Boolean)
                  .join(' ')
              );
            }

            if (skippedMessage) {
              // Part of the batch has already run, so report the whole outcome:
              // what was deleted and which Pods were left alone.
              throw new Error(outcomeMessage);
            }
          },
          {
            startMessage: t('Deleting {{ itemsLength }} items…', { itemsLength }),
            cancelledMessage: t('Cancelled deletion of {{ itemsLength }} items.', { itemsLength }),
            successMessage: [
              t('Deleted {{ itemsLength }} items.', { itemsLength }),
              fallbackMessage,
            ]
              .filter(Boolean)
              .join(' '),
            // The thrown error already carries the whole outcome when Pods were
            // skipped; otherwise report the delete/evict call that failed.
            errorMessage: skippedMessage
              ? ''
              : t('Error deleting {{ itemsLength }} items.', { itemsLength }),
            successOptions: fallbackPods.length > 0 ? { variant: 'warning' } : undefined,
            cancelUrl: location.pathname,
            startUrl: location.pathname,
            errorUrl: location.pathname,
            ...options,
          }
        )
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options]
  );

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <>
      <ActionButton
        description={t('translation|Delete items')}
        buttonStyle={buttonStyle}
        onClick={() => {
          setConfirmInput('');
          setOpenAlert(true);
        }}
        icon="mdi:delete"
      />
      <ConfirmDialog
        open={openAlert}
        title={t('translation|Delete items')}
        description={
          <Grid container direction="column">
            <Grid item>
              <DeleteMultipleButtonDescription items={items} />
            </Grid>
            {protectedNamespaces.length > 0 && (
              <>
                <Grid item sx={{ mt: 2 }}>
                  <Alert
                    severity="warning"
                    variant="outlined"
                    sx={theme => ({
                      color: theme.palette.warning.main,
                      borderColor: theme.palette.warning.main,
                      '& .MuiAlert-icon': { color: theme.palette.warning.main },
                      '& .MuiAlert-message': { fontSize: '0.95rem', fontWeight: 600 },
                    })}
                  >
                    {t(
                      'translation|Your selection includes system namespaces. Deleting them may break your cluster.'
                    )}
                  </Alert>
                </Grid>
                <Grid item sx={{ mt: 2.5 }}>
                  <Typography variant="body1" sx={{ mb: 1.5 }}>
                    {t('translation|To confirm, type {{ names }} in the field below.', {
                      names: confirmString,
                    })}
                  </Typography>
                  <TextField
                    fullWidth
                    autoComplete="off"
                    value={confirmInput}
                    onChange={event => setConfirmInput(event.target.value)}
                    placeholder={confirmString}
                    inputProps={{ 'aria-label': t('translation|Namespace name(s)') }}
                  />
                </Grid>
              </>
            )}
          </Grid>
        }
        confirmButtonDisabled={confirmButtonDisabled}
        handleClose={() => setOpenAlert(false)}
        onConfirm={() => {
          // The dialog is already closed here, so surface a failure to prepare the
          // batch instead of leaving an unhandled rejection with no feedback.
          deleteFunc(items).catch(err => {
            console.error('Error while preparing to delete the selected items:', err);
          });
          dispatchDeleteEvent({
            resources: items,
            status: EventStatus.CONFIRMED,
          });
          if (afterConfirm) {
            afterConfirm();
          }
        }}
      />
    </>
  );
}
