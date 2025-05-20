---
title: AKS Cluster Setup with Azure Entra Login and Entra RBAC Using OAuth2Proxy
sidebar_label: "Tutorial: Headlamp on AKS with Azure Entra-ID Using OAuth2Proxy"
---

This guide explains how to secure your Azure Kubernetes Service (AKS) cluster with **Azure Entra ID** login and enforce **Entra RBAC** using **OAuth2Proxy** as an authentication proxy.

---

## Prerequisites

- Existing AKS cluster
- Azure CLI installed and logged in
- Helm installed locally
- Azure Entra ID tenant with permission to register applications
- Basic Kubernetes RBAC knowledge

---

## Step 1: Enable Azure Entra Authentication on Your AKS Cluster

Run this command to enable Azure Entra ID integration on your AKS cluster:

```bash
az aks update \
    --resource-group <ResourceGroupName> \
    --name <AKSClusterName> \
    --enable-aad \
    --aad-admin-group-object-ids <AdminGroupObjectID> \
    --aad-tenant-id <TenantID>
```

---

## Step 2: Register an OAuth2Proxy Application in Azure Entra

1. Go to the Azure Portal → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name your app (e.g., `aks-oauth2proxy`).
3. Set Redirect URI (Web) to:
   ```
   https://<your-oauth2proxy-domain>/oauth2/callback
   ```
4. Click **Register**.
5. Record the **Application (client) ID** and **Directory (tenant) ID**.

---

## Step 3: Configure API Permissions for OAuth2Proxy

1. Go to **API permissions** → **Add a permission**.
2. Choose **Microsoft Graph** → **Delegated permissions**.
3. Add: `openid`, `profile`, `email`.
4. Click **Grant admin consent**.

---

## Step 4: Create a Client Secret for OAuth2Proxy

1. Go to **Certificates & secrets** → **New client secret**.
2. Add and copy the value.

---

## Step 5: Create Kubernetes Secret to Store OAuth2Proxy Credentials

```bash
kubectl create secret generic oauth2proxy-secret \
  --from-literal=client-id=<ApplicationClientID> \
  --from-literal=client-secret=<ClientSecret> \
  --from-literal=cookie-secret=$(openssl rand -base64 16) \
  -n kube-system
```

---

## Step 6: Deploy OAuth2Proxy to AKS

Create a file `oauth2proxy-deployment.yaml` and apply it:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2proxy
  namespace: kube-system
spec:
  replicas: 1
  selector:
    matchLabels:
      app: oauth2proxy
  template:
    metadata:
      labels:
        app: oauth2proxy
    spec:
      containers:
      - name: oauth2proxy
        image: quay.io/oauth2-proxy/oauth2-proxy:v7.4.0
        args:
          - --provider=oidc
          - --client-id=$(CLIENT_ID)
          - --client-secret=$(CLIENT_SECRET)
          - --oidc-issuer-url=https://login.microsoftonline.com/<TenantID>/v2.0
          - --redirect-url=https://<your-oauth2proxy-domain>/oauth2/callback
          - --cookie-secret=$(COOKIE_SECRET)
          - --cookie-secure=true
          - --email-domain=*
          - --upstream=http://localhost:8001
          - --scope=openid email profile
          - --set-xauthrequest=true
        env:
          - name: CLIENT_ID
            valueFrom:
              secretKeyRef:
                name: oauth2proxy-secret
                key: client-id
          - name: CLIENT_SECRET
            valueFrom:
              secretKeyRef:
                name: oauth2proxy-secret
                key: client-secret
          - name: COOKIE_SECRET
            valueFrom:
              secretKeyRef:
                name: oauth2proxy-secret
                key: cookie-secret
        ports:
        - containerPort: 4180
---
apiVersion: v1
kind: Service
metadata:
  name: oauth2proxy
  namespace: kube-system
spec:
  type: ClusterIP
  ports:
  - port: 4180
    targetPort: 4180
  selector:
    app: oauth2proxy
```

Apply it:

```bash
kubectl apply -f oauth2proxy-deployment.yaml
```

---

## Step 7: Configure Ingress or Proxy to Use OAuth2Proxy

Route traffic through OAuth2Proxy to authenticate users before accessing Kubernetes services.

---

## Step 8: Set Kubernetes RBAC Policies Based on Azure Entra Groups

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: read-only-binding
subjects:
- kind: Group
  apiGroup: rbac.authorization.k8s.io
  name: "<AzureEntraGroupObjectID>"
roleRef:
  kind: ClusterRole
  name: view
  apiGroup: rbac.authorization.k8s.io
```

Apply:

```bash
kubectl apply -f your-rbac-binding.yaml
```

---

## Step 9: Test Authentication Flow

- Access your protected endpoint.
- Login via Entra.
- Validate RBAC access.

---
