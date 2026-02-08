---
title: In-cluster
sidebar_position: 1
---

A common use case for any Kubernetes web UI is to deploy it in-cluster and
set up an ingress server for having it available to users.

## Using Helm

The easiest way to install Headlamp in your existing cluster is to use Helm
with the official Helm chart.

https://helm.sh/docs/intro/quickstart/  
https://github.com/kubernetes-sigs/headlamp/tree/main/charts/headlamp

helm repo add headlamp https://kubernetes-sigs.github.io/headlamp/
helm install my-headlamp headlamp/headlamp --namespace kube-system

As usual, it is possible to configure the Helm release via a values file
or by setting values directly.

helm install my-headlamp headlamp/headlamp --namespace kube-system -f values.yaml  
helm install my-headlamp headlamp/headlamp --namespace kube-system --set replicaCount=2

## Using simple yaml

We also maintain a simple/vanilla deployment file for setting up Headlamp
using raw Kubernetes manifests.

kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/headlamp/main/kubernetes-headlamp.yaml

## Installing plugins in in-cluster deployments

Headlamp supports multiple ways of installing plugins when running inside a
Kubernetes cluster. The recommended approach depends on the deployment model
and operational requirements.

### InitContainer + shared volume

Using an initContainer to copy plugin files into a shared volume mounted by
the main Headlamp container can be useful for declarative and GitOps-style
deployments.

This approach:
- Allows plugin versions to be explicitly defined in manifests
- Works well in air-gapped or restricted environments
- Ensures plugins are available before the main container starts
- Avoids runtime mutation of the running pod

## Plugin Management

Headlamp also supports managing plugins through a sidecar container when
deployed in-cluster. This mechanism allows plugins to be installed and updated
dynamically at runtime.

Both approaches are supported. The choice between initContainer-based
installation and the sidecar-based plugin manager depends on the desired level
of dynamism versus declarative control.
