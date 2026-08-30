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
import ValidatingAdmissionPolicy from '../../lib/k8s/validatingAdmissionPolicy';
import { DetailsGrid } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import { NameValueTable } from '../common/SimpleTable';

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
          value: policy?.spec?.failurePolicy || t('translation|None'),
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
