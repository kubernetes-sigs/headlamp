# GCP OAuth Setup for GKE Deployments

This guide covers how to configure GCP OAuth authentication for Headlamp when deploying to Google Kubernetes Engine (GKE).

## Overview

This implementation adds GCP OAuth 2.0 authentication support to Headlamp, replacing the deprecated Identity Service for GKE. Users authenticate with their Google Cloud account, and the authentication tokens are used to access Kubernetes resources with proper RBAC.

## Architecture

### Authentication Flow

1. **User Login**: User clicks "Sign in with Google" in Headlamp UI
2. **OAuth Redirect**: User is redirected to Google's OAuth consent screen
3. **Authorization**: User authorizes Headlamp to access their GCP account
4. **Callback**: Google redirects back to Headlamp with authorization code
5. **Token Exchange**: Headlamp exchanges code for access/refresh tokens
6. **K8s API Access**: Tokens are used to authenticate with Kubernetes API
7. **RBAC Authorization**: Kubernetes RBAC evaluates permissions based on user's GCP identity

### Components

#### Backend Changes

1. **GCP Authenticator** (`backend/pkg/gcp/auth.go`)
   - Implements OAuth 2.0 flow with Google
   - PKCE (Proof Key for Code Exchange) support for enhanced security
   - Token refresh and caching mechanisms
   - GKE cluster detection

2. **Route Handlers** (`backend/pkg/auth/gcp.go`)
   - `/gcp-auth/login`: Initiates OAuth flow
   - `/gcp-auth/callback`: Handles OAuth callback
   - `/gcp-auth/refresh`: Refreshes expired tokens
   - `/gcp-auth/enabled`: Check if GCP OAuth is enabled

3. **Configuration** (`backend/pkg/config/config.go`)
   - `GCPOAuthEnabled`: Enable/disable GCP OAuth
   - `GCPClientID`: OAuth 2.0 Client ID
   - `GCPClientSecret`: OAuth 2.0 Client Secret
   - `GCPRedirectURL`: Callback URL for OAuth flow

#### Frontend Changes

1. **GCP Login Button** (`frontend/src/components/cluster/GCPLoginButton.tsx`)
   - React component that renders "Sign in with Google" button
   - Automatically shown for GKE clusters or when backend OAuth is enabled

2. **Auth Chooser** (`frontend/src/components/authchooser/index.tsx`)
   - Shows authentication options including GCP OAuth
   - Prevents auto-redirect to token page to allow users to choose auth method

## Prerequisites

1. GKE cluster up and running
2. `kubectl` configured to access your cluster
3. Google Cloud Console access with permissions to create OAuth credentials

## Step 1: Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
2. Select your project (can be different from your GKE cluster project)
3. Click **"Create Credentials"** → **"OAuth client ID"**
4. Choose **"Web application"**
5. Configure the OAuth client:
   - **Name**: `headlamp-gke-auth` (or your preferred name)
   - **Authorized JavaScript origins**: Leave empty (not needed)
   - **Authorized redirect URIs**: Add your deployment URL(s):
     - For LoadBalancer with IP: `http://<EXTERNAL_IP>/gcp-auth/callback`
     - For custom domain: `http://your-domain.com/gcp-auth/callback`
     - For HTTPS (if configured): `https://your-domain.com/gcp-auth/callback`
     - For local testing: `http://localhost:4466/gcp-auth/callback`
6. Click **"Create"**
7. **Save the Client ID and Client Secret** - you'll need these for the next step

## Step 2: Create Kubernetes Secret

Store your OAuth credentials securely in a Kubernetes Secret:

```bash
# Replace with your actual credentials
kubectl create secret generic gcp-oauth-credentials \
  --from-literal=client-id='YOUR_CLIENT_ID.apps.googleusercontent.com' \
  --from-literal=client-secret='YOUR_CLIENT_SECRET' \
  -n headlamp
```

**Important**: Never commit these credentials to version control or hardcode them in deployment files.

## Step 3: Configure Headlamp Deployment

Update your Headlamp deployment to enable GCP OAuth:

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
      app: headlamp
  template:
    metadata:
      labels:
        app: headlamp
    spec:
      containers:
      - name: headlamp
        image: ghcr.io/kubernetes-sigs/headlamp:latest  # Or a specific version tag
        ports:
        - containerPort: 4466
        env:
        # Enable GCP OAuth
        - name: HEADLAMP_CONFIG_GCP_OAUTH_ENABLED
          value: "true"

        # OAuth Client ID (from Secret)
        - name: HEADLAMP_CONFIG_GCP_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: gcp-oauth-credentials
              key: client-id

        # OAuth Client Secret (from Secret)
        - name: HEADLAMP_CONFIG_GCP_CLIENT_SECRET
          valueFrom:
            secretKeyRef:
              name: gcp-oauth-credentials
              key: client-secret

        # Redirect URL - MUST match what you configured in Google Cloud Console
        - name: HEADLAMP_CONFIG_GCP_REDIRECT_URL
          value: "http://YOUR_DOMAIN/gcp-auth/callback"

        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
```

## Step 4: Expose Headlamp with LoadBalancer

Create a LoadBalancer service to expose Headlamp:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: headlamp
  namespace: headlamp
spec:
  type: LoadBalancer
  selector:
    app: headlamp
  ports:
  - port: 80
    targetPort: 4466
    protocol: TCP
```

Apply the service:

```bash
kubectl apply -f headlamp-service.yaml
```

Get the external IP:

```bash
kubectl get svc headlamp -n headlamp
```

Wait for `EXTERNAL-IP` to be assigned (not `<pending>`).

## Step 5: Update Redirect URL

Once you have the external IP, update your deployment's redirect URL:

### Option A: Using External IP Directly

**Note**: Google OAuth doesn't allow IP addresses as redirect URIs. You'll need to use a domain name service like nip.io:

```bash
# Get your LoadBalancer IP
EXTERNAL_IP=$(kubectl get svc headlamp -n headlamp -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Update the redirect URL to use nip.io
kubectl set env deployment/headlamp \
  HEADLAMP_CONFIG_GCP_REDIRECT_URL="http://headlamp.${EXTERNAL_IP}.nip.io/gcp-auth/callback" \
  -n headlamp
```

Then add this redirect URI to your OAuth client in Google Cloud Console:
- `http://headlamp.<EXTERNAL_IP>.nip.io/gcp-auth/callback`

### Option B: Using Custom Domain

If you have a custom domain pointing to your LoadBalancer IP:

```bash
kubectl set env deployment/headlamp \
  HEADLAMP_CONFIG_GCP_REDIRECT_URL="http://your-domain.com/gcp-auth/callback" \
  -n headlamp
```

Then add this redirect URI to your OAuth client:
- `http://your-domain.com/gcp-auth/callback`

## Step 6: Verify Configuration

Check that all environment variables are set correctly:

```bash
kubectl get deployment headlamp -n headlamp -o jsonpath='{.spec.template.spec.containers[0].env}' | jq
```

You should see:
- `HEADLAMP_CONFIG_GCP_OAUTH_ENABLED=true`
- `HEADLAMP_CONFIG_GCP_CLIENT_ID` (from secret)
- `HEADLAMP_CONFIG_GCP_CLIENT_SECRET` (from secret)
- `HEADLAMP_CONFIG_GCP_REDIRECT_URL` (your configured URL)

Check that the pod is running:

```bash
kubectl get pods -n headlamp
kubectl logs -n headlamp -l app=headlamp --tail=20
```

## Step 7: Configure RBAC for GCP Users

After OAuth is configured, you need to grant Kubernetes permissions to your GCP users. When users authenticate via GCP OAuth, their Google email becomes their Kubernetes username.

### Example 1: Grant Cluster Admin to a Single User

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: gcp-user-admin
subjects:
- kind: User
  name: alice@example.com  # User's Google email
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
```

Apply it:
```bash
kubectl apply -f gcp-user-admin.yaml
```

### Example 2: Grant Read-Only Access to Multiple Users

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: gcp-users-view
subjects:
- kind: User
  name: bob@example.com
  apiGroup: rbac.authorization.k8s.io
- kind: User
  name: charlie@example.com
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: view  # Built-in read-only role
  apiGroup: rbac.authorization.k8s.io
```

### Example 3: Namespace-Specific Permissions

Grant a user edit permissions only in specific namespaces:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: gcp-user-dev-edit
  namespace: development
subjects:
- kind: User
  name: developer@example.com
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: edit  # Built-in edit role
  apiGroup: rbac.authorization.k8s.io
```

### Example 4: Custom Role for Specific Resources

Create a custom role for limited access:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: gcp-user-pod-reader
subjects:
- kind: User
  name: auditor@example.com
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

### Example 5: Group-Based Permissions (Google Groups)

If using Google Workspace, you can grant permissions to entire groups:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: gcp-group-admins
subjects:
- kind: Group
  name: admins@example.com  # Google Group email
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
```

### Built-in Kubernetes Roles

Common built-in ClusterRoles you can use:

| Role | Permissions | Use Case |
|------|-------------|----------|
| `cluster-admin` | Full access to all resources | Cluster administrators |
| `admin` | Full access within a namespace | Namespace administrators |
| `edit` | Read/write access to most resources | Developers |
| `view` | Read-only access to most resources | Auditors, viewers |

### Verify User Permissions

After setting up RBAC, verify that users have the correct permissions:

```bash
# Check what user can do
kubectl auth can-i list pods --as=alice@example.com
kubectl auth can-i create deployments --as=alice@example.com --namespace=production

# List all permissions for a user
kubectl auth can-i --list --as=alice@example.com
```

### Important RBAC Notes

1. **User Identification**: The `name` field in RBAC must match the user's Google email exactly
2. **Case Sensitive**: Email addresses are case-sensitive in Kubernetes RBAC
3. **Minimum Permissions**: Start with minimal permissions and add more as needed
4. **Service Accounts**: The Headlamp pod itself still needs a ServiceAccount for cluster operations
5. **Testing**: Always test permissions after creating RBAC rules

## Step 8: Test the OAuth Flow

1. Navigate to your Headlamp deployment:
   - With nip.io: `http://headlamp.<EXTERNAL_IP>.nip.io`
   - With custom domain: `http://your-domain.com`

2. You should see the authentication page with:
   - "Sign in with Google" button
   - "Use A Token" button (fallback option)

3. Click **"Sign in with Google"**

4. Authorize the application with your Google account

5. You should be redirected back to Headlamp and authenticated

## Configuration Reference

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `HEADLAMP_CONFIG_GCP_OAUTH_ENABLED` | Enable GCP OAuth feature | `"true"` |
| `HEADLAMP_CONFIG_GCP_CLIENT_ID` | OAuth 2.0 Client ID from Google Cloud Console | `"123456789-abc.apps.googleusercontent.com"` |
| `HEADLAMP_CONFIG_GCP_CLIENT_SECRET` | OAuth 2.0 Client Secret from Google Cloud Console | `"GOCSPX-xxxxxxxxxxxxx"` |
| `HEADLAMP_CONFIG_GCP_REDIRECT_URL` | Callback URL for OAuth flow | `"http://headlamp.35.232.228.61.nip.io/gcp-auth/callback"` |

### Important Notes

1. **Redirect URL Must Match Exactly**
   - The `HEADLAMP_CONFIG_GCP_REDIRECT_URL` must match what you configured in Google Cloud Console
   - Include the protocol (`http://` or `https://`)
   - Include the full path: `/gcp-auth/callback`

2. **IP Address Limitation**
   - Google OAuth doesn't allow bare IP addresses as redirect URIs
   - Use a service like nip.io for IP-based access: `http://headlamp.<IP>.nip.io`
   - Or configure a proper DNS domain

3. **HTTPS Considerations**
   - The example uses HTTP for simplicity
   - For production, configure HTTPS with proper TLS certificates
   - Update redirect URL to `https://` when HTTPS is enabled

4. **Secrets Management**
   - Always store OAuth credentials in Kubernetes Secrets
   - Never commit credentials to version control
   - Rotate credentials periodically

## Troubleshooting

### "Sign in with Google" Button Not Appearing

**Check:**
1. Environment variable is set: `HEADLAMP_CONFIG_GCP_OAUTH_ENABLED=true`
2. Pod has restarted after configuration changes
3. Backend logs for any errors:
   ```bash
   kubectl logs -n headlamp -l app=headlamp | grep -i "gcp\|oauth"
   ```

**Test the endpoint:**
```bash
curl http://<YOUR_URL>/gcp-auth/enabled
# Should return: {"enabled":true}
```

### redirect_uri_mismatch Error

**Problem**: OAuth fails with "Error 400: redirect_uri_mismatch"

**Solution**:
1. Check the exact redirect URI being sent (look at browser URL when error occurs)
2. Go to Google Cloud Console → Credentials → Your OAuth Client
3. Add the **exact** redirect URI (including protocol and path)
4. Wait a few minutes for Google's changes to propagate

### Authentication Succeeds But Can't Access Kubernetes API

**Problem**: Login works but you see permission errors in Headlamp

**Solution**: Configure Kubernetes RBAC for your GCP user:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: gcp-user-admin
subjects:
- kind: User
  name: your-email@gmail.com  # Your GCP account email
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: cluster-admin  # Or a more restrictive role
  apiGroup: rbac.authorization.k8s.io
```

Apply it:
```bash
kubectl apply -f rbac.yaml
```

### Browser HSTS Issues (Domain Redirects to HTTPS)

**Problem**: Custom domain redirects to HTTPS but only HTTP is available

**Solution**:
1. Clear browser HSTS cache:
   - Chrome: `chrome://net-internals/#hsts` → Delete domain
   - Firefox: Clear all browsing data
2. Use a different domain without HSTS cached
3. Or configure HTTPS on your LoadBalancer

### Pod Crashes or Restarts

**Check logs:**
```bash
kubectl logs -n headlamp -l app=headlamp --previous
kubectl describe pod -n headlamp -l app=headlamp
```

**Common issues:**
- Invalid OAuth credentials
- Missing environment variables
- Memory/CPU resource constraints

## Security Best Practices

1. **Use Kubernetes Secrets** for OAuth credentials
2. **Enable HTTPS** in production with valid TLS certificates
3. **Restrict RBAC** - don't give all users cluster-admin
4. **Rotate credentials** periodically
5. **Use Private GKE clusters** when possible
6. **Enable Workload Identity** for enhanced security
7. **Monitor OAuth usage** through Google Cloud Console

## Example: Complete Deployment

Here's a complete example combining all components:

```bash
# 1. Create namespace
kubectl create namespace headlamp

# 2. Create OAuth credentials secret
kubectl create secret generic gcp-oauth-credentials \
  --from-literal=client-id='YOUR_CLIENT_ID.apps.googleusercontent.com' \
  --from-literal=client-secret='YOUR_CLIENT_SECRET' \
  -n headlamp

# 3. Apply deployment (save as headlamp-deployment.yaml)
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: headlamp
  namespace: headlamp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: headlamp
  template:
    metadata:
      labels:
        app: headlamp
    spec:
      containers:
      - name: headlamp
        image: ghcr.io/kubernetes-sigs/headlamp:latest
        ports:
        - containerPort: 4466
        env:
        - name: HEADLAMP_CONFIG_GCP_OAUTH_ENABLED
          value: "true"
        - name: HEADLAMP_CONFIG_GCP_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: gcp-oauth-credentials
              key: client-id
        - name: HEADLAMP_CONFIG_GCP_CLIENT_SECRET
          valueFrom:
            secretKeyRef:
              name: gcp-oauth-credentials
              key: client-secret
        - name: HEADLAMP_CONFIG_GCP_REDIRECT_URL
          value: "http://REPLACE_WITH_YOUR_URL/gcp-auth/callback"
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: headlamp
  namespace: headlamp
spec:
  type: LoadBalancer
  selector:
    app: headlamp
  ports:
  - port: 80
    targetPort: 4466
EOF

# 4. Wait for LoadBalancer IP
kubectl get svc headlamp -n headlamp -w

# 5. Get the IP and update redirect URL
EXTERNAL_IP=$(kubectl get svc headlamp -n headlamp -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Your Headlamp URL: http://headlamp.${EXTERNAL_IP}.nip.io"

# 6. Update redirect URL
kubectl set env deployment/headlamp \
  HEADLAMP_CONFIG_GCP_REDIRECT_URL="http://headlamp.${EXTERNAL_IP}.nip.io/gcp-auth/callback" \
  -n headlamp

# 7. Add this URL to Google Cloud Console OAuth client:
echo "Add this redirect URI to Google Cloud Console:"
echo "http://headlamp.${EXTERNAL_IP}.nip.io/gcp-auth/callback"
```

## Related Documentation

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [GKE Authentication](https://cloud.google.com/kubernetes-engine/docs/how-to/api-server-authentication)
