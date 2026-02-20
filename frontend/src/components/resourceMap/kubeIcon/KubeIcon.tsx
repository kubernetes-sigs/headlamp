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

import Box from '@mui/material/Box';
import { alpha } from '@mui/system/colorManipulator';
import { useTypedSelector } from '../../../redux/hooks';
import CRoleIcon from './img/c-role.svg?react';
import CmIcon from './img/cm.svg?react';
import CrbIcon from './img/crb.svg?react';
import CrdIcon from './img/crd.svg?react';
import CronjobIcon from './img/cronjob.svg?react';
import DeployIcon from './img/deploy.svg?react';
import DsIcon from './img/ds.svg?react';
import EpIcon from './img/ep.svg?react';
import GroupIcon from './img/group.svg?react';
import HpaIcon from './img/hpa.svg?react';
import IngIcon from './img/ing.svg?react';
import JobIcon from './img/job.svg?react';
import LimitsIcon from './img/limits.svg?react';
import NetpolIcon from './img/netpol.svg?react';
import NsIcon from './img/ns.svg?react';
import PodIcon from './img/pod.svg?react';
import PspIcon from './img/psp.svg?react';
import PvIcon from './img/pv.svg?react';
import PvcIcon from './img/pvc.svg?react';
import QuotaIcon from './img/quota.svg?react';
import RbIcon from './img/rb.svg?react';
import RoleIcon from './img/role.svg?react';
import RsIcon from './img/rs.svg?react';
import SaIcon from './img/sa.svg?react';
import ScIcon from './img/sc.svg?react';
import SecretIcon from './img/secret.svg?react';
import StsIcon from './img/sts.svg?react';
import SvcIcon from './img/svc.svg?react';
import UserIcon from './img/user.svg?react';
import VolIcon from './img/vol.svg?react';

const kindToIcon: Record<string, React.FC<any>> = {
  // core group
  Namespace: NsIcon,
  Pod: PodIcon,
  Service: SvcIcon,
  Endpoints: EpIcon,
  Endpoint: EpIcon,
  EndpointSlice: EpIcon,
  ConfigMap: CmIcon,
  Secret: SecretIcon,
  PersistentVolume: PvIcon,
  PodSecurityPolicy: PspIcon,
  PersistentVolumeClaim: PvcIcon,
  ServiceAccount: SaIcon,
  ResourceQuota: QuotaIcon,
  LimitRange: LimitsIcon,
  Volume: VolIcon,
  User: UserIcon,
  Group: GroupIcon,

  // apps
  'apps/Deployment': DeployIcon,
  'apps/ReplicaSet': RsIcon,
  'apps/StatefulSet': StsIcon,
  'apps/DaemonSet': DsIcon,

  // batch
  'batch/Job': JobIcon,
  'batch/CronJob': CronjobIcon,

  // rbac
  'rbac.authorization.k8s.io/Role': RoleIcon,
  'rbac.authorization.k8s.io/RoleBinding': RbIcon,
  'rbac.authorization.k8s.io/ClusterRole': CRoleIcon,
  'rbac.authorization.k8s.io/ClusterRoleBinding': CrbIcon,

  // networking
  'networking.k8s.io/Ingress': IngIcon,
  'networking.k8s.io/NetworkPolicy': NetpolIcon,

  // autoscaling
  'autoscaling/HorizontalPodAutoscaler': HpaIcon,

  // storage
  'storage.k8s.io/StorageClass': ScIcon,

  // apiextensions
  'apiextensions.k8s.io/CustomResourceDefinition': CrdIcon,
} as const;

const kindGroups = {
  workloads: new Set([
    'Pod',
    'Deployment',
    'ReplicaSet',
    'StatefulSet',
    'DaemonSet',
    'ReplicaSet',
    'Job',
    'CronJob',
  ]),
  storage: new Set(['PersistentVolumeClaim']),
  network: new Set([
    'Service',
    'Endpoints',
    'Endpoint',
    'EndpointSlice',
    'Ingress',
    'IngressClass',
    'NetworkPolicy',
  ]),
  security: new Set(['ServiceAccount', 'Role', 'RoleBinding', 'ClusterRole', 'ClusterRoleBinding']),
  configuration: new Set([
    'ConfigMap',
    'Secret',
    'HorizontalPodAutoscaler',
    'MutatingWebhookConfiguration',
    'ValidatingWebhookConfiguration',
  ]),
} as const;

const getKindGroup = (kind: string) =>
  Object.entries(kindGroups).find(([, set]) => set.has(kind))?.[0] as keyof typeof kindGroups;

const lightness = '67.85%';
const chroma = '0.12';

const kindGroupColors = {
  workloads: `oklch(${lightness} ${chroma} 182.18)`,
  storage: `oklch(${lightness} ${chroma} 46.47)`,
  network: `oklch(${lightness} ${chroma} 225.16)`,
  security: `oklch(${lightness} ${chroma} 275.16)`,
  configuration: `oklch(${lightness} ${chroma} 320.03)`,
  other: `oklch(${lightness} 0 215.25)`,
} as const;

const getKindColor = (kind: string) => kindGroupColors[getKindGroup(kind) ?? 'other'];
export const getKindGroupColor = (group: keyof typeof kindGroupColors) =>
  kindGroupColors[group] ?? kindGroupColors.other;

/**
 * Icon for the Kube resource
 * Color is based on the resource category (workload,storage, etc)
 *
 * Icons are taken from
 * https://github.com/kubernetes/community/tree/master/icons
 *
 * @param params.kind - Resource kind
 * @param params.apiGroup - Resource API group
 * @param params.width - width in css units
 * @param params.height - width in css units
 * @returns
 */
export function KubeIcon({
  kind,
  apiGroup,
  width,
  height,
}: {
  kind: string;
  apiGroup?: string;
  width?: string;
  height?: string;
}) {
  const pluginDefinedIcons = useTypedSelector(state => state.graphView.kindIcons);

  const apiGroupKey = apiGroup ? `${apiGroup}/${kind}` : null;

  const pluginIcon = (apiGroupKey && pluginDefinedIcons[apiGroupKey]) || pluginDefinedIcons[kind];

  const IconComponent =
    (apiGroupKey && kindToIcon[apiGroupKey as keyof typeof kindToIcon]) ||
    kindToIcon[kind as keyof typeof kindToIcon] ||
    kindToIcon['Pod'];

  const icon = pluginIcon?.icon ?? (
    <IconComponent style={{ scale: '1.1', width: '100%', height: '100%' }} />
  );
  const color = pluginIcon?.color ?? getKindColor(kind);

  return (
    <Box
      sx={{
        color,
        flexShrink: 0,
        borderRadius: '50%',
        width: width ?? '100%',
        height: height ?? '100%',
        background: color.includes('oklch') ? color.replace(')', ' / 12%)') : alpha(color, 0.12),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        'path[id=path3054-2-9]': {
          fill: 'none !important',
        },
      }}
    >
      {icon}
    </Box>
  );
}
