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
import ValidatingAdmissionPolicy, {
  type KubeNamedRuleWithOperations,
} from '../../lib/k8s/validatingAdmissionPolicy';
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

export default function ValidatingAdmissionPolicyDetails(props: {
  name?: string;
  cluster?: string;
}) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={ValidatingAdmissionPolicy}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={policy => [
        {
          name: t('glossary|Failure Policy'),
          value: policy?.spec?.failurePolicy || 'Fail',
        },
        {
          name: t('glossary|Match Policy'),
          value: policy?.spec?.matchConstraints?.matchPolicy || t('translation|None'),
        },
        {
          name: t('glossary|Param Kind'),
          value: policy?.spec?.paramKind
            ? `${policy.spec.paramKind.apiVersion || ''} ${policy.spec.paramKind.kind || ''}`
            : t('translation|None'),
        },
      ]}
      extraSections={policy => [
        {
          id: 'headlamp.validatingadmissionpolicy.validations',
          section: (
            <SectionBox title={t('glossary|Validations')}>
              <NameValueTable
                rows={
                  policy?.spec?.validations?.map((validation, idx) => ({
                    name: `Validation ${idx + 1}`,
                    value: (
                      <div>
                        <div>
                          <strong>{t('translation|Expression')}:</strong>{' '}
                          <code>{validation.expression}</code>
                        </div>
                        {validation.message && (
                          <div>
                            <strong>{t('translation|Message')}:</strong> {validation.message}
                          </div>
                        )}
                        {validation.messageExpression && (
                          <div>
                            <strong>{t('translation|Message Expression')}:</strong>{' '}
                            <code>{validation.messageExpression}</code>
                          </div>
                        )}
                        {validation.reason && (
                          <div>
                            <strong>{t('translation|Reason')}:</strong> {validation.reason}
                          </div>
                        )}
                      </div>
                    ),
                  })) || []
                }
              />
            </SectionBox>
          ),
        },
        {
          id: 'headlamp.validatingadmissionpolicy.matchConstraints',
          section: policy?.spec?.matchConstraints ? (
            <SectionBox title={t('glossary|Match Constraints')}>
              <NameValueTable
                rows={[
                  {
                    name: t('glossary|Match Policy'),
                    value: policy.spec.matchConstraints.matchPolicy || t('translation|None'),
                  },
                  {
                    name: t('glossary|Namespace Selector'),
                    value: (
                      <MatchExpressions
                        matchLabels={policy.spec.matchConstraints.namespaceSelector?.matchLabels}
                        matchExpressions={
                          policy.spec.matchConstraints.namespaceSelector?.matchExpressions
                        }
                      />
                    ),
                    hide:
                      !policy.spec.matchConstraints.namespaceSelector?.matchLabels &&
                      !policy.spec.matchConstraints.namespaceSelector?.matchExpressions?.length,
                  },
                  {
                    name: t('glossary|Object Selector'),
                    value: (
                      <MatchExpressions
                        matchLabels={policy.spec.matchConstraints.objectSelector?.matchLabels}
                        matchExpressions={
                          policy.spec.matchConstraints.objectSelector?.matchExpressions
                        }
                      />
                    ),
                    hide:
                      !policy.spec.matchConstraints.objectSelector?.matchLabels &&
                      !policy.spec.matchConstraints.objectSelector?.matchExpressions?.length,
                  },
                  {
                    name: t('glossary|Resource Rules'),
                    value: renderRuleTable(policy.spec.matchConstraints.resourceRules, t),
                    hide: !policy.spec.matchConstraints.resourceRules?.length,
                  },
                  {
                    name: t('glossary|Exclude Resource Rules'),
                    value: renderRuleTable(policy.spec.matchConstraints.excludeResourceRules, t),
                    hide: !policy.spec.matchConstraints.excludeResourceRules?.length,
                  },
                ]}
              />
            </SectionBox>
          ) : null,
        },
        {
          id: 'headlamp.validatingadmissionpolicy.matchConditions',
          section: policy?.spec?.matchConditions ? (
            <SectionBox title={t('glossary|Match Conditions')}>
              <NameValueTable
                rows={
                  policy.spec.matchConditions.map((condition, idx) => ({
                    name: condition.name || `Condition ${idx + 1}`,
                    value: <code>{condition.expression}</code>,
                  })) || []
                }
              />
            </SectionBox>
          ) : null,
        },
        {
          id: 'headlamp.validatingadmissionpolicy.auditAnnotations',
          section: policy?.spec?.auditAnnotations ? (
            <SectionBox title={t('glossary|Audit Annotations')}>
              <NameValueTable
                rows={
                  policy.spec.auditAnnotations.map(annotation => ({
                    name: annotation.key,
                    value: <code>{annotation.valueExpression}</code>,
                  })) || []
                }
              />
            </SectionBox>
          ) : null,
        },
        {
          id: 'headlamp.validatingadmissionpolicy.variables',
          section: policy?.spec?.variables ? (
            <SectionBox title={t('glossary|Variables')}>
              <NameValueTable
                rows={
                  policy.spec.variables.map(variable => ({
                    name: variable.name,
                    value: <code>{variable.expression}</code>,
                  })) || []
                }
              />
            </SectionBox>
          ) : null,
        },
      ]}
    />
  );
}
