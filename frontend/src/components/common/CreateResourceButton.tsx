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
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectedClusters } from '../../lib/k8s';
import { KubeObjectClass } from '../../lib/k8s/cluster';
import { Activity } from '../activity/Activity';
import ActionButton from '../common/ActionButton';
import { AuthVisible } from '../common/Resource';
import { EditorDialog } from '../common/Resource';

export interface CreateResourceButtonProps {
  resourceClass: KubeObjectClass;
  resourceName?: string;
}

export function CreateResourceButton(props: CreateResourceButtonProps) {
  const { resourceClass, resourceName } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const [errorMessage, setErrorMessage] = React.useState('');
  const clusters = useSelectedClusters();

  const baseObject = resourceClass.getBaseObject();
  const name = resourceName ?? baseObject.kind;
  const activityId = 'create-resource-' + resourceClass.apiName;

  return (
    <AuthVisible item={resourceClass} authVerb="create">
      <ActionButton
        color="primary"
        description={t('translation|Create {{ name }}', { name })}
        icon={'mdi:plus-circle'}
        onClick={() => {
          Activity.launch({
            id: activityId,
            title: t('translation|Create {{ name }}', { name }),
            location: 'full',
            cluster: clusters[0],
            icon: <Icon icon="mdi:plus-circle" />,
            content: (
              <EditorDialog
                noDialog
                item={baseObject}
                open
                setOpen={() => {}}
                onClose={() => Activity.close(activityId)}
                saveLabel={t('translation|Apply')}
                errorMessage={errorMessage}
                onEditorChanged={() => setErrorMessage('')}
                title={t('translation|Create {{ name }}', { name })}
                aria-label={t('translation|Create {{ name }}', { name })}
              />
            ),
          });
        }}
      />
    </AuthVisible>
  );
}
