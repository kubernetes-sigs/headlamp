---
title: Testing OIDC
sidebar_position: 4
---

OIDC (OpenID Connect) is a protocol that allows web applications to authenticate users through an identity provider. It also obtains basic profile information about the user.

## Testing OIDC with Kubernetes API Server

This guide will walk you through the process of testing OIDC on a Minikube cluster using an Azure App Registration. OIDC allows you to authenticate and interact with the cluster using kubectl.

### Create an Application on Azure

- Create an [application on Azure](https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app) and specify the redirect URL as `http://localhost:8000`.
- Generate a secret for the application under "Certificates and Secrets" and make note of its value.

### Start Minikube

- Start Minikube without enabling OIDC: `minikube start`. This is done to avoid RBAC (Role-Based Access Control) issues during startup. But, we can enable OIDC once the cluster is running.

### SSH into Minikube

- Once the Minikube cluster is started, SSH into it: `minikube ssh`.
- Install the Vim text editor: `sudo apt-get update && sudo apt-get install vim`.

### Edit the kube-apiserver Configuration

- Edit the kube-apiserver configuration file using Vim: `sudo vi /etc/kubernetes/manifests/kube-apiserver.yaml`.
- Add the following lines to the configuration file:

```bash
    - --oidc-issuer-url=https://sts.windows.net/<tenantID from application>/
    - --oidc-client-id=<Application Client ID>
    - --oidc-username-claim=email
```

- Save the changes to the configuration file and exit Vim.

### Wait for API Server Restart

- Wait for approximately 1 minute for the API server to restart and apply the new configuration.

### Install kubelogin

- Install [kubelogin](https://github.com/int128/kubelogin), which is a tool for testing Kubernetes authentication:

```bash
# Here's how to do it with Homebrew as an example:
brew install int128/kubelogin/kubelogin
```

### Create a Kubernetes User

- Create a Kubernetes user using the following command:

```bash
kubectl config set-credentials oidc-user \
--exec-api-version=client.authentication.k8s.io/v1beta1 \
--exec-command=kubectl \
--exec-arg=oidc-login \
--exec-arg=get-token \
--exec-arg=--oidc-issuer-url=https://sts.windows.net/<tenantID from application>/ \
--exec-arg=--oidc-client-id=<Application Client ID> \
--exec-arg=--oidc-client-secret=<Secret that you created in step 1> \
--exec-arg=--oidc-extra-scope="email offline_access profile openid"
```

### Set the Context for the OIDC User

- Set the context of the OIDC user as the default context using the following command:

```bash
kubectl config set-context --current --user=oidc-user
```

### Test Access to Pods

- Now you can test access to pods using the OIDC user. Try running the following command to get a list of pods:

```bash
kubectl get po -A
```

By following these steps, you can test OIDC with the Kubernetes API Server and authenticate using the OIDC user you created. Refer to [this doc](../installation/in-cluster/oidc.md) to access Headlamp using OIDC.
