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

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { CallbackActionOptions, clusterAction } from '../../../redux/clusterActionSlice';
import {
  EventStatus,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { AppDispatch } from '../../../redux/stores/store';
import ActionButton, { ButtonStyle } from '../ActionButton';
import AuthVisible from './AuthVisible';
import EditorDialog from './EditorDialog';
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
  const [openDialog, setOpenDialog] = React.useState(false);
  const [isReadOnly, setIsReadOnly] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string>('');
  const location = useLocation();
  const { t } = useTranslation(['translation', 'resource']);
  const dispatchHeadlampEditEvent = useEventCallback(HeadlampEventType.EDIT_RESOURCE);

  function makeErrorMessage(err: any) {
    const status: number = err.status;
    switch (status) {
      case 408:
        return 'Conflicts when trying to perform operation (code 408).';
      default:
        return `Failed to perform operation: code ${status}`;
    }
  }

  async function updateFunc(newItem: KubeObjectInterface) {
    try {
      await item.update(newItem);
    } catch (err) {
      setErrorMessage(makeErrorMessage(err));
      setOpenDialog(true);
      throw err;
    }
  }

  const applyFunc = React.useCallback(updateFunc, [item]);

  function handleSave(items: KubeObjectInterface[]) {
    const newItemDef = Array.isArray(items) ? items[0] : items;
    const cancelUrl = location.pathname;
    const itemName = item.metadata.name;

    setOpenDialog(false);
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
        onClick={() => {
          setOpenDialog(true);
          dispatchHeadlampEditEvent({
            resource: item,
            status: EventStatus.OPENED,
          });
        }}
        icon="mdi:pencil"
      />
      {openDialog && (
        <EditorDialog
          item={item.getEditableObject()}
          open={openDialog}
          onClose={() => setOpenDialog(false)}
          onSave={handleSave}
          errorMessage={errorMessage}
          onEditorChanged={() => setErrorMessage('')}
        />
      )}
    </AuthVisible>
  );
}
