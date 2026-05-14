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
import { useParams } from 'react-router-dom';
import { kubeClassFromGenericResourceRef } from '../../lib/k8s/apiResourceKubeClass';
import type { GenericResourceRef } from '../../lib/k8s/genericResourceRef';
import { parseGenericResourceRef, serializeGenericResourceRef } from '../../lib/k8s/genericResourceRef';
import { createRouteURL } from '../../lib/router/createRouteURL';
import Empty from '../common/EmptyContent';
import Loader from '../common/Loader';
import ObjectEventList from '../common/ObjectEventList';
import { ConditionsTable, MainInfoSection, PageGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import DetailsViewSection from '../DetailsViewSection';

function GenericResourceDetailsBody(props: {
  resourceRef: GenericResourceRef;
  name: string;
  namespace?: string;
}) {
  const { t } = useTranslation(['translation', 'glossary']);
  const { resourceRef: ref, name, namespace } = props;

  const kubeClass = React.useMemo(() => kubeClassFromGenericResourceRef(ref), [ref]);
  const [item, error] = kubeClass.useGet(name, namespace);

  const listLink = createRouteURL('genericResourceList', {
    resourceId: serializeGenericResourceRef(ref),
  });

  if (!item && !error) {
    return <Loader title={t('translation|Loading')} />;
  }

  if (!!error || !item) {
    return (
      <Empty color="error">
        {t('translation|Error loading resource: {{message}}', { message: error?.message ?? '' })}
      </Empty>
    );
  }

  return (
    <PageGrid>
      <MainInfoSection
        resource={item}
        title={`${ref.kind}: ${name}`}
        backLink={listLink}
        extraInfo={[
          {
            name: t('translation|API version'),
            value: ref.apiVersion,
          },
          {
            name: t('translation|Resource'),
            value: ref.pluralName,
          },
        ]}
      />
      {item.jsonData.status?.conditions && (
        <SectionBox>
          <ConditionsTable resource={item.jsonData} showLastUpdate={false} />
        </SectionBox>
      )}
      <DetailsViewSection resource={item} />
      <ObjectEventList object={item} />
    </PageGrid>
  );
}

export default function GenericResourceDetails() {
  const { t } = useTranslation(['translation']);
  const { resourceId = '', namespace: nsParam = '', name = '' } = useParams<{
    resourceId: string;
    namespace: string;
    name: string;
  }>();

  const ref = React.useMemo(() => parseGenericResourceRef(resourceId), [resourceId]);
  const namespace = nsParam === '-' ? undefined : nsParam;

  if (!ref) {
    return (
      <Empty color="error">
        {t('translation|Invalid or unknown resource type.')}
      </Empty>
    );
  }

  return <GenericResourceDetailsBody resourceRef={ref} name={name} namespace={namespace} />;
}
