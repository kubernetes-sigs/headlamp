import React from 'react';
import Overview from '../components/cluster/Overview';
import WorkloadOverview from '../components/workload/Overview';
import Auth from '../components/account/Auth';
import NamespacesList from '../components/namespace/List';
import NodeList from '../components/node/List';
import StorageClassList from '../components/storage/ClassList';
import PersistentVolumeList from '../components/storage/VolumeList';
import PersistentVolumeDetails from '../components/storage/VolumeDetails';
import PersistentVolumeClaimList from '../components/storage/ClaimList';
import ServiceList from '../components/service/List';
import IngressList from '../components/ingress/List';
import ReplicaSetList from '../components/replicaset/List';
import ConfigMapList from '../components/configmap/List';
import ServiceAccountList from '../components/serviceaccount/List';
import RoleList from '../components/role/List';
import SecretList from '../components/secret/List';
import RoleBindingList from '../components/role/BindingList';
import PodList from '../components/pods/List';
import StorageClassDetails from '../components/storage/ClassDetails';
import IngressDetails from '../components/ingress/Details';
import { generatePath } from 'react-router';
import ServiceDetails from '../components/service/Details';
import ConfigDetails from '../components/configmap/Details';
import PersistentVolumeClaimDetails from '../components/storage/ClaimDetails';
import ServiceAccountDetails from '../components/serviceaccount/Details';
import RoleDetails from '../components/role/Details';
import RoleBindingDetails from '../components/role/BindingDetails';
import SecretDetails from '../components/secret/Details';
import PodDetails from '../components/pods/Details';
import ReplicaSetDetails from '../components/replicaset/Details';
import NodeDetails from '../components/node/Details';
import NamespaceDetails from '../components/namespace/Details';
import WorkloadDetails from '../components/workload/Details';

export const ROUTES = {
  cluster: {
    path: "/",
    exact: true,
    name: 'Cluster',
    component: () => <Overview />
  },
  namespaces: {
    path: "/namespaces",
    name: 'Namespaces',
    exact: true,
    component: () => <NamespacesList />
  },
  Namespace: {
    path: "/namespaces/:name",
    component: () => <NamespaceDetails />
  },
  nodes: {
    path: "/nodes",
    name: 'Nodes',
    exact: true,
    component: () => <NodeList />
  },
  Node: {
    path: "/nodes/:name",
    component: () => <NodeDetails />
  },
  storageClasses: {
    path: "/storage/classes",
    exact: true,
    name: 'Storage Classes',
    component: () => <StorageClassList />
  },
  storageClassDetails: {
    path: "/storage/classes/:name",
    name: 'Storage Classes',
    component: () => <StorageClassDetails />
  },
  storageVolumes: {
    path: "/storage/persistentvolumes",
    exact: true,
    name: 'Persistent Volumes',
    component: () => <PersistentVolumeList />
  },
  persistentVolume: {
    path: "/storage/persistentvolumes/:name",
    exact: true,
    name: 'Persistent Volume',
    component: () => <PersistentVolumeDetails />
  },
  persistentVolumeClaims: {
    path: "/storage/persistentvolumeclaims",
    exact: true,
    name: 'Persistent Volume Claims',
    component: () => <PersistentVolumeClaimList />
  },
  persistentVolumeClaim: {
    path: "/storage/persistentvolumeclaims/:namespace/:name",
    exact: true,
    component: () => <PersistentVolumeClaimDetails />
  },
  workloads: {
    path: "/workload",
    exact: true,
    name: 'Workloads',
    component: () => <WorkloadOverview />
  },
  DaemonSet: {
    path: "/daemonsets/:namespace/:name",
    exact: true,
    component: () => <WorkloadDetails workloadKind="DaemonSet" />
  },
  StatefulSet: {
    path: "/statefulsets/:namespace/:name",
    exact: true,
    component: () => <WorkloadDetails workloadKind="StatefulSet" />
  },
  Deployment: {
    path: "/deployments/:namespace/:name",
    exact: true,
    component: () => <WorkloadDetails workloadKind="Deployment" />
  },
  Job: {
    path: "/jobs/:namespace/:name",
    exact: true,
    component: () => <WorkloadDetails workloadKind="Job" />
  },
  CronJob: {
    path: "/cronjobs/:namespace/:name",
    exact: true,
    component: () => <WorkloadDetails workloadKind="CronJob" />
  },
  pods: {
    path: "/pods",
    exact: true,
    name: 'Pods',
    component: () => <PodList />
  },
  pod: {
    path: "/pods/:namespace/:name",
    exact: true,
    component: () => <PodDetails />
  },
  services: {
    path: "/services",
    exact: true,
    name: 'Services',
    component: () => <ServiceList />
  },
  service: {
    path: "/services/:namespace/:name",
    exact: true,
    component: () => <ServiceDetails />
  },
  ingresses: {
    path: "/ingresses",
    exact: true,
    name: 'Ingresses',
    component: () => <IngressList />
  },
  ingress: {
    path: "/ingresses/:namespace/:name",
    exact: true,
    component: () => <IngressDetails />
  },
  replicaSets: {
    path: "/replicasets",
    exact: true,
    name: 'Replica Sets',
    component: () => <ReplicaSetList />
  },
  ReplicaSet: {
    path: "/replicasets/:namespace/:name",
    exact: true,
    component: () => <ReplicaSetDetails />
  },
  configMaps: {
    path: "/configmaps",
    exact: true,
    name: 'Config Maps',
    component: () => <ConfigMapList />
  },
  configMap: {
    path: "/configmaps/:namespace/:name",
    exact: true,
    component: () => <ConfigDetails />
  },
  serviceAccounts: {
    path: "/serviceaccounts",
    exact: true,
    name: 'Service Accounts',
    component: () => <ServiceAccountList />
  },
  serviceAccount: {
    path: "/serviceaccounts/:namespace/:name",
    exact: true,
    component: () => <ServiceAccountDetails />
  },
  roles: {
    path: "/roles",
    exact: true,
    name: 'Roles',
    component: () => <RoleList />
  },
  role: {
    path: "/roles/:namespace/:name",
    exact: true,
    component: () => <RoleDetails />
  },
  clusterrole: {
    path: "/clusterroles/:name",
    exact: true,
    component: () => <RoleDetails />
  },
  roleBindings: {
    path: "/rolebindings",
    exact: true,
    name: 'Role Bindings',
    component: () => <RoleBindingList />
  },
  roleBinding: {
    path: "/rolebinding/:namespace/:name",
    exact: true,
    name: 'Role Binding',
    component: () => <RoleBindingDetails />
  },
  clusterRoleBinding: {
    path: "/clusterrolebinding/:name",
    exact: true,
    name: 'Role Binding',
    component: () => <RoleBindingDetails />
  },
  secrets: {
    path: "/secrets",
    exact: true,
    name: 'Secrets',
    component: () => <SecretList />
  },
  secret: {
    path: "/secrets/:namespace/:name",
    exact: true,
    component: () => <SecretDetails />
  },
  login: {
    path: "/login",
    exact: true,
    name: 'Login',
    component: () => <Auth />
  },
};

export function getRoute(routeName) {
  return ROUTES[routeName];
}

export function createRouteURL(routeName, params={}) {
  const url = getRoute(routeName).path;
  return generatePath(url, params);
}
