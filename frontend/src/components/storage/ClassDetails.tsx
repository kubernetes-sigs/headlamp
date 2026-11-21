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

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { matchExpressionSimplifier } from '../../lib/k8s';
import StorageClass, { KubeStorageClass } from '../../lib/k8s/storageClass';
import { DetailsGrid, MetadataDictGrid, metadataStyles } from '../common/Resource';

function AllowedTopologies(props: { terms: NonNullable<KubeStorageClass['allowedTopologies']> }) {
  // Terms are ORed. The expressions within a term are ANDed.
  return (
    <Stack spacing={1}>
      {props.terms.map((term, index) => (
        <div key={index}>
          {(
            matchExpressionSimplifier(
              term.matchLabelExpressions?.map(expression => ({ ...expression, operator: 'In' }))
            ) || []
          ).map(expression => (
            <Typography
              key={expression}
              display="inline-block"
              sx={theme => ({ ...metadataStyles(theme), whiteSpace: 'normal' })}
            >
              {expression}
            </Typography>
          ))}
        </div>
      ))}
    </Stack>
  );
}

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
            name: t('Allowed Topologies'),
            value: <AllowedTopologies terms={item.allowedTopologies ?? []} />,
            hide: !item.allowedTopologies?.length,
          },
          {
            name: t('Default'),
            value: item.isDefault ? t('translation|Yes') : t('translation|No'),
          },
          {
            name: t('Allow Volume Expansion'),
            value: item.allowVolumeExpansion ? t('translation|Yes') : t('translation|No'),
            hide: item.allowVolumeExpansion === undefined,
          },
          {
            name: t('Parameters'),
            value: <MetadataDictGrid dict={item.parameters ?? {}} />,
            hide: _.isEmpty(item.parameters),
          },
          {
            name: t('Mount Options'),
            value: item.mountOptions?.join(', '),
            hide: !item.mountOptions?.length,
          },
        ]
      }
    />
  );
}
