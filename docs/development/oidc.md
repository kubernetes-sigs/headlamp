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


# Using self-signed CA certificates for OIDC

When working with OIDC providers that use self-signed certificates or custom Certificate Authorities (CAs), Headlamp provides several options to handle TLS verification issues.

## Command Line Options

### Skip TLS Verification

To skip TLS verification entirely (not recommended for production):

```bash
headlamp --oidc-skip-tls-verify
```

**Warning**: This option disables TLS certificate validation and is not safe for production environments.

### Custom CA Certificate

To specify a custom CA certificate file:

```bash
headlamp --oidc-ca-file=/path/to/ca-certificate.pem
```

The CA file must be a valid PEM-encoded certificate file.

## Kubeconfig Configuration

You can also configure OIDC with custom CA certificates directly in your kubeconfig file. 

### Using CA Certificate File Path

Add the `idp-certificate-authority` field to your OIDC auth provider configuration:

```yaml
apiVersion: v1
kind: Config
users:
- name: oidc-user
  user:
    auth-provider:
      name: oidc
      config:
        client-id: "your-client-id"
        client-secret: "your-client-secret"
        idp-issuer-url: "https://your-oidc-provider.com"
        scope: "profile,email"
        idp-certificate-authority: "/path/to/ca-certificate.pem"
```

### Using Base64-encoded CA Certificate Data

Alternatively, you can embed the CA certificate directly in the kubeconfig using base64-encoded data:

```yaml
apiVersion: v1
kind: Config
users:
- name: oidc-user
  user:
    auth-provider:
      name: oidc
      config:
        client-id: "your-client-id"
        client-secret: "your-client-secret"
        idp-issuer-url: "https://your-oidc-provider.com"
        scope: "profile,email"
        idp-certificate-authority-data: "LS0tLS1CRUdJTiBD...=="
```


## Security Considerations

1. **Skip TLS Verification**: Only use `--oidc-skip-tls-verify` in development or testing environments. This option disables all TLS certificate validation and makes your connection vulnerable to man-in-the-middle attacks.

2. **Custom CA Certificates**: When using self-signed certificates, ensure that:
   - The CA certificate is valid and not expired
   - The certificate is properly formatted (PEM encoding)
   - The certificate is stored securely and has appropriate file permissions

3. **Production Use**: For production environments, consider:
   - Using certificates from a trusted Certificate Authority
   - Implementing proper certificate rotation procedures
   - Monitoring certificate expiration dates