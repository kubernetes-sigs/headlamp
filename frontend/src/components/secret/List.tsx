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
import React from 'react';
import { useTranslation } from 'react-i18next';
import Secret from '../../lib/k8s/secret';
import { useNamespaces } from '../../redux/filterSlice';
import { CreateResourceButton } from '../common';
import ResourceListView from '../common/Resource/ResourceListView';

export default function SecretList() {
  const SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY = 'SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY';
  const SECRET_LIST_HELM_SECRET_HIDE_DEFAULT = true;
  const { t } = useTranslation(['glossary', 'translation']);
  const storedHideHelm = localStorage.getItem(SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY);
  const [hideHelm, setHideHelm] = React.useState<boolean>(
    JSON.parse(storedHideHelm || SECRET_LIST_HELM_SECRET_HIDE_DEFAULT.toString())
  );

  const [secrets, error] = Secret.useList({ namespace: useNamespaces() });

  const filteredSecrets = React.useMemo(() => {
    if (!secrets) {
      return null;
    }
    return hideHelm ? secrets.filter(secret => secret.type !== 'helm.sh/release.v1') : secrets;
  }, [secrets, hideHelm]);

  return (
    <ResourceListView
      id="headlamp-secrets"
      title={t('Secrets')}
      data={filteredSecrets}
      errorMessage={Secret.getErrorMessage(error)}
      headerProps={{
        noNamespaceFilter: false,
        titleSideActions: [
          <CreateResourceButton key="create-button" resourceClass={Secret} />,
          <FormControlLabel
            key="helm-switch"
            checked={hideHelm}
            control={
              <Switch
                checked={hideHelm}
                onChange={(e, checked) => {
                  localStorage.setItem(
                    SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY,
                    checked.toString()
                  );
                  setHideHelm(checked);
                }}
                color="primary"
              />
            }
            label={t('translation|Hide Helm Secrets')}
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
