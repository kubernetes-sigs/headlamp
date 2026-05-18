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
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { LimitRange } from '../../lib/k8s/limitRange';
import { useNamespaces } from '../../redux/filterSlice';
import { CreateResourceButton } from '../common/CreateResourceButton';
import ResourceListView from '../common/Resource/ResourceListView';
import { SimpleTableProps } from '../common/SimpleTable';

export interface LimitRangeProps {
  limitRanges: LimitRange[] | null;
  errors: ApiError[] | null;
  hideColumns?: string[];
  reflectTableInURL?: SimpleTableProps['reflectInURL'];
  noNamespaceFilter?: boolean;
}

export function LimitRangeRenderer(props: LimitRangeProps) {
  const {
    errors,
    limitRanges,
    hideColumns = [],
    reflectTableInURL = 'limitranges',
    noNamespaceFilter,
  } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('glossary|LimitRange')}
      columns={['name', 'namespace', 'cluster', 'age']}
      hideColumns={hideColumns}
      headerProps={{
        noNamespaceFilter,
        titleSideActions: [<CreateResourceButton resourceClass={LimitRange} />],
      }}
      errors={errors}
      data={limitRanges}
      reflectInURL={reflectTableInURL}
      id="headlamp-limitranges"
    />
  );
}

export function LimitRangeList() {
  const { items: limitRanges, errors } = LimitRange.useList({ namespace: useNamespaces() });

  return <LimitRangeRenderer limitRanges={limitRanges} errors={errors} reflectTableInURL />;
}
