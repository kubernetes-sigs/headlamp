---
title: How to Set Up Headlamp in GKE with Google Identity Platform
sidebar_label: "Tutorial: Headlamp on GKE with Google Identity Platform"
---

This tutorial covers configuring Headlamp with Google Kubernetes Engine (GKE) and Google Identity Platform for authentication. This guide will also work with other OIDC-compliant identity providers such as:

1. [Microsoft Entra ID (Azure AD)](https://azure.microsoft.com/en-us/services/active-directory/)
2. [Auth0](https://auth0.com/)
3. [Okta](https://www.okta.com/)
4. [Keycloak](https://www.keycloak.org/)

## Prerequisites

- A GKE cluster running Kubernetes 1.24 or later
- Google Identity Platform configured and accessible
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed and configured
- [kubectl](https://kubernetes.io/docs/tasks/tools/) installed
- [Helm](https://helm.sh/docs/intro/install/) installed

## Step 1: Configure Google Identity Platform

The first step is to configure Google Identity Platform as your OIDC provider:

1. **Go to the [Google Cloud Console](https://console.cloud.google.com/)**
2. **Navigate to "APIs & Services" > "Credentials"**
3. **Click "Create Credentials" > "OAuth 2.0 Client IDs"**
4. **Configure the OAuth consent screen** if prompted:
   - Set the application name (e.g., "Headlamp Kubernetes Dashboard")
   - Add your domain to authorized domains
   - Configure scopes: `openid`, `profile`, `email`
5. **Set the application type to "Web application"**
6. **Add your redirect URI**: `https://your-headlamp-domain.com/oidc-callback`
7. **Note the Client ID and Client Secret**

The issuer URL for Google Identity Platform is:
```
https://accounts.google.com
```

### Google Identity Platform Configuration Details

| Setting | Value |
|---------|-------|
| Issuer URL | `https://accounts.google.com` |
| Username Claim | `email` |
| Groups Claim | `groups` (if using Google Workspace) |
| Scopes | `openid,profile,email` |

## Step 2: Configure GKE OIDC Authentication

GKE clusters can be configured to use OIDC for authentication. You'll need to configure the Kubernetes API server to trust your OIDC provider.

### Option A: Using gcloud (Recommended for new clusters)

If you're creating a new GKE cluster, you can enable OIDC during cluster creation:

```bash
gcloud container clusters create my-gke-cluster \
  --zone=<YOUR_ZONE> \
  --enable-identity-service
```

### Option B: Enable Identity Service for Existing Clusters

For existing clusters, you can enable the identity service using:

```bash
gcloud container clusters update ashu-headlamp \
  --zone=<YOUR_ZONE \
  --enable-identity-service
```

## Step 3: Configure OIDC via ClientConfig

GKE uses a `ClientConfig` resource to configure OIDC authentication. Create a `clientconfig.yaml` file with your OIDC configuration:

### Google Identity Platform Configuration

```yaml
apiVersion: authentication.gke.io/v2alpha1
kind: ClientConfig
metadata:
  name: default
  namespace: kube-public
spec:
  authentication:
  - name: oidc
    oidc:
      clientID: "your-google-client-id"
      clientSecret: "your-google-client-secret"
      groupPrefix: 'oidc:'
      groupsClaim: groups
      issuerURI: "https://accounts.google.com"
      kubectlRedirectURI: "http://localhost:8080/oidc-callback"
      scopes: "openid,email,profile"
      userClaim: email
      userPrefix: 'oidc:'
  certificateAuthorityData: <your-cluster-ca-cert>
  internalServer: ""
  name: your-cluster-name
  server: https://your-cluster-ip:443
```

### Microsoft Entra ID Configuration

```yaml
apiVersion: authentication.gke.io/v2alpha1
kind: ClientConfig
metadata:
  name: default
  namespace: kube-public
spec:
  authentication:
  - name: oidc
    oidc:
      clientID: "your-azure-client-id"
      clientSecret: "your-azure-client-secret"
      groupPrefix: 'oidc:'
      groupsClaim: groups
      issuerURI: "https://login.microsoftonline.com/your-tenant-id/v2.0"
      kubectlRedirectURI: "http://localhost:8080/oidc-callback"
      scopes: "openid,email,profile"
      userClaim: upn
      userPrefix: 'oidc:'
  certificateAuthorityData: <your-cluster-ca-cert>
  internalServer: ""
  name: your-cluster-name
  server: https://your-cluster-ip:443
```

Apply the ClientConfig to your cluster:

```bash
kubectl apply -f clientconfig.yaml
```

**Note**: Replace `<your-cluster-ca-cert>` with your actual cluster CA certificate and update the server URL and cluster name as needed.

## Step 4: Configure RBAC for OIDC Users

Create RBAC resources to grant permissions to users authenticated via Google Identity Platform:

```yaml
# cluster-role-binding.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: oidc-admin-binding
subjects:
- kind: User
  name: user@yourdomain.com
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
```

Apply the RBAC configuration:

```bash
kubectl apply -f cluster-role-binding.yaml
```

## Step 5: Deploy Headlamp with Google Identity Platform Configuration

Create a `values.yaml` file with your Google Identity Platform configuration:

```yaml
config:
  oidc:
    clientID: "your-google-client-id"
    clientSecret: "your-google-client-secret"
    issuerURL: "https://accounts.google.com"
    scopes: "openid,profile,email"
    # Use access token if your provider puts groups in access tokens
    useAccessToken: false
    # Optional: Override validation settings if needed
    # validatorClientID: "your-google-client-id"
    # validatorIssuerURL: "https://accounts.google.com"

# Optional: Configure ingress if using a load balancer
ingress:
  enabled: true
  className: "gce"
  annotations:
    kubernetes.io/ingress.class: "gce"
    kubernetes.io/ingress.global-static-ip-name: "headlamp-ip"
  hosts:
    - host: your-headlamp-domain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: headlamp-tls
      hosts:
        - your-headlamp-domain.com
```

Install Headlamp using Helm:

```bash
# Add the Headlamp Helm repository
helm repo add headlamp https://kubernetes-sigs.github.io/headlamp/

# Update the repository
helm repo update

# Install Headlamp with OIDC configuration
helm install headlamp headlamp/headlamp \
  --namespace headlamp \
  --create-namespace \
  -f values.yaml
```

## Step 6: Access Headlamp

### Option A: Using Port Forward (for testing)

```bash
kubectl port-forward svc/headlamp 8080:80 -n headlamp
```

Then access Headlamp at `http://localhost:8080`

## Step 7: Test Google Identity Platform Authentication

1. Navigate to your Headlamp URL
2. Click the "Sign in" button
3. You'll be redirected to Google's authentication page
4. Complete the authentication flow with your Google account
5. You should be redirected back to Headlamp and logged in

## Alternative: Microsoft Entra ID (Azure AD) Configuration

If you prefer to use Microsoft Entra ID instead of Google Identity Platform, here's how to configure it:

### Step 1: Configure Microsoft Entra ID

1. **Go to the [Azure Portal](https://portal.azure.com/)**
2. **Navigate to "Azure Active Directory" > "App registrations"**
3. **Click "New registration"**
4. **Configure the application**:
   - Name: "Headlamp Kubernetes Dashboard"
   - Supported account types: "Accounts in this organizational directory only"
   - Redirect URI: Web > `https://your-headlamp-domain.com/oidc-callback`
5. **Note the Application (client) ID and Directory (tenant) ID**
6. **Create a client secret**:
   - Go to "Certificates & secrets"
   - Click "New client secret"
   - Note the secret value

### Step 2: Configure GKE for Microsoft Entra ID

```bash
gcloud container clusters update <CLUSTER_NAME> \
    --zone=<YOUR_CLUSTER_ZONE> \
    --enable-identity-service 
```

### Step 3: Headlamp Configuration for Microsoft Entra ID

```yaml
config:
  oidc:
    clientID: "your-azure-client-id"
    clientSecret: "your-azure-client-secret"
    issuerURL: "https://login.microsoftonline.com/your-tenant-id/v2.0"
    scopes: "openid,profile,email"
    # Microsoft Entra ID puts groups in access tokens by default
    useAccessToken: true
    # Optional: Override validation settings if needed
    validatorClientID: "6f009577-59e4-4130-a730-e539cf27f227"
    validatorIssuerURL: "https://sts.windows.net/dc0c72af-4fdf-48d1-9881-925ceffc64db"

# Optional: Configure ingress if using a load balancer
ingress:
  enabled: true
  className: "gce"
  annotations:
    kubernetes.io/ingress.class: "gce"
    kubernetes.io/ingress.global-static-ip-name: "headlamp-ip"
  hosts:
    - host: your-headlamp-domain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: headlamp-tls
      hosts:
        - your-headlamp-domain.com
```

### Microsoft Entra ID Configuration Details

| Setting | Value |
|---------|-------|
| Issuer URL | `https://login.microsoftonline.com/your-tenant-id/v2.0` |
| Username Claim | `upn` (User Principal Name) |
| Groups Claim | `groups` |
| Scopes | `openid,profile,email` |
| Use Access Token | `true` (groups are in access tokens) |

## Troubleshooting

### Common Issues

1. **"Invalid scope" error**:
   - Ensure your OIDC provider supports the requested scopes
   - Check that the scopes are properly configured in your OIDC provider

2. **"Invalid redirect URI" error**:
   - Verify the redirect URI in your OIDC provider matches exactly: `https://your-domain.com/oidc-callback`
   - Check for trailing slashes or protocol mismatches

3. **"Token validation failed" error**:
   - Verify the issuer URL is correct
   - Check that the client ID matches between Headlamp and your OIDC provider
   - Ensure the OIDC provider's certificate is trusted

4. **"Access denied" after authentication**:
   - Check that RBAC is properly configured for your user
   - Verify the username claim matches the user's identity in your OIDC provider

### Debugging Steps

1. **Check Headlamp logs**:
   ```bash
   kubectl logs -f deployment/headlamp -n headlamp
   ```

2. **Verify OIDC configuration**:
   ```bash
   kubectl get configmap -n headlamp -o yaml
   ```

3. **Test OIDC provider directly**:
   - Use a tool like [jwt.io](https://jwt.io/) to decode tokens
   - Verify the token contains the expected claims

