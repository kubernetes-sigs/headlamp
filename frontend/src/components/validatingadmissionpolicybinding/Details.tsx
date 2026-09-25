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
import type { KubeNamedRuleWithOperations } from '../../lib/k8s/validatingAdmissionPolicy';
import ValidatingAdmissionPolicyBinding from '../../lib/k8s/validatingAdmissionPolicyBinding';
import { Link } from '../common';
import { DetailsGrid } from '../common/Resource';
import { MatchExpressions } from '../common/Resource/MatchExpressions';
import { SectionBox } from '../common/SectionBox';
import SimpleTable, { NameValueTable } from '../common/SimpleTable';

function renderRuleTable(rules: KubeNamedRuleWithOperations[] | undefined, t: (key: any) => any) {
  return (
    <SimpleTable
      data={rules || []}
      columns={[
        {
          label: t('translation|API Groups'),
          getter: rule => rule.apiGroups?.join(', ') || '*',
        },
        {
          label: t('translation|API Versions'),
          getter: rule => rule.apiVersions?.join(', ') || '*',
        },
        {
          label: t('translation|Operations'),
          getter: rule => rule.operations?.join(', ') || '*',
        },
        {
          label: t('translation|Resources'),
          getter: rule => rule.resources?.join(', ') || '*',
        },
        {
          label: t('translation|Resource Names'),
          getter: rule => rule.resourceNames?.join(', ') || t('translation|All'),
        },
        {
          label: t('translation|Scope'),
          getter: rule => rule.scope || '*',
        },
      ]}
    />
  );
}

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
          hide: !binding?.spec?.paramRef?.name && !!binding?.spec?.paramRef?.selector,
        },
        {
          name: t('glossary|Param Ref Selector'),
          value: binding?.spec?.paramRef?.selector ? (
            <MatchExpressions
              matchLabels={binding.spec.paramRef.selector.matchLabels}
              matchExpressions={binding.spec.paramRef.selector.matchExpressions}
            />
          ) : (
            t('translation|None')
          ),
          hide: !binding?.spec?.paramRef?.selector,
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
      extraSections={binding => [
        {
          id: 'headlamp.validatingadmissionpolicybinding.matchResources',
          section: binding?.spec?.matchResources ? (
            <SectionBox title={t('glossary|Match Resources')}>
              <NameValueTable
                rows={[
                  {
                    name: t('glossary|Match Policy'),
                    value: binding.spec.matchResources.matchPolicy || t('translation|None'),
                  },
                  {
                    name: t('glossary|Namespace Selector'),
                    value: (
                      <MatchExpressions
                        matchLabels={binding.spec.matchResources.namespaceSelector?.matchLabels}
                        matchExpressions={
                          binding.spec.matchResources.namespaceSelector?.matchExpressions
                        }
                      />
                    ),
                    hide:
                      !binding.spec.matchResources.namespaceSelector?.matchLabels &&
                      !binding.spec.matchResources.namespaceSelector?.matchExpressions?.length,
                  },
                  {
                    name: t('glossary|Object Selector'),
                    value: (
                      <MatchExpressions
                        matchLabels={binding.spec.matchResources.objectSelector?.matchLabels}
                        matchExpressions={
                          binding.spec.matchResources.objectSelector?.matchExpressions
                        }
                      />
                    ),
                    hide:
                      !binding.spec.matchResources.objectSelector?.matchLabels &&
                      !binding.spec.matchResources.objectSelector?.matchExpressions?.length,
                  },
                  {
                    name: t('glossary|Resource Rules'),
                    value: renderRuleTable(binding.spec.matchResources.resourceRules, t),
                    hide: !binding.spec.matchResources.resourceRules?.length,
                  },
                  {
                    name: t('glossary|Exclude Resource Rules'),
                    value: renderRuleTable(binding.spec.matchResources.excludeResourceRules, t),
                    hide: !binding.spec.matchResources.excludeResourceRules?.length,
                  },
                ]}
              />
            </SectionBox>
          ) : null,
        },
      ]}
    />
  );
}
