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

import React from 'react';
import { useTranslation } from 'react-i18next';
import Ingress from '../../lib/k8s/ingress';
import LabelListItem from '../common/LabelListItem';
import Link from '../common/Link';
import ResourceListView from '../common/Resource/ResourceListView';

function RulesDisplay(props: { ingress: Ingress }) {
  const { ingress } = props;

  const rulesText = React.useMemo(() => {
    const rules = ingress.getRules();
    let labels: string[] = [];

    rules.forEach(({ http }) => {
      const text =
        http?.paths.map(({ path, backend }) => {
          let target = '';
          if (!!backend.service) {
            const service = backend.service.name;
            const port = backend.service.port.number ?? backend.service.port.name ?? '';
            target = `${!!service ? service + ':' + port.toString() : port.toString()}`;
          } else if (!!backend.resource) {
            target = `${backend.resource.kind}:${backend.resource.name}`;
          }
          return `${path} 🞂 ${target}`;
        }) ?? '';
      labels = labels.concat(text);
    });

    return labels;
  }, [ingress]);

  return <LabelListItem labels={rulesText} />;
}

export default function IngressList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Ingresses')}
      resourceClass={Ingress}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'class',
          label: t('Class Name'),
          getValue: ingress => ingress.spec?.ingressClassName,
          render: ingress =>
            ingress.spec?.ingressClassName ? (
              <Link routeName="ingressclass" params={{ name: ingress.spec?.ingressClassName }}>
                {ingress.spec?.ingressClassName}
              </Link>
            ) : null,
        },
        {
          id: 'hosts',
          label: t('Hosts'),
          getValue: ingress =>
            ingress
              .getRules()
              .map(r => r.host ?? '*')
              .join(''),
          render: ingress => (
            <LabelListItem labels={ingress.getRules().map(({ host }) => host || '*')} />
          ),
        },
        {
          id: 'ports',
          label: t('translation|Path'),
          getValue: () => '',
          render: (ingress: Ingress) => <RulesDisplay ingress={ingress} />,
        },
        'age',
      ]}
    />
  );
}
