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
import { useParams } from 'react-router-dom';
import ValidatingAdmissionPolicyBinding from '../../lib/k8s/validatingAdmissionPolicyBinding';
import { Link } from '../common';
import { DetailsGrid } from '../common/Resource';

export default function ValidatingAdmissionPolicyBindingDetails(props: {
  name?: string;
  cluster?: string;
}) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={ValidatingAdmissionPolicyBinding}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={binding => [
        {
          name: t('glossary|Policy Name'),
          value: binding?.spec?.policyName ? (
            <Link
              routeName="validatingAdmissionPolicy"
              params={{ name: binding.spec.policyName }}
              activeCluster={binding.cluster}
            >
              {binding.spec.policyName}
            </Link>
          ) : (
            t('translation|None')
          ),
        },
        {
          name: t('glossary|Validation Actions'),
          value: binding?.spec?.validationActions?.join(', ') || t('translation|None'),
        },
        {
          name: t('glossary|Match Policy'),
          value: binding?.spec?.matchResources?.matchPolicy || t('translation|None'),
        },
        {
          name: t('glossary|Param Ref Name'),
          value: binding?.spec?.paramRef?.name || t('translation|None'),
        },
        {
          name: t('glossary|Param Ref Namespace'),
          value: binding?.spec?.paramRef?.namespace || t('translation|None'),
        },
        {
          name: t('glossary|Parameter Not Found Action'),
          value: binding?.spec?.paramRef?.parameterNotFoundAction || t('translation|None'),
        },
      ]}
    />
  );
}
