---
title: Security Hardening Guide
sidebar_position: 6
---

# Security Hardening Guide

## Introduction

This guide outlines steps to secure a Headlamp installation. While Headlamp is designed to be easy to deploy, ensuring a secure configuration is critical for production environments.

A security hardening guide is necessary to help administrators mitigate potential risks associated with unauthorized access and potential mishandling of cluster credentials. It is also important to note that older Headlamp installations may still be using insecure or outdated defaults that were acceptable for testing but are not suitable for production use.

## Hardening Recommendations

The following sections provide practical guidance on how to harden your Headlamp deployment.

### Authentication

Enable a robust authentication mechanism. Headlamp supports OIDC (OpenID Connect), which allows you to integrate with identity providers like Keycloak, Google, or Dex.

* **Configure OIDC**: Use OIDC to manage user access centrally. This avoids relying on static tokens or kubeconfig files distributed to users.
* **Avoid Anonymous Access**: Ensure that anonymous access is disabled unless strictly intended for a read-only, public-facing demo environment (which is generally discouraged for cluster dashboards).

Validating that only authenticated users can access the dashboard is the first line of defense.

### TLS / HTTPS Configuration

Everything should run over TLS.

* **Enable HTTPS**: Ensure that Headlamp is served over HTTPS. This protects the integrity and confidentiality of the data in transit, including potential tokens and cluster information.
* **Secure Certificates**: Use valid certificates from a trusted Certificate Authority (CA). Avoid self-signed certificates in production if possible, or ensure clients are properly configured to trust your internal CA.

### RBAC and Least-Privilege Permissions

Headlamp uses the permissions of the authenticated user to talk to the Kubernetes API. However, the ServiceAccount used by the Headlamp backend itself should also be restricted.

* **Least Privilege**: Ensure users only have the Kubernetes RBAC permissions they need. Headlamp will only show resources the user is allowed to access.
* **Review ClusterRoles**: Avoid granting `cluster-admin` privileges unnecessarily. Create specific Roles or ClusterRoles that grant only the required permissions for the user's tasks.

### ServiceAccount Usage

When deploying Headlamp in-cluster, it runs with a Kubernetes ServiceAccount.

* **Restrict ServiceAccount Permissions**: The Headlamp pod's ServiceAccount should have minimal permissions. It typically does not need broad access to the cluster if OIDC is used, as the backend acts on behalf of the user.
* **AutomountServiceAccountToken**: If the Headlamp application does not need to communicate with the API server using its own identity (e.g., if it relies entirely on user tokens), consider setting `automountServiceAccountToken: false` where appropriate, or ensure its RBAC is tightly scoped.

### Container Security

Running the Headlamp container securely reduces the impact of a potential compromise.

* **Non-root User**: Configure the container to run as a non-root user. This prevents an attacker from easily gaining root access to the node if they break out of the container.
* **Drop Capabilities**: Drop unnecessary Linux capabilities (e.g., `ALL`) and add only what is strictly needed (often none).
* **Read-Only Filesystem**: Mount the root filesystem as read-only (`readOnlyRootFilesystem: true`) to prevent attackers from modifying application binaries or configurations at runtime.

### Network Security

Restrict network traffic to and from Headlamp.

* **NetworkPolicies**: Use Kubernetes NetworkPolicies to restrict ingress and egress traffic. Only allow traffic from the Ingress controller to Headlamp, and from Headlamp to the Kubernetes API server (and OIDC provider if needed).
* **Restricted Access**: If Headlamp is not meant to be public, ensure it is only accessible from trusted networks (e.g., via VPN or internal IP ranges).

### Keeping Headlamp Up to Date

Regularly update Headlamp to the latest version.

* **Update Cadence**: New versions of Headlamp often include security patches, dependency updates, and improvements.
* **Monitor Releases**: Watch the Headlamp repository for releases to stay informed about security advisories.

## Security Hardening Checklist

Use this checklist to audit an existing Headlamp installation.

- [ ] TLS enabled  
- [ ] Authentication enabled (OIDC configured)  
- [ ] No anonymous access allowed  
- [ ] Restricted RBAC (users do not have unnecessary `cluster-admin` privileges)  
- [ ] Headlamp ServiceAccount has minimal permissions  
- [ ] Non-root container execution configured  
- [ ] Linux capabilities dropped  
- [ ] Root filesystem is read-only  
- [ ] NetworkPolicies applied to restrict traffic  
- [ ] Headlamp version is up to date  
