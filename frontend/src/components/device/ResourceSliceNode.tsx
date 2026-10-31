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
import type { ResourceSliceDevice, ResourceSliceNodeAccess } from '../../lib/k8s/resourceSlice';
import type ResourceSlice from '../../lib/k8s/resourceSlice';
import Link from '../common/Link';
import { getDeviceNodeAccess } from './resourceSliceDevice';

function NodeAccess(props: {
  access?: ResourceSliceNodeAccess;
  nodeName?: string;
  cluster?: string;
}) {
  const { access, nodeName, cluster } = props;
  const { t } = useTranslation(['translation']);

  switch (access) {
    case 'node':
      return (
        <Link routeName="node" params={{ name: nodeName }} activeCluster={cluster}>
          {nodeName}
        </Link>
      );
    case 'nodeSelector':
      return <>{t('translation|Selected nodes')}</>;
    case 'allNodes':
      return <>{t('translation|All nodes')}</>;
    case 'perDevice':
      return <>{t('translation|Set per device')}</>;
    default:
      return null;
  }
}

export function ResourceSliceDeviceNode({
  slice,
  device,
}: {
  slice: ResourceSlice;
  device: ResourceSliceDevice;
}) {
  return (
    <NodeAccess
      access={getDeviceNodeAccess(device)}
      nodeName={device.nodeName}
      cluster={slice.cluster}
    />
  );
}

export default function ResourceSliceNode({ slice }: { slice: ResourceSlice }) {
  return (
    <NodeAccess access={slice.nodeAccess} nodeName={slice.spec.nodeName} cluster={slice.cluster} />
  );
}
