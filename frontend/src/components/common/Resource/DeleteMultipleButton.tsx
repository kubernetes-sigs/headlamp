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

import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { KubeObject } from '../../../lib/k8s/KubeObject';
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

function DeleteMultipleButtonDescription(props: DeleteMultipleButtonDescriptionProps) {
  const { t } = useTranslation(['translation']);
  return (
    <p>
      {t('Are you sure you want to delete the following items?')}
      <ul>
        {props.items?.map(item => (
          <li key={item.metadata.uid}>{item.metadata.name}</li>
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
  const { t } = useTranslation(['translation']);
  const location = useLocation();
  const dispatchDeleteEvent = useEventCallback(HeadlampEventType.DELETE_RESOURCES);

  const deleteFunc = React.useCallback(
    (items: KubeObject[]) => {
      if (!items || items.length === 0) {
        return;
      }
      const clonedItems = _.cloneDeep(items);
      const itemsLength = clonedItems.length;

      dispatch(
        clusterAction(
          async () => {
            await Promise.all(
              items.map(item => {
                if (settingsObj.useEvict && item.kind === 'Pod') {
                  const pod = item as Pod;
                  return pod.evict();
                }
                return item.delete();
              })
            );
          },
          {
            startMessage: t('Deleting {{ itemsLength }} items…', { itemsLength }),
            cancelledMessage: t('Cancelled deletion of {{ itemsLength }} items.', { itemsLength }),
            successMessage: t('Deleted {{ itemsLength }} items.', { itemsLength }),
            errorMessage: t('Error deleting {{ itemsLength }} items.', { itemsLength }),
            cancelUrl: location.pathname,
            startUrl: location.pathname,
            errorUrl: location.pathname,
            ...options,
          }
        )
      );
    },
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
          setOpenAlert(true);
        }}
        icon="mdi:delete"
      />
      <ConfirmDialog
        open={openAlert}
        title={t('translation|Delete items')}
        description={<DeleteMultipleButtonDescription items={items} />}
        handleClose={() => setOpenAlert(false)}
        onConfirm={() => {
          deleteFunc(items);
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
