/*
 * Copyright 2026 The Kubernetes Authors
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
import CRD from '../../lib/k8s/crd';
import IPAddress, { IPAddressParentReference } from '../../lib/k8s/ipAddress';
import { ResourceClasses } from '../../lib/k8s/resourceClasses';
import { getRoute } from '../../lib/router/getRoute';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import { NameValueTable } from '../common/SimpleTable';

function CustomParentName({
  crdName,
  name,
  namespace,
  cluster,
}: {
  crdName: string;
  name: string;
  namespace?: string;
  cluster: string;
}) {
  const [crd] = CRD.useGet(crdName, undefined, { cluster });
  const scope = namespace ? 'Namespaced' : 'Cluster';

  if (crd?.spec?.scope !== scope || !crd.getMainAPIGroupOrNull()) {
    return name;
  }

  return (
    <Link
      routeName="customresource"
      params={{ crd: crdName, crName: name, namespace: namespace || '-' }}
      activeCluster={cluster}
    >
      {name}
    </Link>
  );
}

function ParentName({ parent, cluster }: { parent: IPAddressParentReference; cluster: string }) {
  const { group, resource, namespace, name } = parent;
  const parentClass = Object.values(ResourceClasses).find(
    cls =>
      cls.apiName === resource &&
      (cls.apiGroupName ?? '') === (group ?? '') &&
      cls.isNamespaced === !!namespace
  );
  const route = parentClass?.detailsRoute;

  if (route && getRoute(route)) {
    return (
      <Link routeName={route} params={{ name, namespace }} activeCluster={cluster}>
        {name}
      </Link>
    );
  }

  return group && resource && !parentClass ? (
    <CustomParentName
      crdName={`${resource}.${group}`}
      name={name}
      namespace={namespace}
      cluster={cluster}
    />
  ) : (
    name
  );
}

function ParentReference({
  parent,
  cluster,
}: {
  parent: IPAddressParentReference;
  cluster: string;
}) {
  const { t } = useTranslation(['glossary', 'translation']);
  const { group, resource, namespace, name } = parent;

  return (
    <NameValueTable
      rows={[
        { name: t('translation|Group'), value: group || t('Core API Group') },
        { name: t('Resource'), value: resource },
        { name: t('Namespace'), value: namespace || '-' },
        {
          name: t('translation|Name'),
          value: name ? <ParentName parent={parent} cluster={cluster} /> : '-',
        },
      ]}
    />
  );
}

export default function IPAddressDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation('glossary');

  return (
    <DetailsGrid
      resourceType={IPAddress}
      name={name}
      cluster={cluster}
      extraSections={item =>
        item?.parentRef
          ? [
              {
                id: 'headlamp.ipaddress-parent-reference',
                section: (
                  <SectionBox title={t('Parent Reference')}>
                    <ParentReference parent={item.parentRef} cluster={item.cluster} />
                  </SectionBox>
                ),
              },
            ]
          : []
      }
    />
  );
}
