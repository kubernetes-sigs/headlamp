---
title: Testing
sidebar_position: 3
---

## Load testing Headlamp

Can Headlamp work well with busy clusters?

Limits we want to test for to begin with:

- 10,000 pods
- 1,000 nodes
- 10,000 events
- 15 clusters (300 clusters max)

Steps:

- Create load in a cluster
- Run Headlamp and see if it works well compared to low load
  - performance profiles
  - CPU/memory usage
  - feel

### Kwok for low resource usage load testing of Headlamp

> [KWOK](https://github.com/kubernetes-sigs/kwok) is a toolkit that enables setting up a cluster of thousands of Nodes in seconds. All Nodes are simulated to behave like real ones, which creates a pretty low resource footprint that you can easily play around with on your machine.

- [KWOK installation](https://kwok.sigs.k8s.io/docs/user/installation/)

### Creating lots of Kubernetes activity

Maybe you need to delete a cluster and create a fresh one.

```bash
kwokctl delete cluster
kwokctl create cluster
```

Make sure your kubectl context is set to 'kwok-kwok'.

```bash
kubectl config get-contexts
```

#### Generating Initial Data

This will create 900 nodes, 9000 pods, and 1000 events as fast as possible. Then it will create 1 event per second up to a total of 9000 events. Also one per second: 100 new nodes and 1000 new pods. Finally, it will create 15 clusters.

```bash
cd load-tests
npm install

echo "Creating initial activity: 900 nodes, 9000 pods, and 1000 events"
node scripts/create-nodes.js 900 0
node scripts/create-pods.js 9000 0
node scripts/create-events.js 1000 0
node scripts/create-deployments.js 500 0
node scripts/create-clusters.js 15 0
```

#### Generating Activity

To make some activity after the initial data is loaded.

```bash
echo "---------------"
echo "creating 1 node, 1 pod, and 1 event per second"
node scripts/create-events.js 9000 1 & node scripts/create-nodes.js 100 1 & node scripts/create-pods.js 1000 1 &
```

#### Cleaning up clusters

Kwok clusters can take up a lot of resources even when doing nothing,
due to the Kubernetes API server using resources even when idle.

So when you're done, you can delete them like this.

```bash
kwokctl delete cluster --name=kwok
node scripts/create-clusters.js 15 0 --delete
```
