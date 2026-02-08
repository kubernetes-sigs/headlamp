---
title: In-cluster
sidebar_position: 1
---

A common use case for any Kubernetes web UI is to deploy it in-cluster and set up an ingress server for having it available to users.

## Using Helm

The easiest way to install Headlamp in your existing cluster is to use helm with our helm chart:
https://helm.sh/docs/intro/quickstart/
https://github.com/kubernetes-sigs/headlamp/tree/main/charts/headlamp

helm repo add headlamp https://kubernetes-sigs.github.io/headlamp/
helm install my-headlamp headlamp/headlamp --namespace kube-system

As usual, it is possible to configure the helm release via the values file or by setting values directly.

helm install my-headlamp headlamp/headlamp --namespace kube-system -f values.yaml
helm install my-headlamp headlamp/headlamp --namespace kube-system --set replicaCount=2

## Using simple yaml

We also maintain a simple/vanilla deployment file for setting up Headlamp using raw Kubernetes manifests.

kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/headlamp/main/kubernetes-headlamp.yaml

## Installing plugins in in-cluster deployments

Headlamp supports multiple ways of installing plugins when running inside a Kubernetes cluster. The recommended approach depends on the deployment model.

### Recommended (Production / GitOps): InitContainer + shared volume

For production and GitOps-based in-cluster deployments, the recommended way to install plugins is by using an initContainer that copies plugin files into a shared volume mounted by the main Headlamp container.

Reasons:
- Fully declarative and GitOps-friendly
- Explicit plugin versions
- Works in air-gapped environments
- No runtime dependency on external registries
- Predictable and reproducible deployments

Plugin installation happens before the main Headlamp container starts and does not mutate a running pod.

## Plugin Management

Headlamp also supports managing plugins through a sidecar container when deployed in-cluster. This approach is supported but intended mainly for development and testing.

NOTE:
The sidecar-based plugin manager is NOT recommended for production or GitOps-based deployments. For those scenarios, prefer installing plugins via an initContainer and shared volume.
