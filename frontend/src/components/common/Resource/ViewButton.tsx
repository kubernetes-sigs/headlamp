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
import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { KubeObject } from '../../../lib/k8s/cluster';
import { Activity } from '../../activity/Activity';
import ActionButton, { ButtonStyle } from '../ActionButton';
import EditorDialog from './EditorDialog';
import { fetchLatestKubeObject } from './fetchLatestKubeObject';

export interface ViewButtonProps {
  /** The item we want to view */
  item: KubeObject;
  /** If we want to have the view open by default */
  initialToggle?: boolean;
  buttonStyle?: ButtonStyle;
}

function ViewButton({ item, buttonStyle, initialToggle }: ViewButtonProps) {
  const { t } = useTranslation();
  const activityId = 'yaml-' + item.metadata.uid;
  const launchRequestRef = React.useRef(0);

  const launchActivity = useCallback(async () => {
    const requestId = ++launchRequestRef.current;
    let editorItem = item;
    try {
      editorItem = await fetchLatestKubeObject(item);
    } catch (err) {
      if (requestId !== launchRequestRef.current) {
        return;
      }

      console.error(
        'Error while fetching latest resource for YAML view:',
        {
          kind: item.kind,
          name: item.metadata.name,
          namespace: item.metadata.namespace,
          cluster: item.cluster,
        },
        err
      );
    }

    if (requestId !== launchRequestRef.current) {
      return;
    }

    Activity.close(activityId);
    Activity.launch({
      id: activityId,
      title: editorItem.metadata.name,
      cluster: editorItem.cluster,
      icon: <Icon icon="mdi:eye" />,
      location: 'window',
      content: (
        <EditorDialog
          noDialog
          item={editorItem.jsonData}
          open
          allowToHideManagedFields
          onClose={() => Activity.close(activityId)}
          onSave={null}
        />
      ),
    });
  }, [activityId, item]);

  const initialToggleRef = React.useRef(initialToggle);

  useEffect(() => {
    if (!initialToggleRef.current) {
      return;
    }

    initialToggleRef.current = false;
    launchActivity();
  }, [launchActivity]);

  return (
    <>
      <ActionButton
        description={t('translation|View YAML')}
        buttonStyle={buttonStyle}
        onClick={launchActivity}
        icon="mdi:eye"
        edge="end"
      />
    </>
  );
}

export default ViewButton;
