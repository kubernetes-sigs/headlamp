---
title: Accessing using Identity-Aware Proxies
sidebar_label: Identity-Aware Proxy
---

Headlamp can be placed behind an identity-aware proxy (IAP) such as [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/) or Google Cloud IAP. When configured, Headlamp will trust the user information provided by the proxy via HTTP headers and seamlessly bypass the internal login screen. When identity aware proxy is enabled, the proxy should be trustable. This means that the proxy should be deployed in a way that it is not exposed to the public internet and that it is not possible for an attacker to impersonate the proxy. The proxy should also be configured to inject the correct headers into the request to Headlamp. Backend does not maintain any persistent session, it relies on the headers injected. 
**Important:** the trusted proxy or ingress must strip, reject, or overwrite any incoming client-supplied identity headers before forwarding the request to Headlamp. This includes the default `X-Forwarded-*` headers as well as any custom headers configured with `-proxy-auth-username-header`, `-proxy-auth-group-header`, `-proxy-auth-email-header`, or `-proxy-auth-token-header`. Otherwise, a client could spoof these headers and impersonate another user if Headlamp is reachable without that protection at the edge.

## Configuration

To enable identity-aware proxy authentication, set the following argument or environment variable on the Headlamp server:

- `-proxy-auth=true` or env var `HEADLAMP_CONFIG_PROXY_AUTH=true`

By default, Headlamp expects the proxy to pass the authenticated username in the `X-Forwarded-User` header. If a valid username is found, Headlamp backend establishes a session for that user based on the token passed in. UI treats the request as authenticated based on trusted headers and bypasses the login screen. 

You can customize the headers Headlamp looks for using the following flags:

- `-proxy-auth-username-header`: Header name for the username (default: `X-Forwarded-User`)
- `-proxy-auth-group-header`: Header name for the user's groups (default: `X-Forwarded-Group`)
- `-proxy-auth-email-header`: Header name for the user's email (default: `X-Forwarded-Email`)
- `-proxy-auth-token-header`: Header name for the user's token (default: `X-Forwarded-Id-Token`)

### Kubernetes API Server Authentication

When using an identity-aware proxy for the Headlamp UI, Headlamp still needs a way to authenticate with the Kubernetes API Server on behalf of the user. 

By default, Headlamp will use its own in-cluster Service Account (or provided kubeconfig) to talk to the API Server. The proxy handles user identification for the UI, but Headlamp handles Kubernetes authorization.

If you instead want Headlamp to forward the proxy's authentication token directly to the Kubernetes API Server (for example, if your proxy issues valid Kubernetes OIDC `id_token`s), you can specify the header containing the raw token value:

 - `-proxy-auth-token-header`: Header name containing the raw token only (default: `X-Forwarded-Id-Token`). Do not include the `Bearer ` prefix in the header value. If set, Headlamp will extract the token and send it as `Authorization: Bearer <token>` for requests to the Kubernetes API Server.

## Example: Traefik and oauth2-proxy Middleware

A common pattern in Kubernetes is to use an Ingress Controller like Traefik alongside `oauth2-proxy` as an authentication middleware (ForwardAuth).

In this setup:
1. A user attempts to access Headlamp via Traefik.
2. Traefik sends the request to `oauth2-proxy` for authentication.
3. `oauth2-proxy` authenticates the user with your designated Identity Provider (OIDC, GitHub, Google, etc.).
4. `oauth2-proxy` returns a successful response to Traefik, injecting headers like `X-Forwarded-User` and `X-Forwarded-Email`.
5. Traefik forwards the original request, along with the injected user headers, to Headlamp.
6. Headlamp reads `X-Forwarded-User`, logs the user in, and serves the UI.

### 1. Deploy OAuth2Proxy via Helm

#### Add the Helm repo:
```bash
helm repo add oauth2-proxy https://oauth2-proxy.github.io/manifests
helm repo update
```

#### Prepare your `values.yaml`

Below is an example configuration you can start with. Be sure to replace placeholders like `<Client-ID>`, `<Client-Secret>`, `<Tenant-ID>`, etc.

```yaml
config:
  configFile: |-
    email_domains = ["*"]
    cookie_secret = <Cookie-Secret>

alphaConfig:
  enabled: true
  configData:
    injectResponseHeaders:
      - name: Authorization
        values:
          - claim: access_token
            prefix: 'Bearer '
      - name: X-Forwarded-Id-Token
        values:
          - claimSource:
              claim: id_token
      - name: X-Forwarded-Email
        values:
          - claimSource:
              claim: email
      - name: X-Forwarded-Group
        values:
          - claimSource:
              claim: groups
    providers:
    - id: entra
      provider: oidc
      clientID: "<clientid>"
      clientSecret: "<clientsecret>"
      loginURL: "https://login.microsoftonline.com/<tenantid>/oauth2/authorize"
      redeemURL: "https://login.microsoftonline.com/<tenantid>/oauth2/token"
      scope: "openid email profile"
      oidcConfig:
        issuerURL: "https://sts.windows.net/<tenantid>/"
        jwksURL: "https://login.microsoftonline.com/<tenantid>/discovery/keys?appid=<clientid>"
        insecureAllowUnverifiedEmail: true
        skipDiscovery: true
        emailClaim: upn
        audienceClaims:
        - aud
extraArgs:
  redirect-url: "https://oauth.example.com/oauth2/callback" 
  reverse-proxy: "true" 
  cookie-secure: "true"
  cookie-samesite: "lax"
  cookie-domain: ".example.com"
  whitelist-domain: ".example.com"
```

#### Deploy OAuth2Proxy:
```bash
helm install my-release oauth2-proxy/oauth2-proxy -f values.yaml
```

Verify it's up:
```bash
kubectl get pods
```

---
### 2. Configure Traefik ForwardAuth

Create a Traefik `Middleware` and `Ingress` that points to your `oauth2-proxy` service, ensuring it forwards the authentication headers:

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: headlamp-proxy-auth
  namespace: oauth2-proxy
spec:
  forwardAuth:
    address: http://oauth2-proxy.auth-namespace.svc.cluster.local:4180/oauth2/auth
    trustForwardHeader: true
    authResponseHeaders:
      - X-Forwarded-User
      - X-Forwarded-Email
      - X-Forwarded-Group
      - X-Forwarded-Id-Token

---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: headlamp-error-redir
  namespace: oauth2-proxy
spec:
  errors:
    # 401 is what the ForwardAuth middleware returns when not logged in
    status:
      - "401-403"
    # This sends the user to the login start page and preserves their original URL
    query: "/oauth2/sign_in?rd=https://headlamp.example.com{url}"
    service:
      name: oauth2-proxy 
      port: 80

---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: auth-headers
  namespace: oauth2-proxy
spec:
  headers:
    sslRedirect: true
    stsSeconds: 315360000
    browserXssFilter: true
    contentTypeNosniff: true
    forceSTSHeader: true
    sslHost: example.com
    stsIncludeSubdomains: true
    stsPreload: true
    frameDeny: true

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
    traefik.ingress.kubernetes.io/router.middlewares: oauth2-proxy-auth-headers@kubernetescrd
  name: headlamp-oauth2
  namespace: oauth2-proxy
spec:
  ingressClassName: traefik-mgmt-blue
  rules:
  - host: headlamp.example.com
    http:
      paths:
      - backend:
          service:
            name: oauth2-proxy
            port:
              number: 80
        path: /oauth2/
        pathType: Prefix
```

### 3. Configure Headlamp Ingress and Deployment

Attach the middleware to your Headlamp `IngressRoute` and ensure the Headlamp deployment has `-proxy-auth=true` enabled:

```yaml
# Headlamp IngressRoute
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
    traefik.ingress.kubernetes.io/router.middlewares: oauth2-proxy-headlamp-error-redir@kubernetescrd,oauth2-proxy-headlamp-proxy-auth@kubernetescrd
  name: headlamp
  namespace: kube-system
spec:
  ingressClassName: traefik
  rules:
  - host: headlamp.example.com
    http:
      paths:
      - backend:
          service:
            name: headlamp
            port:
              number: 80
```

### 4. Deploy Headlamp with the `proxy-auth` flag enabled:

```yaml
# Headlamp Helm Values (values.yaml)
config:
  extraArgs:
    - "-proxy-auth=true"
```
