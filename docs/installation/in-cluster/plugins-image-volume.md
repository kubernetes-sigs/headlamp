---
title: Configuring plugins with Image Volumes
sidebar_label: Plugins (Image Volumes)
sidebar_position: 2
---

From Kubernetes 1.33 onward (generally available in 1.36), you can mount a
container image directly as a volume. That makes it simpler to ship Headlamp
UI plugins into an in-cluster deployment without an init container that copies
files into an `emptyDir`.

See the upstream Kubernetes guide:
[Use an image volume with a pod](https://kubernetes.io/docs/tasks/configure-pod-container/image-volumes/).

:::tip
This page is about **Headlamp UI plugins** (Flux, Prometheus UI extensions,
and similar). It is not about Cluster Inventory **access provider** plugins.
Those use image volumes under `config.clusterInventory.plugins` in the Helm
chart and are covered in [In-cluster](./index.md#cluster-inventory).
:::

## Why Image Volumes?

The older pattern uses an init container to copy plugin files from a plugin
image into a shared volume. With image volumes you:

- Mount the plugin image path directly into Headlamp
- Avoid init-container copy steps and race conditions around that copy
- Keep plugin versioning tied to the image tag you reference

Official plugin images are published under
[headlamp-k8s packages](https://github.com/orgs/headlamp-k8s/packages?tab=packages&q=headlamp-plugin).
Plugin images typically place built plugin files under `/plugins/<plugin-name>/`.

## Requirements

- A cluster that supports Kubernetes **ImageVolume**:
  - **1.33–1.34:** enable the `ImageVolume` feature gate on the API server and
    kubelets
  - **1.35:** enabled by default
  - **1.36+:** generally available (GA)
- A node container runtime (CRI) that supports ImageVolume (feature gate alone is
  not enough; check your distribution / CRI docs)
- A Headlamp in-cluster Deployment (or Helm release) you can edit
- Network access so the node can pull the plugin image

Before applying the Deployment or Helm examples below, confirm ImageVolume is
supported by your cluster version, feature gates, and node CRI/runtime.

## Deployment example (Flux plugin)

The example below mounts the Flux plugin image into Headlamp's static plugins
directory. Adjust the image tag to a version you want to pin.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: headlamp
  namespace: headlamp
spec:
  replicas: 1
  selector:
    matchLabels:
      k8s-app: headlamp
  template:
    metadata:
      labels:
        k8s-app: headlamp
    spec:
      containers:
        - name: headlamp
          image: ghcr.io/headlamp-k8s/headlamp:latest
          args:
            - "-in-cluster"
            - "-plugins-dir=/headlamp/plugins"
          ports:
            - containerPort: 4466
              name: http
          volumeMounts:
            # Mount the plugin package into the static-plugins folder
            - name: flux-plugin
              mountPath: /headlamp/static-plugins/flux
              subPath: plugins/flux
      volumes:
        - name: flux-plugin
          image:
            reference: ghcr.io/headlamp-k8s/headlamp-plugin-flux:v0.6.0
            pullPolicy: IfNotPresent
      nodeSelector:
        kubernetes.io/os: linux
```

Notes:

- `subPath: plugins/flux` matches the layout inside the published Flux plugin
  image (`/plugins/flux` in the image becomes the mount root).
- `mountPath: /headlamp/static-plugins/flux` loads the plugin as a static /
  shipped-style plugin path served by Headlamp.
- You can add more `volumeMounts` / `volumes` entries for additional plugins.

## Helm chart

The Headlamp Helm chart exposes `volumeMounts` and `volumes` on the Deployment.
Example values:

```yaml
volumeMounts:
  - name: flux-plugin
    mountPath: /headlamp/static-plugins/flux
    subPath: plugins/flux

volumes:
  - name: flux-plugin
    image:
      reference: ghcr.io/headlamp-k8s/headlamp-plugin-flux:v0.6.0
      pullPolicy: IfNotPresent
```

Install or upgrade with those values:

```bash
helm upgrade --install my-headlamp headlamp/headlamp \
  --namespace kube-system \
  -f values.yaml
```

## Verify

1. Wait for the Headlamp pod to become Ready.
2. Open Headlamp in the browser.
3. Confirm the plugin UI is available (for Flux, related sidebar / views appear
   when Flux is also installed in the cluster).

If the plugin does not load, check:

- The node could pull the plugin image from the volume `reference:` field
- Your cluster version and node CRI/runtime support image volumes
- `subPath` matches the directory inside the plugin image
- Pod events: `kubectl describe pod -n <namespace> <headlamp-pod>`

## Related approaches

| Approach | When to use |
| --- | --- |
| [Image Volumes](./plugins-image-volume.md) (this page) | Kubernetes 1.33+; prefer direct mounts of plugin images |
| [InitContainer + plugin image](../../development/plugins/building.md#using-initcontainer-with-a-plugin-image) | Clusters without image volumes |
| [Plugin Management sidecar](./index.md#plugin-management) | Install/update plugins from Artifact Hub via Helm `pluginsManager` |
| [Desktop Plugin Catalog](../desktop/plugins-install-desktop.md) | Desktop app installs |
