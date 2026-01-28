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

import { FormControlLabel, Switch } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Secret from '../../lib/k8s/secret';
import { CreateResourceButton } from '../common';
import ResourceListView from '../common/Resource/ResourceListView';

export default function SecretList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const [hideHelm, setHideHelm] = useState(true);
  const [secrets, error] = Secret.useList();

  const filteredSecrets =
    hideHelm && secrets ? secrets.filter(secret => secret.type !== 'helm.sh/release.v1') : secrets;

  return (
    <ResourceListView
      title={t('Secrets')}
      data={filteredSecrets}
      errorMessage={Secret.getErrorMessage(error)}
      headerProps={{
        titleSideActions: [
          <CreateResourceButton key="create-button" resourceClass={Secret} />,
          <FormControlLabel
            key="helm-switch"
            control={
              <Switch
                checked={hideHelm}
                onChange={e => setHideHelm(e.target.checked)}
                color="primary"
                size="small"
              />
            }
            label={t(['translation', 'Hide Helm Secrets'].join('|'))}
            sx={{ marginLeft: '0.5rem' }}
          />,
        ],
      }}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'type',
          label: t('translation|Type'),
          gridTemplate: 'min-content',
          filterVariant: 'multi-select',
          getValue: secret => secret.type,
        },
        {
          id: 'data',
          label: t('translation|Data'),
          gridTemplate: 'min-content',
          getValue: (secret: Secret) => Object.keys(secret.data || {}).length || 0,
        },
        'age',
      ]}
    />
  );
}
