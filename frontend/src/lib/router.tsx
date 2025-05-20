import React from 'react';
import { Route, Switch } from 'react-router-dom';
import WorkloadOverview from '../components/workload/Overview';
import ClusterOverview from '../components/cluster/Overview';
import NamespaceOverview from '../components/namespace/Overview';
import Node from '../components/node/Details';
import NodeList from '../components/node/List';
import PodDetails from '../components/pod/Details';
import PodList from '../components/pod/List';
import DeploymentDetails from '../components/deployment/Details';
import DeploymentList from '../components/deployment/List';
import ServiceDetails from '../components/service/Details';
import ServiceList from '../components/service/List';
import ReplicaSetDetails from '../components/replicaset/Details';
import ReplicaSetList from '../components/replicaset/List';
import IngressDetails from '../components/ingress/Details';
import IngressList from '../components/ingress/List';
import ConfigMapDetails from '../components/configmap/Details';
import ConfigMapList from '../components/configmap/List';
import SecretList from '../components/secret/List';
import SecretDetails from '../components/secret/Details';
import DaemonSetDetails from '../components/daemonset/Details';
import DaemonSetList from '../components/daemonset/List';
import StatefulSetDetails from '../components/statefulset/Details';
import StatefulSetList from '../components/statefulset/List';
import JobDetails from '../components/job/Details';
import JobList from '../components/job/List';
import CronJobDetails from '../components/cronjob/Details';
import CronJobList from '../components/cronjob/List';
import PersistentVolumeClaimDetails from '../components/pvc/Details';
import PersistentVolumeClaimList from '../components/pvc/List';
import PersistentVolumeDetails from '../components/persistentvolume/Details';
import PersistentVolumeList from '../components/persistentvolume/List';
import StorageClassDetails from '../components/storageclass/Details';
import StorageClassList from '../components/storageclass/List';
import EventList from '../components/event/List';
import RoleBindingList from '../components/role/BindingList';
import RoleBindingDetails from '../components/role/BindingDetails';
import RoleList from '../components/role/List';
import RoleDetails from '../components/role/Details';
import ClusterRoleBindingList from '../components/clusterrole/BindingList';
import ClusterRoleBindingDetails from '../components/clusterrole/BindingDetails';
import ClusterRoleList from '../components/clusterrole/List';
import ClusterRoleDetails from '../components/clusterrole/Details';
import ServiceAccountList from '../components/serviceaccount/List';
import ServiceAccountDetails from '../components/serviceaccount/Details';
import NamespaceDetails from '../components/namespace/Details';
import NamespaceList from '../components/namespace/List';
import CustomResourceList from '../components/crd/List';
import CustomResourceDetails from '../components/crd/Details';
import CustomResourceDefinitionList from '../components/crd/DefinitionList';
import CustomResourceDefinitionDetails from '../components/crd/DefinitionDetails';
import NetworkPolicyList from '../components/networkpolicy/List';
import NetworkPolicyDetails from '../components/networkpolicy/Details';
import HorizontalPodAutoscalerList from '../components/horizontalpodautoscaler/List';
import HorizontalPodAutoscalerDetails from '../components/horizontalpodautoscaler/Details';
import PodDisruptionBudgetList from '../components/poddisruptionbudget/List';
import PodDisruptionBudgetDetails from '../components/poddisruptionbudget/Details';
import PriorityClassList from '../components/priorityclass/List';
import PriorityClassDetails from '../components/priorityclass/Details';
import RuntimeClassList from '../components/runtimeclass/List';
import RuntimeClassDetails from '../components/runtimeclass/Details';
import EndpointList from '../components/endpoints/List';
import EndpointDetails from '../components/endpoints/Details';
import LimitRangeList from '../components/limitrange/List';
import LimitRangeDetails from '../components/limitrange/Details';
import ResourceQuotaList from '../components/resourcequota/List';
import ResourceQuotaDetails from '../components/resourcequota/Details';
import GatewayList from '../components/gateway/List';
import GatewayDetails from '../components/gateway/Details';
import HTTPRouteList from '../components/gateway/HTTPRouteList';
import HTTPRouteDetails from '../components/gateway/HTTPRouteDetails';
import ServiceMeshView from '../components/gateway/ServiceMeshView';
import { getCluster } from './util';

export interface Route {
  path: string;
  exact?: boolean;
  component: React.ComponentType<any>;
}

export const ROUTES: Route[] = [
  {
    path: '/',
    exact: true,
    component: ClusterOverview,
  },
  {
    path: '/workloads',
    exact: true,
    component: WorkloadOverview,
  },
  {
    path: '/nodes',
    exact: true,
    component: NodeList,
  },
  {
    path: '/node/:name',
    component: Node,
  },
  {
    path: '/pods',
    exact: true,
    component: PodList,
  },
  {
    path: '/pod/:namespace/:name',
    component: PodDetails,
  },
  {
    path: '/deployments',
    exact: true,
    component: DeploymentList,
  },
  {
    path: '/deployment/:namespace/:name',
    component: DeploymentDetails,
  },
  {
    path: '/services',
    exact: true,
    component: ServiceList,
  },
  {
    path: '/service/:namespace/:name',
    component: ServiceDetails,
  },
  {
    path: '/replicasets',
    exact: true,
    component: ReplicaSetList,
  },
  {
    path: '/replicaset/:namespace/:name',
    component: ReplicaSetDetails,
  },
  {
    path: '/ingresses',
    exact: true,
    component: IngressList,
  },
  {
    path: '/ingress/:namespace/:name',
    component: IngressDetails,
  },
  {
    path: '/configmaps',
    exact: true,
    component: ConfigMapList,
  },
  {
    path: '/configmap/:namespace/:name',
    component: ConfigMapDetails,
  },
  {
    path: '/secrets',
    exact: true,
    component: SecretList,
  },
  {
    path: '/secret/:namespace/:name',
    component: SecretDetails,
  },
  {
    path: '/daemonsets',
    exact: true,
    component: DaemonSetList,
  },
  {
    path: '/daemonset/:namespace/:name',
    component: DaemonSetDetails,
  },
  {
    path: '/statefulsets',
    exact: true,
    component: StatefulSetList,
  },
  {
    path: '/statefulset/:namespace/:name',
    component: StatefulSetDetails,
  },
  {
    path: '/jobs',
    exact: true,
    component: JobList,
  },
  {
    path: '/job/:namespace/:name',
    component: JobDetails,
  },
  {
    path: '/cronjobs',
    exact: true,
    component: CronJobList,
  },
  {
    path: '/cronjob/:namespace/:name',
    component: CronJobDetails,
  },
  {
    path: '/persistentvolumeclaims',
    exact: true,
    component: PersistentVolumeClaimList,
  },
  {
    path: '/persistentvolumeclaim/:namespace/:name',
    component: PersistentVolumeClaimDetails,
  },
  {
    path: '/persistentvolumes',
    exact: true,
    component: PersistentVolumeList,
  },
  {
    path: '/persistentvolume/:name',
    component: PersistentVolumeDetails,
  },
  {
    path: '/storageclasses',
    exact: true,
    component: StorageClassList,
  },
  {
    path: '/storageclass/:name',
    component: StorageClassDetails,
  },
  {
    path: '/events',
    exact: true,
    component: EventList,
  },
  {
    path: '/rolebindings',
    exact: true,
    component: RoleBindingList,
  },
  {
    path: '/rolebinding/:namespace/:name',
    component: RoleBindingDetails,
  },
  {
    path: '/roles',
    exact: true,
    component: RoleList,
  },
  {
    path: '/role/:namespace/:name',
    component: RoleDetails,
  },
  {
    path: '/clusterrolebindings',
    exact: true,
    component: ClusterRoleBindingList,
  },
  {
    path: '/clusterrolebinding/:name',
    component: ClusterRoleBindingDetails,
  },
  {
    path: '/clusterroles',
    exact: true,
    component: ClusterRoleList,
  },
  {
    path: '/clusterrole/:name',
    component: ClusterRoleDetails,
  },
  {
    path: '/serviceaccounts',
    exact: true,
    component: ServiceAccountList,
  },
  {
    path: '/serviceaccount/:namespace/:name',
    component: ServiceAccountDetails,
  },
  {
    path: '/namespaces',
    exact: true,
    component: NamespaceList,
  },
  {
    path: '/namespace/:name',
    component: NamespaceDetails,
  },
  {
    path: '/customresources',
    exact: true,
    component: CustomResourceList,
  },
  {
    path: '/customresource/:group/:version/:namespace/:name/:resource',
    component: CustomResourceDetails,
  },
  {
    path: '/customresourcedefinitions',
    exact: true,
    component: CustomResourceDefinitionList,
  },
  {
    path: '/customresourcedefinition/:name',
    component: CustomResourceDefinitionDetails,
  },
  {
    path: '/networkpolicies',
    exact: true,
    component: NetworkPolicyList,
  },
  {
    path: '/networkpolicy/:namespace/:name',
    component: NetworkPolicyDetails,
  },
  {
    path: '/horizontalpodautoscalers',
    exact: true,
    component: HorizontalPodAutoscalerList,
  },
  {
    path: '/horizontalpodautoscaler/:namespace/:name',
    component: HorizontalPodAutoscalerDetails,
  },
  {
    path: '/poddisruptionbudgets',
    exact: true,
    component: PodDisruptionBudgetList,
  },
  {
    path: '/poddisruptionbudget/:namespace/:name',
    component: PodDisruptionBudgetDetails,
  },
  {
    path: '/priorityclasses',
    exact: true,
    component: PriorityClassList,
  },
  {
    path: '/priorityclass/:name',
    component: PriorityClassDetails,
  },
  {
    path: '/runtimeclasses',
    exact: true,
    component: RuntimeClassList,
  },
  {
    path: '/runtimeclass/:name',
    component: RuntimeClassDetails,
  },
  {
    path: '/endpoints',
    exact: true,
    component: EndpointList,
  },
  {
    path: '/endpoint/:namespace/:name',
    component: EndpointDetails,
  },
  {
    path: '/limitranges',
    exact: true,
    component: LimitRangeList,
  },
  {
    path: '/limitrange/:namespace/:name',
    component: LimitRangeDetails,
  },
  {
    path: '/resourcequotas',
    exact: true,
    component: ResourceQuotaList,
  },
  {
    path: '/resourcequota/:namespace/:name',
    component: ResourceQuotaDetails,
  },
  {
    path: '/gateways',
    exact: true,
    component: GatewayList,
  },
  {
    path: '/gateway/:namespace/:name',
    component: GatewayDetails,
  },
  {
    path: '/httproutes',
    exact: true,
    component: HTTPRouteList,
  },
  {
    path: '/httproute/:namespace/:name',
    component: HTTPRouteDetails,
  },
  {
    path: '/servicemesh',
    exact: true,
    component: ServiceMeshView,
  },
  {
    path: '/servicemesh/:namespace',
    component: ServiceMeshView,
  },
];

export function getRoutePath(route: Route, params: {[key: string]: string} = {}) {
  let path = route.path;
  Object.entries(params).forEach(([key, value]) => {
    path = path.replace(`:${key}`, value);
  });

  return path;
}

export function getClusterPrefixedPath(path: string) {
  const cluster = getCluster();
  return cluster ? `/c/${cluster}${path}` : path;
}

export function createRoutes() {
  return (
    <Switch>
      {ROUTES.map(route => (
        <Route
          key={route.path}
          path={getClusterPrefixedPath(route.path)}
          exact={route.exact}
          component={route.component}
        />
      ))}
    </Switch>
  );
}