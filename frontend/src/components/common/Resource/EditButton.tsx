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
import { TFunction } from 'i18next';
import { useSnackbar } from 'notistack';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { KubeObject, KubeObjectInterface } from '../../../lib/k8s/KubeObject';
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
import AuthVisible from './AuthVisible';
import EditorDialog from './EditorDialog';
import { fetchLatestKubeObject } from './fetchLatestKubeObject';
import ViewButton from './ViewButton';

interface EditButtonProps {
  item: KubeObject;
  options?: CallbackActionOptions;
  buttonStyle?: ButtonStyle;
  afterConfirm?: () => void;
}

function makeErrorMessage(err: any, t: TFunction) {
  const status = err?.status;
  if (status === 409) {
    return t(
      'translation|This resource was modified by another process. Close the editor, review the latest version, and reapply your changes.'
    );
  }
  if (typeof status === 'number') {
    return t('translation|Failed to perform operation: code {{ status }}.', { status });
  }
  const fallbackMessage = t('translation|unknown error');
  return t('translation|Failed to perform operation: {{ message }}.', {
    message: err?.message || fallbackMessage,
  });
}

interface EditorActivityContentProps {
  item: KubeObject;
  activityId: string;
  options: CallbackActionOptions;
  afterConfirm?: () => void;
}

/**
 * Content rendered inside the edit Activity. It owns the live watch and the save
 * flow, so their lifecycle is tied to the Activity itself rather than to the
 * EditButton that launched it. This keeps conflict detection working even if the
 * user navigates away from the originating page while the editor stays open
 * (Activities are minimized on navigation, not closed).
 */
function EditorActivityContent({
  item,
  activityId,
  options,
  afterConfirm,
}: EditorActivityContentProps) {
  const dispatch: AppDispatch = useDispatch();
  const location = useLocation();
  const { t } = useTranslation(['translation', 'resource']);
  const dispatchHeadlampEditEvent = useEventCallback(HeadlampEventType.EDIT_RESOURCE);
  const [errorMessage, setErrorMessage] = React.useState<string>('');

  // Live watch, so the open editor keeps receiving resourceVersion updates for as
  // long as this Activity is open, regardless of the page that launched it.
  const ItemClass = item.constructor as (new (...args: any) => KubeObject) & typeof KubeObject;
  const [watchedItem] = ItemClass.useGet(item.metadata.name, item.metadata.namespace, {
    cluster: item.cluster,
  });

  const watched = watchedItem ?? item;
  const watchedVersion = watched.metadata?.resourceVersion ?? '';
  // Keep the editor item reference stable across renders, recomputing only when the
  // resourceVersion changes or when the watch first resolves (watchedItem null -> set,
  // even at the same version) — so the editor renders the live object and EditorDialog
  // re-evaluates its conflict check on real updates rather than on every watch tick.
  const editorItem = React.useMemo(
    () => watched.getEditableObject() as KubeObjectInterface,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchedVersion, Boolean(watchedItem)]
  );

  // Baseline for computing the patch. Capture it immediately — from the passed-in item
  // if the watch is still pending — so a save is never left without a baseline to diff
  // against. Once the watch resolves, upgrade the provisional baseline to the live
  // watched object (the same state the editor renders), then keep it fixed so later
  // external modifications are detected rather than silently rebasing the diff.
  const originalItemRef = React.useRef<KubeObjectInterface | null>(null);
  const baselineFromWatch = React.useRef(false);
  // Set/upgrade the baseline in a layout effect rather than during render: mutating refs
  // during render is unsafe under StrictMode/concurrent rendering, where a render can be
  // re-run or discarded before commit. A layout effect runs only for committed renders and
  // still fires before any user interaction, so updateFunc always has a baseline to diff against.
  React.useLayoutEffect(() => {
    if (originalItemRef.current === null) {
      originalItemRef.current = normalizeBaselineForPatch(editorItem);
      baselineFromWatch.current = !!watchedItem;
    } else if (!baselineFromWatch.current && watchedItem) {
      originalItemRef.current = normalizeBaselineForPatch(editorItem);
      baselineFromWatch.current = true;
    }
  }, [editorItem, watchedItem]);

  async function updateFunc(newItem: KubeObjectInterface) {
    const original = originalItemRef.current;
    if (!original) {
      throw new Error('Cannot compute patch: original resource state was not captured');
    }
    try {
      await item.patchUpdate(original, newItem);
      // Use a normalized clone of the modified object (what the editor shows)
      // as the new baseline, not the server response which includes
      // server-managed fields the editor may not display.
      originalItemRef.current = normalizeBaselineForPatch(newItem);
      Activity.close(activityId);
    } catch (err) {
      Activity.update(activityId, { minimized: false });
      setErrorMessage(makeErrorMessage(err, t));
      throw err;
    }
  }

  const applyFunc = React.useCallback(updateFunc, [item, activityId, t]);

  const handleSave = React.useCallback(
    (items: KubeObjectInterface[]) => {
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
    },
    [
      activityId,
      afterConfirm,
      applyFunc,
      dispatch,
      dispatchHeadlampEditEvent,
      item,
      location,
      options,
      t,
    ]
  );

  const handleClose = React.useCallback(() => {
    Activity.close(activityId);
  }, [activityId]);

  return (
    <EditorDialog
      noDialog
      item={editorItem}
      open
      onClose={handleClose}
      onSave={handleSave}
      allowToHideManagedFields
      errorMessage={errorMessage}
      onEditorChanged={() => setErrorMessage('')}
    />
  );
}

export default function EditButton(props: EditButtonProps) {
  const { item, options = {}, buttonStyle, afterConfirm } = props;
  const [isReadOnly, setIsReadOnly] = React.useState(false);
  const { t } = useTranslation(['translation', 'resource']);
  const { enqueueSnackbar } = useSnackbar();
  const dispatchHeadlampEditEvent = useEventCallback(HeadlampEventType.EDIT_RESOURCE);
  const activityId = 'edit-' + item.metadata.uid;
  const editRequestRef = React.useRef(0);

  if (!item) {
    return null;
  }

  if (isReadOnly) {
    return <ViewButton item={item} />;
  }

  return (
    <AuthVisible
      item={item}
      authVerb="update"
      onError={(err: Error) => {
        console.error(`Error while getting authorization for edit button in ${item}:`, err);
        setIsReadOnly(true);
      }}
      onAuthResult={({ allowed }) => {
        setIsReadOnly(!allowed);
      }}
    >
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
            const message = makeErrorMessage(err, t);
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

          Activity.close(activityId);
          Activity.launch({
            id: activityId,
            title: t('translation|Edit') + ': ' + editorItem.metadata.name,
            icon: <Icon icon="mdi:pencil" />,
            cluster: editorItem.cluster,
            content: (
              <EditorActivityContent
                item={editorItem}
                activityId={activityId}
                options={options}
                afterConfirm={afterConfirm}
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
    </AuthVisible>
  );
}
