---
title: Platforms
sidebar_position: 3
---

## Tested Kubernetes Platforms

This section shows the platforms where Headlamp has been tested (in-cluster) or is to be tested, and useful observations about it.
If you have tested Headlamp on a different flavor or Kubernetes, please file a PR or [issue](https://github.com/kubernetes-sigs/headlamp/issues/new/choose) to add your remarks to the list.

The "works" column refers to the overall Kubernetes-related functionality when running on the respective platform; it may have 3 different values:

- ✔️ : Has been tried and works well to the extent of what has been tested
- ❌ : Has been tried and didn't work or had issues that prevented a regular use of it
- ❔: Hasn't been tried/reported yet

| Platform                                                                        | Works | Comments                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | :---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Amazon EKS](https://aws.amazon.com/eks/)                                       |  ✔️   | - As reported [here](https://github.com/kubernetes-sigs/headlamp/issues/266).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [DigitalOcean Kubernetes](https://www.digitalocean.com/products/kubernetes/)    |  ❔   | - Have you tried Headlamp on this platform? Please report your experience.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [Google Kubernetes Engine (GKE)](https://cloud.google.com/kubernetes-engine)    |  ✔️   | - As reported [here](https://github.com/kubernetes-sigs/headlamp/issues/3767).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [K3s](https://k3s.io/)                                                          |  ✔️   | - Simple to install / expose with the regular [in-cluster instructions](https://headlamp.dev/docs/latest/installation/in-cluster/).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [Kind](https://kind.sigs.k8s.io/)                                               |  ✔️   | - Simple to install / expose with the regular [in-cluster instructions](https://headlamp.dev/docs/latest/installation/in-cluster/).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [Microsoft AKS](https://azure.microsoft.com/)                                   |  ✔️   | - Working fine in-cluster and with the desktop application. |
| [Minikube](https://minikube.sigs.k8s.io/)                                       |  ✔️   | - For exposing with an ingress, enable ingresses with `minikube addons enable ingress`: <br/> - There are docs about the [development](./development/index.md#minikube-in-cluster) with Minikube.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [Vultr Kubernetes Engine](https://www.vultr.com/kubernetes/)                    |  ✔️   | - Simple to install / expose with the regular [in-cluster instructions](https://headlamp.dev/docs/latest/installation/in-cluster/).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [Red Hat OpenShift](https://www.redhat.com/en/technologies/cloud-computing/openshift)                    |  ✔️   | - Simple to install / expose with the regular [in-cluster instructions](https://headlamp.dev/docs/latest/installation/in-cluster/).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [K0s](https://k0sproject.io/)                                                          |  ✔️   | - Simple to install / expose with the regular [in-cluster instructions](https://headlamp.dev/docs/latest/installation/in-cluster/).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [vSphere Kubernetes Service (VKS)](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vsphere-supervisor-services-and-standalone-components/latest/release-notes/vmware-tanzu-kubernetes-grid-service-release-notes.html)                                       |  ✔️   | - Simple to install / expose with the regular [in-cluster instructions](https://headlamp.dev/docs/latest/installation/in-cluster/).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
## Tested Browsers

We mostly test with 'modern browsers' defined as the latest version and two older versions. But we try to make Headlamp work with web standards, so it's quite likely other standards-conforming browsers will also work.

| Platform             | Works | Comments |
| -------------------- | :---: | -------- |
| Edge                 |  ✔️   |
| Safari               |  ✔️   |
| Firefox              |  ✔️   |
| Chrome               |  ✔️   |
| Internet Explorer 11 |  ❌   |

## Tested Desktop OS, for App version

We test on MacOS, various flavours of Linux, and Windows. Headlamp runs in the browser, but also as an App.

| Platform                           | Works | Comments |
| ---------------------------------- | :---: | -------- |
| Windows 10, 11 (including in WSL2) |  ✔️   |
| MacOS (arm, x86)                   |  ✔️   |
| Ubuntu 20.04, 22.04, 22.10         |  ✔️   |
| Fedora                             |  ✔️   |
| Flatpak                            |  ✔️   | See [running external tools from Headlamp](/docs/latest/installation/desktop/linux-installation#running-external-tools) if you need to use `az`, `aws`, `gcloud`, etc. in your kubeconfig |


## CNCF and Kubernetes Integrations

See these two links up to date lists of plugins which integrate with out cloud native projects:
- [Artifact Hub plugin list](https://artifacthub.io/packages/search?kind=21&sort=relevance)
- [Headlamp plugins repo](https://github.com/headlamp-k8s/plugins/)

Here is a list of CNCF project integrations at time of writing:

| Project          |
| ----------       |
| Backstage        |
| Flux             |
| Inspektor Gadget |
| Kompose          |
| KubeScape        |
| KubeVirt         |
| OpenCost         |
| Prometheus       |
| Trivy            |
