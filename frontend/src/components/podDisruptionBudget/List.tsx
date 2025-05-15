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

import { useTranslation } from 'react-i18next';
import PDB from '../../lib/k8s/podDisruptionBudget';
import ResourceListView from '../common/Resource/ResourceListView';

export default function PDBList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('glossary|Pod Disruption Budget')}
      resourceClass={PDB}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'minAvailable',
          label: t('translation|Min Available'),
          gridTemplate: 'min-content',
          getValue: (item: PDB) => item.spec.minAvailable || t('translation|N/A'),
        },
        {
          id: 'maxUnavailable',
          label: t('translation|Max Unavailable'),
          gridTemplate: 'min-content',
          getValue: (item: PDB) => item.spec.maxUnavailable || t('translation|N/A'),
        },
        {
          id: 'allowedDisruptions',
          label: t('translation|Allowed Disruptions'),
          gridTemplate: 'min-content',
          getValue: (item: PDB) => item.status.disruptionsAllowed || t('translation|N/A'),
        },
        'age',
      ]}
    />
  );
}
