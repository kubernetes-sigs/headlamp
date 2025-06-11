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

import { JSONPath } from 'jsonpath-plus';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import CustomResourceDefinition, { KubeCRD } from '../../lib/k8s/crd';
import { localeDate } from '../../lib/util';
import Empty from '../common/EmptyContent';
import { HoverInfoLabel } from '../common/Label';
import Link from '../common/Link';
import Loader from '../common/Loader';
import { NameValueTableRow } from '../common/NameValueTable';
import ObjectEventList from '../common/ObjectEventList';
import { ConditionsTable, MainInfoSection, PageGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import DetailsViewSection from '../DetailsViewSection';

export default function CustomResourceDetailsFromURL() {
  const params = useParams<CustomResourceDetailsProps>();

  return <CustomResourceDetails {...params} />;
}

export interface CustomResourceDetailsProps {
  crd: string;
  crName: string;
  namespace: string;
  cluster?: string;
}

export function CustomResourceDetails({
  crd: crdName,
  crName,
  namespace: ns,
  cluster,
}: CustomResourceDetailsProps) {
  const { t } = useTranslation('glossary');
  const [crd, error] = CustomResourceDefinition.useGet(crdName, undefined, { cluster });

  const namespace = ns === '-' ? undefined : ns;

  return !crd ? (
    !!error ? (
      <Empty color="error">
        {t(
          'translation|Error getting custom resource definition {{ crdName }}: {{ errorMessage }}',
          {
            crdName,
            errorMessage: error.message,
          }
        )}
      </Empty>
    ) : (
      <Loader title={t('translation|Loading custom resource details')} />
    )
  ) : (
    <CustomResourceDetailsRenderer
      crd={crd}
      crName={crName}
      namespace={namespace}
      cluster={cluster}
    />
  );
}

type AdditionalPrinterColumns = KubeCRD['spec']['versions'][0]['additionalPrinterColumns'];

function getExtraColumns(crd: CustomResourceDefinition, apiVersion: string) {
  const version = (crd.jsonData as KubeCRD).spec.versions.find(
    version => version.name === apiVersion
  );
  return version?.additionalPrinterColumns;
}

function getExtraInfo(extraInfoSpec: AdditionalPrinterColumns, item: KubeCRD) {
  const extraInfo: NameValueTableRow[] = [];
  extraInfoSpec.forEach(spec => {
    // Skip creation date because we already show it by default
    if (spec.jsonPath === '.metadata.creationTimestamp') {
      return;
    }

    let value: string | undefined;
    try {
      // Extract the value from the json item
      value = JSONPath({ path: '$' + spec.jsonPath, json: item });
    } catch (err) {
      console.error(`Failed to get value from JSONPath ${spec.jsonPath} on CR item ${item}`);
      return;
    }

    if (spec.type === 'date' && !!value) {
      value = localeDate(new Date(value));
    } else {
      // Make sure the value will be represented in string form (to account for
      // e.g. cases where we may get an array).
      value = value?.toString();
    }

    const desc = spec.description;

    extraInfo.push({
      name: spec.name,
      value: !!desc ? <HoverInfoLabel label={value || ''} hoverInfo={desc} /> : value,
      hide: value === '' || value === undefined,
    });
  });

  return extraInfo;
}

export interface CustomResourceDetailsRendererProps {
  crd: CustomResourceDefinition;
  crName: string;
  namespace?: string;
  cluster?: string;
}

function CustomResourceDetailsRenderer(props: CustomResourceDetailsRendererProps) {
  const { crd, crName, namespace, cluster } = props;

  const { t } = useTranslation('glossary');

  const CRClass = React.useMemo(() => crd.makeCRClass(), [crd]);
  const [item, error] = CRClass.useGet(crName, namespace, { cluster });

  const apiVersion = item?.jsonData.apiVersion?.split('/')[1] || '';
  const extraColumns: AdditionalPrinterColumns = getExtraColumns(crd, apiVersion) || [];

  return !item ? (
    !!error ? (
      <Empty color="error">
        {t('translation|Error getting custom resource {{ crName }}: {{ errorMessage }}', {
          crName,
          errorMessage: error.message,
        })}
      </Empty>
    ) : (
      <Loader title={t('translation|Loading custom resource details')} />
    )
  ) : (
    <PageGrid>
      <MainInfoSection
        resource={item}
        extraInfo={[
          {
            name: t('glossary|Definition'),
            value: (
              <Link
                routeName="crd"
                params={{
                  name: crd.metadata.name,
                }}
                activeCluster={crd.cluster}
              >
                {crd.metadata.name}
              </Link>
            ),
          },
          ...getExtraInfo(extraColumns, item!.jsonData as KubeCRD),
        ]}
        backLink=""
      />
      {item!.jsonData.status?.conditions && (
        <SectionBox>
          <ConditionsTable resource={item.jsonData} showLastUpdate={false} />
        </SectionBox>
      )}
      <DetailsViewSection resource={item} />
      {item && <ObjectEventList object={item} />}
    </PageGrid>
  );
}
