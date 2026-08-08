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
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { KubeObject, KubeObjectClass } from '../../../lib/k8s/KubeObject';
import { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { normalizeBaselineForPatch } from '../../../lib/k8s/patchUtils';
import { CallbackActionOptions, clusterAction } from '../../../redux/clusterActionSlice';
import {
  EventStatus,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { AppDispatch } from '../../../redux/stores/store';
import { Activity } from '../../activity/Activity';
import ActionButton, { ButtonStyle } from '../ActionButton';
import EditorDialog from './EditorDialog';
import { fetchLatestKubeObject } from './fetchLatestKubeObject';
import ViewButton from './ViewButton';

interface EditButtonProps {
  item: KubeObject;
  options?: CallbackActionOptions;
  buttonStyle?: ButtonStyle;
  afterConfirm?: () => void;
}

export default function EditButton(props: EditButtonProps) {
  const dispatch: AppDispatch = useDispatch();
  const { item, options = {}, buttonStyle, afterConfirm } = props;
  const [errorMessage, setErrorMessage] = React.useState<string>('');
  const location = useLocation();
  const { t } = useTranslation(['translation', 'resource']);
  const { enqueueSnackbar } = useSnackbar();
  const dispatchHeadlampEditEvent = useEventCallback(HeadlampEventType.EDIT_RESOURCE);
  const activityId = 'edit-' + item.metadata.uid;

  const originalItemRef = React.useRef<KubeObjectInterface | null>(null);
  const editorItemRef = React.useRef<KubeObject>(item);
  const editRequestRef = React.useRef(0);

  function makeErrorMessage(err: any) {
    const status = err?.status;
    if (status === 409) {
      return t('translation|Conflicts when trying to perform operation (code 409).');
    }
    if (typeof status === 'number') {
      return t('translation|Failed to perform operation: code {{ status }}.', { status });
    }
    const fallbackMessage = t('translation|unknown error');
    return t('translation|Failed to perform operation: {{ message }}.', {
      message: err?.message || fallbackMessage,
    });
  }

  async function updateFunc(newItem: KubeObjectInterface) {
    const original = originalItemRef.current;
    if (!original) {
      throw new Error('Cannot compute patch: original resource state was not captured');
    }
    try {
      // Issue #4882: a user may have only the 'patch' verb or only the
      // 'update' verb. Use the JSON Patch save path when patch is granted,
      // otherwise fall back to a full object update (PUT) for update-only
      // users.
      if (authDataRef.current?.patch) {
        await editorItemRef.current.patchUpdate(original, newItem);
      } else {
        await editorItemRef.current.update(newItem);
      }
      // Use a normalized clone of the modified object (what the editor shows)
      // as the new baseline, not the server response which includes
      // server-managed fields the editor may not display.
      originalItemRef.current = normalizeBaselineForPatch(newItem);
      Activity.close(activityId);
    } catch (err) {
      Activity.update(activityId, { minimized: false });
      setErrorMessage(makeErrorMessage(err));
      throw err;
    }
  }

  const applyFunc = (newItem: KubeObjectInterface) => updateFunc(newItem);

  function handleSave(items: KubeObjectInterface[]) {
    const newItemDef = Array.isArray(items) ? items[0] : items;
    const cancelUrl = location.pathname;
    const itemName = item.metadata.name;

    Activity.update(activityId, { minimized: true });
    dispatch(
      clusterAction(() => applyFunc(newItemDef), {
        startMessage: t('translation|Applying changes to {{ itemName }}…', { itemName }),
        cancelledMessage: t('translation|Cancelled changes to {{ itemName }}.', { itemName }),
        successMessage: t('translation|Applied changes to {{ itemName }}.', { itemName }),
        errorMessage: t('translation|Failed to apply changes to {{ itemName }}.', { itemName }),
        cancelUrl,
        errorUrl: cancelUrl,
        ...options,
      })
    );

    dispatchHeadlampEditEvent({
      resource: item,
      status: EventStatus.CLOSED,
    });
    if (afterConfirm) {
      afterConfirm();
    }
  }

  const itemClass: KubeObjectClass | null = (item as any)?._class?.() ?? item;
  const itemName = (item as any)?.getName?.();

  // Issue #4882: show the edit pencil when the user has either the 'patch'
  // or the 'update' verb. The save path is chosen to match (JSON Patch when
  // patch is granted, full update otherwise).
  const { data: authData } = useQuery({
    enabled: !!item,
    queryKey: [
      'authEdit',
      itemName,
      item?.metadata?.namespace,
      item?.cluster,
      itemClass?.apiName,
      itemClass?.apiVersion,
    ],
    queryFn: async () => {
      try {
        // Short-circuit on 'patch' (the common least-privilege setup) to
        // keep the authorization traffic to one request where possible; only
        // fall back to checking 'update' when patch is not granted.
        const patchAuth = await item!.getAuthorization('patch', {});
        if (patchAuth?.status?.allowed) {
          return { patch: true, update: false };
        }
        const updateAuth = await item!.getAuthorization('update', {});
        return { patch: false, update: updateAuth?.status?.allowed ?? false };
      } catch (e: any) {
        console.error(`Error while getting authorization for edit button in ${item}:`, e);
        return { patch: false, update: false };
      }
    },
  });

  // Mirror the auth result so the (memoized) save function can pick the
  // right verb without stale closures.
  const authDataRef = React.useRef<{ patch: boolean; update: boolean } | null>(null);
  React.useEffect(() => {
    authDataRef.current = authData ?? null;
  }, [authData]);

  if (!item) {
    return null;
  }

  // While the authorization request is in flight, show the view button
  // rather than nothing; swap to the edit button once auth resolves.
  if (!authData || !(authData.patch || authData.update)) {
    return <ViewButton item={item} />;
  }

  return (
    <>
      <ActionButton
        description={t('translation|Edit')}
        buttonStyle={buttonStyle}
        onClick={async () => {
          const requestId = ++editRequestRef.current;
          if (afterConfirm) {
            afterConfirm();
          }
          let editorItem = item;
          try {
            editorItem = await fetchLatestKubeObject(item);
          } catch (err) {
            if (requestId !== editRequestRef.current) {
              return;
            }

            const status = (err as any)?.status;
            const message = makeErrorMessage(err);
            console.error(
              'Error while fetching latest resource for YAML edit:',
              {
                kind: item.kind,
                name: item.metadata.name,
                namespace: item.metadata.namespace,
                cluster: item.cluster,
              },
              err
            );
            if (status === 401 || status === 403) {
              enqueueSnackbar(message, { variant: 'warning' });
              editorItem = item;
            } else {
              enqueueSnackbar(message, { variant: 'error' });
              return;
            }
          }

          if (requestId !== editRequestRef.current) {
            return;
          }

          setErrorMessage('');
          const editableObject = editorItem.getEditableObject() as KubeObjectInterface;
          // Normalize the baseline to match what EditorDialog presents to the
          // user (which by default hides metadata.managedFields). Otherwise a
          // "save without changes" produces a managedFields-only diff that
          // patchUpdate would reject.
          originalItemRef.current = normalizeBaselineForPatch(editableObject);
          editorItemRef.current = editorItem;
          Activity.close(activityId);
          Activity.launch({
            id: activityId,
            title: t('translation|Edit') + ': ' + editorItem.metadata.name,
            icon: <Icon icon="mdi:pencil" />,
            cluster: editorItem.cluster,
            content: (
              <EditorDialog
                noDialog
                item={editableObject}
                open
                onClose={() => Activity.close(activityId)}
                onSave={handleSave}
                allowToHideManagedFields
                errorMessage={errorMessage}
                onEditorChanged={() => setErrorMessage('')}
              />
            ),
            location: 'full',
          });

          dispatchHeadlampEditEvent({
            resource: editorItem,
            status: EventStatus.OPENED,
          });
        }}
        icon="mdi:pencil"
      />
    </>
  );
}
