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

import React, { ExoticComponent, ReactNode } from 'react';
import { generatePath, useHistory } from 'react-router';
import NotFoundComponent from '../components/404';
import AuthToken from '../components/account/Auth';
import AddCluster from '../components/App/CreateCluster/AddCluster';
import Home from '../components/App/Home';
import NotificationList from '../components/App/Notifications/List';
import PluginSettings from '../components/App/PluginSettings';
import PluginSettingsDetails from '../components/App/PluginSettings/PluginSettingsDetails';
import Settings from '../components/App/Settings';
import SettingsCluster from '../components/App/Settings/SettingsCluster';
import SettingsClusters from '../components/App/Settings/SettingsClusters';
import AuthChooser from '../components/authchooser';
import KubeConfigLoader from '../components/cluster/KubeConfigLoader';
import Overview from '../components/cluster/Overview';
import { PageGrid } from '../components/common/Resource/Resource';
import ConfigDetails from '../components/configmap/Details';
import ConfigMapList from '../components/configmap/List';
import CustomResourceDetails from '../components/crd/CustomResourceDetails';
import { CrInstanceList } from '../components/crd/CustomResourceInstancesList';
import CustomResourceList from '../components/crd/CustomResourceList';
import CustomResourceDefinitionDetails from '../components/crd/Details';
import CustomResourceDefinitionList from '../components/crd/List';
import CronJobDetails from '../components/cronjob/Details';
import CronJobList from '../components/cronjob/List';
import DaemonSetList from '../components/daemonset/List';
import DeploymentsList from '../components/deployments/List';
import EndpointDetails from '../components/endpoints/Details';
import EndpointList from '../components/endpoints/List';
import BackendTLSPolicyDetails from '../components/gateway/BackendTLSPolicyDetails';
import BackendTLSPolicyList from '../components/gateway/BackendTLSPolicyList';
import GatewayClassDetails from '../components/gateway/ClassDetails';
import GatewayClassList from '../components/gateway/ClassList';
import GatewayDetails from '../components/gateway/GatewayDetails';
import GatewayList from '../components/gateway/GatewayList';
import GRPCRouteDetails from '../components/gateway/GRPCRouteDetails';
import GRPCRouteList from '../components/gateway/GRPCRouteList';
import HTTPRouteDetails from '../components/gateway/HTTPRouteDetails';
import HTTPRouteList from '../components/gateway/HTTPRouteList';
import ReferenceGrantDetails from '../components/gateway/ReferenceGrantDetails';
import ReferenceGrantList from '../components/gateway/ReferenceGrantList';
import HpaDetails from '../components/horizontalPodAutoscaler/Details';
import HpaList from '../components/horizontalPodAutoscaler/List';
import IngressClassDetails from '../components/ingress/ClassDetails';
import IngressClassList from '../components/ingress/ClassList';
import IngressDetails from '../components/ingress/Details';
import IngressList from '../components/ingress/List';
import JobsList from '../components/job/List';
import { LeaseDetails } from '../components/lease/Details';
import { LeaseList } from '../components/lease/List';
import { LimitRangeDetails } from '../components/limitRange/Details';
import { LimitRangeList } from '../components/limitRange/List';
import NamespaceDetails from '../components/namespace/Details';
import NamespacesList from '../components/namespace/List';
import { NetworkPolicyDetails } from '../components/networkpolicy/Details';
import { NetworkPolicyList } from '../components/networkpolicy/List';
import NodeDetails from '../components/node/Details';
import NodeList from '../components/node/List';
import OIDCAuth from '../components/oidcauth';
import PodDetails from '../components/pod/Details';
import PodList from '../components/pod/List';
import PDBDetails from '../components/podDisruptionBudget/Details';
import PDBList from '../components/podDisruptionBudget/List';
import PortForwardingList from '../components/portforward';
import PriorityClassDetails from '../components/priorityClass/Details';
import PriorityClassList from '../components/priorityClass/List';
import ReplicaSetList from '../components/replicaset/List';
import ResourceQuotaDetails from '../components/resourceQuota/Details';
import ResourceQuotaList from '../components/resourceQuota/List';
import RoleBindingDetails from '../components/role/BindingDetails';
import RoleBindingList from '../components/role/BindingList';
import RoleDetails from '../components/role/Details';
import RoleList from '../components/role/List';
import { RuntimeClassDetails } from '../components/runtimeClass/Details';
import { RuntimeClassList } from '../components/runtimeClass/List';
import SecretDetails from '../components/secret/Details';
import SecretList from '../components/secret/List';
import ServiceDetails from '../components/service/Details';
import ServiceList from '../components/service/List';
import ServiceAccountDetails from '../components/serviceaccount/Details';
import ServiceAccountList from '../components/serviceaccount/List';
import { DefaultSidebars } from '../components/Sidebar';
import StatefulSetList from '../components/statefulset/List';
import PersistentVolumeClaimDetails from '../components/storage/ClaimDetails';
import PersistentVolumeClaimList from '../components/storage/ClaimList';
import StorageClassDetails from '../components/storage/ClassDetails';
import StorageClassList from '../components/storage/ClassList';
import PersistentVolumeDetails from '../components/storage/VolumeDetails';
import PersistentVolumeList from '../components/storage/VolumeList';
import VpaDetails from '../components/verticalPodAutoscaler/Details';
import VpaList from '../components/verticalPodAutoscaler/List';
import MutatingWebhookConfigurationDetails from '../components/webhookconfiguration/MutatingWebhookConfigDetails';
import MutatingWebhookConfigList from '../components/webhookconfiguration/MutatingWebhookConfigList';
import ValidatingWebhookConfigurationDetails from '../components/webhookconfiguration/ValidatingWebhookConfigDetails';
import ValidatingWebhookConfigurationList from '../components/webhookconfiguration/ValidatingWebhookConfigList';
import WorkloadDetails from '../components/workload/Details';
import WorkloadOverview from '../components/workload/Overview';
import { isElectron } from '../helpers/isElectron';
import LocaleSelect from '../i18n/LocaleSelect/LocaleSelect';
import store from '../redux/stores/store';
import { getClusterPathParam } from './cluster';
import { useCluster } from './k8s';
import DaemonSet from './k8s/daemonSet';
import Deployment from './k8s/deployment';
import Job from './k8s/job';
import ReplicaSet from './k8s/replicaSet';
import StatefulSet from './k8s/statefulSet';
import { getClusterPrefixedPath } from './util';

export interface Route {
  /** Any valid URL path or array of paths that path-to-regexp@^1.7.0 understands. */
  path: string;
  /** When true, will only match if the path matches the location.pathname exactly. */
  exact?: boolean;
  /** Human readable name. Capitalized and short. */
  name?: string;
  /**
   * In case this route does *not* need a cluster prefix and context.
   * @deprecated please use useClusterURL.
   */
  noCluster?: boolean;
  /**
   * Should URL have the cluster prefix? (default=true)
   */
  useClusterURL?: boolean;
  /** This route does not require Authentication. */
  noAuthRequired?: boolean;
  /** The sidebar entry this Route should enable, or null if it shouldn't enable any. If an object is passed with item and sidebar, it will try to enable the given sidebar and the given item. */
  sidebar: string | null | { item: string | null; sidebar: string | DefaultSidebars };
  /** Shown component for this route. */
  component: ExoticComponent<{}> | (() => ReactNode);
  /** Hide the appbar at the top. */
  hideAppBar?: boolean;
  /** Whether the route should be disabled (not registered). */
  disabled?: boolean;
  /** Render route for full width */
  isFullWidth?: boolean;
}

const LazyGraphView = React.lazy(() =>
  import('../components/resourceMap/GraphView').then(it => ({ default: it.GraphView }))
);

const defaultRoutes: {
  [routeName: string]: Route;
} = {
  cluster: {
    path: '/',
    exact: true,
    name: 'Cluster',
    sidebar: 'cluster',
    component: () => <Overview />,
  },
  chooser: {
    path: '/',
    exact: true,
    name: 'Choose a cluster',
    sidebar: {
      item: 'home',
      sidebar: DefaultSidebars.HOME,
    },
    useClusterURL: false,
    noAuthRequired: true,
    component: () => <Home />,
  },
  advancedSearch: {
    path: '/advanced-search',
    exact: true,
    name: 'Advanced Search',
    sidebar: 'advancedSearch',
    component: React.lazy(() =>
      import('../components/advancedSearch/AdvancedSearch').then(it => ({
        default: it.AdvancedSearch,
      }))
    ),
  },
  namespaces: {
    path: '/namespaces',
    name: 'Namespaces',
    exact: true,
    sidebar: 'namespaces',
    component: () => <NamespacesList />,
  },
  namespace: {
    path: '/namespaces/:name',
    sidebar: 'namespaces',
    component: () => <NamespaceDetails />,
  },
  nodes: {
    path: '/nodes',
    name: 'Nodes',
    exact: true,
    sidebar: 'nodes',
    component: () => <NodeList />,
  },
  node: {
    path: '/nodes/:name',
    sidebar: 'nodes',
    component: () => <NodeDetails />,
  },
  storageClasses: {
    path: '/storage/classes',
    exact: true,
    sidebar: 'storageClasses',
    name: 'Storage Classes',
    component: () => <StorageClassList />,
  },
  storageClass: {
    path: '/storage/classes/:name',
    name: 'Storage Classes',
    sidebar: 'storageClasses',
    component: () => <StorageClassDetails />,
  },
  persistentVolumes: {
    path: '/storage/persistentvolumes',
    exact: true,
    sidebar: 'persistentVolumes',
    name: 'Persistent Volumes',
    component: () => <PersistentVolumeList />,
  },
  persistentVolume: {
    path: '/storage/persistentvolumes/:name',
    exact: true,
    sidebar: 'persistentVolumes',
    name: 'Persistent Volume',
    component: () => <PersistentVolumeDetails />,
  },
  persistentVolumeClaims: {
    path: '/storage/persistentvolumeclaims',
    exact: true,
    sidebar: 'persistentVolumeClaims',
    name: 'Persistent Volume Claims',
    component: () => <PersistentVolumeClaimList />,
  },
  persistentVolumeClaim: {
    path: '/storage/persistentvolumeclaims/:namespace/:name',
    sidebar: 'persistentVolumeClaims',
    exact: true,
    component: () => <PersistentVolumeClaimDetails />,
  },
  workloads: {
    path: '/workloads',
    exact: true,
    name: 'Workloads',
    sidebar: 'workloads',
    component: () => <WorkloadOverview />,
  },
  DaemonSet: {
    path: '/daemonsets/:namespace/:name',
    exact: true,
    sidebar: 'DaemonSets',
    component: () => <WorkloadDetails workloadKind={DaemonSet} />,
  },
  StatefulSet: {
    path: '/statefulsets/:namespace/:name',
    exact: true,
    sidebar: 'StatefulSets',
    component: () => <WorkloadDetails workloadKind={StatefulSet} />,
  },
  Deployment: {
    path: '/deployments/:namespace/:name',
    exact: true,
    sidebar: 'Deployments',
    component: () => <WorkloadDetails workloadKind={Deployment} />,
  },
  Job: {
    path: '/jobs/:namespace/:name',
    exact: true,
    sidebar: 'Jobs',
    component: () => <WorkloadDetails workloadKind={Job} />,
  },
  CronJob: {
    path: '/cronjobs/:namespace/:name',
    exact: true,
    sidebar: 'CronJobs',
    component: () => <CronJobDetails />,
  },
  Pods: {
    path: '/pods',
    exact: true,
    name: 'Pods',
    sidebar: 'Pods',
    component: () => <PodList />,
  },
  Pod: {
    path: '/pods/:namespace/:name',
    exact: true,
    sidebar: 'Pods',
    component: () => <PodDetails />,
  },
  services: {
    path: '/services',
    exact: true,
    name: 'Services',
    sidebar: 'services',
    component: () => <ServiceList />,
  },
  service: {
    path: '/services/:namespace/:name',
    exact: true,
    sidebar: 'services',
    component: () => <ServiceDetails />,
  },
  endpoints: {
    path: '/endpoints',
    exact: true,
    name: 'Endpoints',
    sidebar: 'endpoints',
    component: () => <EndpointList />,
  },
  endpoint: {
    path: '/endpoints/:namespace/:name',
    exact: true,
    sidebar: 'endpoints',
    component: () => <EndpointDetails />,
  },
  ingresses: {
    path: '/ingresses',
    exact: true,
    name: 'Ingresses',
    sidebar: 'ingresses',
    component: () => <IngressList />,
  },
  ingress: {
    path: '/ingresses/:namespace/:name',
    exact: true,
    sidebar: 'ingresses',
    component: () => <IngressDetails />,
  },
  ingressclasses: {
    path: '/ingressclasses',
    exact: true,
    name: 'IngressClasses',
    sidebar: 'ingressclasses',
    component: () => <IngressClassList />,
  },
  ingressclass: {
    path: '/ingressclasses/:name',
    exact: true,
    sidebar: 'ingressclasses',
    component: () => <IngressClassDetails />,
  },
  networkPolicies: {
    path: '/networkpolicies',
    exact: true,
    sidebar: 'NetworkPolicies',
    component: () => <NetworkPolicyList />,
  },
  networkPolicy: {
    path: '/networkpolicies/:namespace/:name',
    exact: true,
    sidebar: 'NetworkPolicies',
    component: () => <NetworkPolicyDetails />,
  },
  gateways: {
    // fix magic name gateway
    path: '/gateways',
    exact: true,
    name: 'Gateways',
    sidebar: 'gateways',
    component: () => <GatewayList />,
  },
  gateway: {
    // fix magic name gateway
    path: '/gateways/:namespace/:name',
    exact: true,
    name: 'Gateways',
    sidebar: 'gateways',
    component: () => <GatewayDetails />,
  },
  httproutes: {
    path: '/httproutes',
    exact: true,
    name: 'HttpRoutes',
    sidebar: 'httproutes',
    component: () => <HTTPRouteList />,
  },
  httproute: {
    path: '/httproutes/:namespace/:name',
    exact: true,
    name: 'HttpRoutes',
    sidebar: 'httproutes',
    component: () => <HTTPRouteDetails />,
  },
  grpcroutes: {
    path: '/grpcroutes',
    exact: true,
    name: 'GRPCRoutes',
    sidebar: 'grpcroutes',
    component: () => <GRPCRouteList />,
  },
  grpcroute: {
    path: '/grpcroutes/:namespace/:name',
    exact: true,
    name: 'GRPCRoutes',
    sidebar: 'grpcroutes',
    component: () => <GRPCRouteDetails />,
  },
  gatewayclasses: {
    path: '/gatewayclasses',
    exact: true,
    name: 'GatewayClasses',
    sidebar: 'gatewayclasses',
    component: () => <GatewayClassList />,
  },
  gatewayclass: {
    path: '/gatewayclasses/:name',
    exact: true,
    sidebar: 'gatewayclasses',
    component: () => <GatewayClassDetails />,
  },
  referencegrants: {
    path: '/referencegrants',
    exact: true,
    name: 'ReferenceGrants',
    sidebar: 'referencegrants',
    component: () => <ReferenceGrantList />,
  },
  referencegrant: {
    path: '/referencegrant/:namespace/:name',
    exact: true,
    name: 'ReferenceGrants',
    sidebar: 'referencegrants',
    component: () => <ReferenceGrantDetails />,
  },
  backendtlspolicies: {
    path: '/backendtlspolicies',
    exact: true,
    name: 'BackendTLSPolicies',
    sidebar: 'backendtlspolicies',
    component: () => <BackendTLSPolicyList />,
  },
  backendtlspolicy: {
    path: '/backendtlspolicy/:namespace/:name',
    exact: true,
    name: 'BackendTLSPolicies',
    sidebar: 'backendtlspolicies',
    component: () => <BackendTLSPolicyDetails />,
  },
  DaemonSets: {
    path: '/daemonsets',
    exact: true,
    sidebar: 'DaemonSets',
    name: 'DaemonSets',
    component: () => <DaemonSetList />,
  },
  Jobs: {
    path: '/jobs',
    exact: true,
    sidebar: 'Jobs',
    name: 'Jobs',
    component: () => <JobsList />,
  },
  CronJobs: {
    path: '/cronjobs',
    exact: true,
    sidebar: 'CronJobs',
    name: 'CronJobs',
    component: () => <CronJobList />,
  },
  Deployments: {
    path: '/deployments',
    exact: true,
    sidebar: 'Deployments',
    name: 'Deployments',
    component: () => <DeploymentsList />,
  },
  StatefulSets: {
    path: '/statefulsets',
    exact: true,
    sidebar: 'StatefulSets',
    name: 'StatefulSets',
    component: () => <StatefulSetList />,
  },
  ReplicaSets: {
    path: '/replicasets',
    exact: true,
    name: 'ReplicaSets',
    sidebar: 'ReplicaSets',
    component: () => <ReplicaSetList />,
  },
  ReplicaSet: {
    path: '/replicasets/:namespace/:name',
    exact: true,
    sidebar: 'ReplicaSets',
    component: () => <WorkloadDetails workloadKind={ReplicaSet} />,
  },
  configMaps: {
    path: '/configmaps',
    exact: true,
    name: 'Config Maps',
    sidebar: 'configMaps',
    component: () => <ConfigMapList />,
  },
  configMap: {
    path: '/configmaps/:namespace/:name',
    exact: true,
    sidebar: 'configMaps',
    component: () => <ConfigDetails />,
  },
  serviceAccounts: {
    path: '/serviceaccounts',
    exact: true,
    name: 'Service Accounts',
    sidebar: 'serviceAccounts',
    component: () => <ServiceAccountList />,
  },
  serviceAccount: {
    path: '/serviceaccounts/:namespace/:name',
    exact: true,
    sidebar: 'serviceAccounts',
    component: () => <ServiceAccountDetails />,
  },
  roles: {
    path: '/roles',
    exact: true,
    name: 'Roles',
    sidebar: 'roles',
    component: () => <RoleList />,
  },
  role: {
    path: '/roles/:namespace/:name',
    exact: true,
    sidebar: 'roles',
    component: () => <RoleDetails />,
  },
  clusterrole: {
    path: '/clusterroles/:name',
    exact: true,
    sidebar: 'roles',
    component: () => <RoleDetails />,
  },
  clusterRoles: {
    path: '/roles',
    exact: true,
    sidebar: 'roles',
    component: () => <RoleList />,
  },
  roleBindings: {
    path: '/rolebindings',
    exact: true,
    name: 'Role Bindings',
    sidebar: 'roleBindings',
    component: () => <RoleBindingList />,
  },
  roleBinding: {
    path: '/rolebinding/:namespace/:name',
    exact: true,
    name: 'Role Binding',
    sidebar: 'roleBindings',
    component: () => <RoleBindingDetails />,
  },
  clusterRoleBinding: {
    path: '/clusterrolebinding/:name',
    exact: true,
    name: 'Role Binding',
    sidebar: 'roleBindings',
    component: () => <RoleBindingDetails />,
  },
  clusterRoleBindings: {
    path: '/rolebindings',
    exact: true,
    sidebar: 'roleBindings',
    component: () => <RoleBindingDetails />,
  },
  secrets: {
    path: '/secrets',
    exact: true,
    name: 'Secrets',
    sidebar: 'secrets',
    component: () => <SecretList />,
  },
  secret: {
    path: '/secrets/:namespace/:name',
    exact: true,
    sidebar: 'secrets',
    component: () => <SecretDetails />,
  },
  horizontalPodAutoscalers: {
    path: '/horizontalpodautoscalers',
    exact: true,
    name: 'Horizontal Pod Autoscalers',
    sidebar: 'horizontalPodAutoscalers',
    component: () => <HpaList />,
  },
  horizontalPodAutoscaler: {
    path: '/horizontalpodautoscalers/:namespace/:name',
    exact: true,
    name: 'Horizontal Pod Autoscaler',
    sidebar: 'horizontalPodAutoscalers',
    component: () => <HpaDetails />,
  },
  podDisruptionBudgets: {
    path: '/poddisruptionbudgets',
    exact: true,
    name: 'Pod Disruption Budgets',
    sidebar: 'podDisruptionBudgets',
    component: () => <PDBList />,
  },
  podDisruptionBudget: {
    path: '/poddisruptionbudgets/:namespace/:name',
    exact: true,
    name: 'Pod Disruption Budget',
    sidebar: 'podDisruptionBudgets',
    component: () => <PDBDetails />,
  },
  priorityclasses: {
    path: '/priorityclasses',
    exact: true,
    name: 'Priority Classes',
    sidebar: 'priorityClasses',
    component: () => <PriorityClassList />,
  },
  priorityClass: {
    path: '/priorityclasses/:name',
    exact: true,
    name: 'PriorityClass',
    sidebar: 'priorityClasses',
    component: () => <PriorityClassDetails />,
  },
  resourceQuotas: {
    path: '/resourcequotas',
    exact: true,
    name: 'Resource Quotas',
    sidebar: 'resourceQuotas',
    component: () => <ResourceQuotaList />,
  },
  resourceQuota: {
    path: '/resourcequotas/:namespace/:name',
    exact: true,
    name: 'Resource Quota',
    sidebar: 'resourceQuotas',
    component: () => <ResourceQuotaDetails />,
  },
  leases: {
    path: '/leases',
    exact: true,
    name: 'Leases',
    sidebar: 'leases',
    component: () => <LeaseList />,
  },
  lease: {
    path: '/leases/:namespace/:name',
    exact: true,
    name: 'Lease',
    sidebar: 'leases',
    component: () => <LeaseDetails />,
  },
  runtimeClasses: {
    path: '/runtimeclasses',
    exact: true,
    name: 'Runtime Classes',
    sidebar: 'runtimeClasses',
    component: () => <RuntimeClassList />,
  },
  runtimeClass: {
    path: '/runtimeclasses/:name',
    exact: true,
    name: 'Runtime Class',
    sidebar: 'runtimeClasses',
    component: () => <RuntimeClassDetails />,
  },
  limitRanges: {
    path: '/limitranges',
    exact: true,
    name: 'Limit Ranges',
    sidebar: 'limitRanges',
    component: () => <LimitRangeList />,
  },
  limitRange: {
    path: '/limitranges/:namespace/:name',
    exact: true,
    name: 'Limit Range',
    sidebar: 'limitRanges',
    component: () => <LimitRangeDetails />,
  },
  mutatingWebhookConfigurations: {
    path: '/mutatingwebhookconfigurations',
    exact: true,
    name: 'Mutating Webhook Configurations',
    sidebar: 'mutatingWebhookConfigurations',
    component: () => <MutatingWebhookConfigList />,
  },
  mutatingWebhookConfiguration: {
    path: '/mutatingwebhookconfigurations/:name',
    exact: true,
    name: 'Mutating Webhook Configuration',
    sidebar: 'mutatingWebhookConfigurations',
    component: () => <MutatingWebhookConfigurationDetails />,
  },
  validatingWebhookConfigurations: {
    path: '/validatingwebhookconfigurations',
    exact: true,
    name: 'Validating Webhook Configurations',
    sidebar: 'validatingWebhookConfigurations',
    component: () => <ValidatingWebhookConfigurationList />,
  },
  validatingWebhookConfiguration: {
    path: '/validatingwebhookconfigurations/:name',
    exact: true,
    name: 'Validating Webhook Configuration',
    sidebar: 'validatingWebhookConfigurations',
    component: () => <ValidatingWebhookConfigurationDetails />,
  },
  verticalPodAutoscalers: {
    path: '/verticalpodautoscalers',
    exact: true,
    name: 'Vertical Pod Autoscalers',
    sidebar: 'verticalPodAutoscalers',
    component: () => <VpaList />,
  },
  verticalPodAutoscaler: {
    path: '/verticalpodautoscalers/:namespace/:name',
    exact: true,
    name: 'Vertical Pod Autoscaler',
    sidebar: 'verticalPodAutoscalers',
    component: () => <VpaDetails />,
  },
  token: {
    path: '/token',
    exact: true,
    name: 'Token',
    sidebar: null,
    noAuthRequired: true,
    component: () => <AuthToken />,
  },
  oidcAuth: {
    path: '/auth',
    name: 'OidcAuth',
    sidebar: null,
    noAuthRequired: true,
    component: () => <OIDCAuth />,
  },
  login: {
    path: '/login',
    exact: true,
    name: 'Login',
    sidebar: null,
    noAuthRequired: true,
    component: () => (
      <AuthChooser>
        <LocaleSelect />
      </AuthChooser>
    ),
  },
  crds: {
    path: '/crds',
    exact: true,
    name: 'CRDs',
    sidebar: 'crds',
    component: () => <CustomResourceDefinitionList />,
  },
  crd: {
    path: '/crds/:name',
    exact: true,
    name: 'CRD',
    sidebar: 'crds',
    component: () => <CustomResourceDefinitionDetails />,
  },
  customresource: {
    path: '/customresources/:crd/:namespace/:crName',
    exact: true,
    name: 'Custom Resource',
    sidebar: 'crds',
    component: () => <CustomResourceDetails />,
  },
  customresources: {
    path: '/customresources/:crd',
    exact: true,
    name: 'Custom Resources',
    sidebar: 'crds',
    component: () => <CustomResourceList />,
  },
  crs: {
    path: '/crs',
    exact: true,
    name: 'CRInstances',
    sidebar: 'crs',
    component: () => <CrInstanceList />,
  },
  notifications: {
    path: '/notifications',
    exact: true,
    useClusterURL: false,
    name: 'Notifications',
    sidebar: {
      item: 'notifications',
      sidebar: DefaultSidebars.HOME,
    },
    noAuthRequired: true,
    component: () => (
      <PageGrid>
        <NotificationList />
      </PageGrid>
    ),
  },
  settings: {
    path: '/settings/general',
    exact: true,
    name: 'Settings',
    sidebar: {
      item: 'settingsGeneral',
      sidebar: DefaultSidebars.HOME,
    },
    useClusterURL: false,
    noAuthRequired: true,
    component: () => (
      <PageGrid>
        <Settings />
      </PageGrid>
    ),
  },
  settingsClusters: {
    path: '/settings/clusters',
    exact: true,
    name: 'Clusters',
    sidebar: 'settingsClusters',
    useClusterURL: false,
    noAuthRequired: true,
    component: () => (
      <PageGrid>
        <SettingsClusters />
      </PageGrid>
    ),
  },
  settingsCluster: {
    path: '/settings',
    exact: true,
    name: 'Cluster Settings',
    sidebar: {
      item: 'settingsCluster',
      sidebar: DefaultSidebars.HOME,
    },
    useClusterURL: true,
    noAuthRequired: true,
    component: () => {
      const cluster = useCluster();
      const history = useHistory();

      React.useEffect(() => {
        history.replace(`/settings/cluster?c=${cluster}`);
      }, []);

      return <></>;
    },
  },
  settingsClusterHomeContext: {
    path: '/settings/cluster',
    exact: true,
    name: 'Cluster Settings',
    sidebar: {
      item: 'settingsCluster',
      sidebar: DefaultSidebars.HOME,
    },
    useClusterURL: false,
    noAuthRequired: true,
    component: () => (
      <PageGrid>
        <SettingsCluster />
      </PageGrid>
    ),
  },
  // DISABLED UNTIL DATA HOOK UP
  plugins: {
    path: '/settings/plugins',
    exact: true,
    name: 'Plugins',
    sidebar: {
      item: 'plugins',
      sidebar: DefaultSidebars.HOME,
    },
    useClusterURL: false,
    noAuthRequired: true,
    component: () => <PluginSettings />,
  },
  pluginDetails: {
    path: '/settings/plugins/:name',
    exact: true,
    name: 'Plugin Details',
    sidebar: {
      item: 'plugins',
      sidebar: DefaultSidebars.HOME,
    },
    useClusterURL: false,
    noAuthRequired: true,
    component: () => <PluginSettingsDetails />,
  },
  portforwards: {
    path: '/portforwards',
    exact: true,
    name: 'PortForwards',
    sidebar: 'portforwards',
    disabled: !isElectron(),
    component: () => <PortForwardingList />,
  },
  loadKubeConfig: {
    path: '/load-kube-config',
    exact: true,
    name: 'Load KubeConfig',
    sidebar: null,
    useClusterURL: false,
    noAuthRequired: true,
    disabled: !isElectron(),
    component: () => <KubeConfigLoader />,
  },
  addCluster: {
    path: '/add-cluster',
    exact: true,
    name: 'Add Cluster',
    sidebar: {
      item: 'addCluster',
      sidebar: DefaultSidebars.HOME,
    },
    useClusterURL: false,
    noAuthRequired: true,
    disabled: !isElectron(),
    component: () => <AddCluster open onChoice={() => {}} />,
  },
  map: {
    path: '/map',
    exact: true,
    name: 'Map',
    sidebar: 'map',
    isFullWidth: true,
    component: () => <LazyGraphView height="100%" />,
  },
};

// The NotFound route  needs to be considered always in the last place when used
// with the router switch, as any routes added after this one will never be considered.
// So we do not include it in the default routes in order to always "manually" consider it.
export const NotFoundRoute = {
  path: '*',
  exact: true,
  name: `Whoops! This page doesn't exist`,
  component: () => <NotFoundComponent />,
  sidebar: null,
  noAuthRequired: true,
};

export function getRoute(routeName: string) {
  let routeKey = routeName;
  for (const key in defaultRoutes) {
    if (key.toLowerCase() === routeName.toLowerCase()) {
      // if (key !== routeName) {
      //   console.warn(`Route name ${routeName} and ${key} are not matching`);
      // }
      routeKey = key;
      break;
    }
  }
  return defaultRoutes[routeKey];
}

/**
 * Should the route use a cluster URL?
 *
 * @param route
 * @returns true when a cluster URL contains cluster in the URL. eg. /c/minikube/my-url
 *   false, the URL does not contain the cluster. eg. /my-url
 */
export function getRouteUseClusterURL(route: Route): boolean {
  if (route.useClusterURL === undefined && route.noCluster !== undefined) {
    console.warn('Route.noCluster is deprecated. Please use route.useClusterURL instead.');
    return route.noCluster;
  }
  if (route.useClusterURL === undefined) {
    // default is true, so undefined === true.
    return true;
  }
  return route.useClusterURL;
}

export function getRoutePath(route: Route) {
  if (route.path === NotFoundRoute.path) {
    return route.path;
  }
  if (!getRouteUseClusterURL(route)) {
    return route.path;
  }

  return getClusterPrefixedPath(route.path);
}

export interface RouteURLProps {
  /**
   * Selected clusters path parameter
   *
   * Check out {@link getClusterPathParam} and {@link formatClusterPathParam} function
   * for working with this parameter
   */
  cluster?: string;
  [prop: string]: any;
}

export function createRouteURL(routeName: string, params: RouteURLProps = {}) {
  const storeRoutes = store.getState().routes.routes;

  // First try to find by name
  const matchingStoredRouteByName =
    storeRoutes &&
    Object.entries(storeRoutes).find(
      ([, route]) => route.name?.toLowerCase() === routeName.toLowerCase()
    )?.[1];

  // Then try to find by path
  const matchingStoredRouteByPath =
    storeRoutes &&
    Object.entries(storeRoutes).find(([key]) => key.toLowerCase() === routeName.toLowerCase())?.[1];

  if (matchingStoredRouteByPath && !matchingStoredRouteByName) {
    console.warn(
      `[Deprecation] Route "${routeName}" was found by path instead of name. ` +
        'Please use route names instead of paths when calling createRouteURL.'
    );
  }

  const route = matchingStoredRouteByName || matchingStoredRouteByPath || getRoute(routeName);

  if (!route) {
    return '';
  }

  let cluster = params.cluster;
  if (!cluster && getRouteUseClusterURL(route)) {
    cluster = getClusterPathParam();
    if (!cluster) {
      return '/';
    }
  }
  const fullParams = {
    selected: undefined,
    ...params,
  };

  // Add cluster to the params if it is not already there
  if (!fullParams.cluster && !!cluster) {
    fullParams.cluster = cluster;
  }

  // @todo: Remove this hack once we support redirection in routes
  if (routeName === 'settingsCluster') {
    return `/settings/cluster?c=${fullParams.cluster}`;
  }

  const url = getRoutePath(route);
  return generatePath(url, fullParams);
}

export function getDefaultRoutes() {
  return defaultRoutes;
}
