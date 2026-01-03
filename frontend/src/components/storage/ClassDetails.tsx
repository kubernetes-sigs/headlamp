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
import StorageClass from '../../lib/k8s/storageClass';
import { DetailsGrid } from '../common/Resource';

export default function StorageClassDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation('glossary');

  return (
    <DetailsGrid
      resourceType={StorageClass}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Default'),
            value: item.isDefault ? t('translation|Yes') : t('translation|No'),
          },
          {
            name: t('Provisioner'),
            value: item.provisioner,
          },
          {
            name: t('Reclaim Policy'),
            value: item.reclaimPolicy,
          },
          {
            name: t('Binding Mode'),
            value: item.volumeBindingMode,
          },
          {
            name: t('Allow Volume Expansion'),
            value: item.allowVolumeExpansion ? t('translation|Yes') : t('translation|No'),
            hide: item.allowVolumeExpansion === undefined,
          },
          {
            name: t('Parameters'),
            value: item.parameters ? (
              <React.Fragment>
                {Object.entries(item.parameters).map(([key, value], index) => (
                  <div key={`${key}-${index}`}>
                    {key}: {value}
                  </div>
                ))}
              </React.Fragment>
            ) : (
              t('translation|None')
            ),
            hide: !item.parameters || Object.keys(item.parameters).length === 0,
          },
          {
            name: t('Mount Options'),
            value: item.mountOptions ? item.mountOptions.join(', ') : t('translation|None'),
            hide: !item.mountOptions || item.mountOptions.length === 0,
          },
          {
            name: t('Allowed Topologies'),
            value: item.allowedTopologies ? (
              <React.Fragment>
                {item.allowedTopologies.map((topology, topologyIndex) => (
                  <div key={`topology-${topologyIndex}`}>
                    {topology.matchLabelExpressions?.map((expr, exprIndex) => (
                      <div key={`expr-${exprIndex}`}>
                        {expr.key}: {expr.values.join(', ')}
                      </div>
                    ))}
                  </div>
                ))}
              </React.Fragment>
            ) : (
              t('translation|None')
            ),
            hide: !item.allowedTopologies || item.allowedTopologies.length === 0,
          },
        ]
      }
    />
  );
}
