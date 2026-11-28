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
import type { FlowSchemaSubject } from '../../lib/k8s/flowSchema';
import FlowSchema from '../../lib/k8s/flowSchema';
import EmptyContent from '../common/EmptyContent';
import { ConditionsTable, DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';
import PriorityLevelReference from './PriorityLevelReference';

/** A subject reads differently per kind, and the name lives under a different key. */
function subjectName(subject: FlowSchemaSubject): string {
  if (subject.serviceAccount) {
    return `${subject.serviceAccount.namespace}/${subject.serviceAccount.name}`;
  }
  return subject.user?.name ?? subject.group?.name ?? '';
}

const join = (values?: string[]) => (values ?? []).join(', ');

export default function FlowSchemaDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={FlowSchema}
      name={name}
      cluster={cluster}
      extraInfo={item =>
        item && [
          {
            name: t('glossary|Priority Level'),
            value: <PriorityLevelReference schema={item} />,
          },
          {
            name: t('translation|Matching Precedence'),
            value: item.matchingPrecedence?.toString(),
            hide: item.matchingPrecedence === undefined,
          },
          {
            name: t('translation|Distinguisher Method'),
            value: item.distinguisherMethod ?? t('translation|None'),
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.flowschema-rules',
            section:
              item.rules.length === 0 ? (
                <SectionBox title={t('translation|Rules')}>
                  <EmptyContent>{t('translation|No rules data to be shown.')}</EmptyContent>
                </SectionBox>
              ) : (
                item.rules.map((rule, index) => (
                  <SectionBox
                    key={index}
                    title={t('translation|Rule {{ index }}', { index: index + 1 })}
                  >
                    <SimpleTable
                      columns={[
                        {
                          label: t('translation|Subject'),
                          getter: (subject: FlowSchemaSubject) => subject.kind,
                          gridTemplate: 'min-content',
                        },
                        {
                          label: t('translation|Name'),
                          getter: (subject: FlowSchemaSubject) => subjectName(subject),
                        },
                      ]}
                      data={rule.subjects ?? []}
                      emptyMessage={t('translation|No subjects.')}
                      reflectInURL={`rule${index}subjects`}
                    />
                    {(rule.resourceRules ?? []).length > 0 && (
                      <SimpleTable
                        columns={[
                          { label: t('glossary|Verbs'), getter: r => join(r.verbs) },
                          {
                            label: t('glossary|API Groups'),
                            getter: rule =>
                              rule.apiGroups
                                .map((group: string) => group || t('translation|Core API group'))
                                .join(', '),
                          },
                          { label: t('glossary|Resources'), getter: r => join(r.resources) },
                          {
                            label: t('glossary|Namespaces'),
                            getter: r => join(r.namespaces) || '-',
                          },
                          {
                            label: t('translation|Cluster Scope'),
                            getter: rule =>
                              rule.clusterScope ? t('translation|Yes') : t('translation|No'),
                          },
                        ]}
                        data={rule.resourceRules ?? []}
                        reflectInURL={`rule${index}resources`}
                      />
                    )}
                    {(rule.nonResourceRules ?? []).length > 0 && (
                      <SimpleTable
                        columns={[
                          { label: t('glossary|Verbs'), getter: r => join(r.verbs) },
                          { label: t('translation|URLs'), getter: r => join(r.nonResourceURLs) },
                        ]}
                        data={rule.nonResourceRules ?? []}
                        reflectInURL={`rule${index}urls`}
                      />
                    )}
                  </SectionBox>
                ))
              ),
          },
          {
            id: 'headlamp.flowschema-conditions',
            section: (
              <SectionBox title={t('translation|Conditions')}>
                <ConditionsTable resource={item.jsonData} showLastUpdate={false} />
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}
