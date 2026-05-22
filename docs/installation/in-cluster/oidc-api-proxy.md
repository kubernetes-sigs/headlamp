---
title: OIDC API Proxy
sidebar_label: OIDC API Proxy
---

Some organisations front their Kubernetes API server with an OIDC-aware reverse
proxy (for example [kube-oidc-proxy](https://github.com/jetstack/kube-oidc-proxy)
or a custom gateway) that validates bearer tokens centrally before forwarding
requests to the kube-apiserver. Headlamp's **OIDC API proxy** feature lets you
point Headlamp at that gateway instead of the kube-apiserver directly, so that
the existing OIDC token issued to the browser is used end-to-end.

## How it works

When `APIProxy` is configured, Headlamp's internal reverse proxy targets the
gateway URL instead of `cluster.server` from the kubeconfig. The OIDC bearer
token that is already stored in the per-cluster session cookie is forwarded in
the `Authorization: Bearer <token>` header — exactly what the proxy expects.
No additional credentials or client certificates are required.

When `APIProxy` is **not** set the behaviour is byte-identical to the default:
the feature is strictly opt-in and additive.

## Configuration

### Option A — CLI flags (in-cluster deployment)

Use these flags when running Headlamp in-cluster and you want every request for
the in-cluster context to go through the proxy.

| Flag | Environment variable | Default | Description |
|---|---|---|---|
| `--oidc-api-proxy` | `HEADLAMP_CONFIG_OIDC_API_PROXY` | *(empty)* | URL of the external Kubernetes API proxy. |
| `--oidc-api-proxy-ca-file` | `HEADLAMP_CONFIG_OIDC_API_PROXY_CA_FILE` | *(empty)* | Path to a PEM-encoded CA bundle used to verify the proxy's TLS certificate. |
| `--oidc-api-proxy-skip-tls-verify` | `HEADLAMP_CONFIG_OIDC_API_PROXY_SKIP_TLS_VERIFY` | `false` | Disable TLS verification for the proxy connection. **Testing only.** |

Example:

```bash
headlamp-server \
  --in-cluster \
  --oidc-client-id=my-client \
  --oidc-idp-issuer-url=https://dex.example.com \
  --oidc-api-proxy=https://api-proxy.example.com/kubernetes \
  --oidc-api-proxy-ca-file=/etc/headlamp/proxy-ca.pem
```

#### Helm

Pass the flags via `extraArgs` in your `values.yaml`:

```yaml
extraArgs:
  - --oidc-api-proxy=https://api-proxy.example.com/kubernetes
  - --oidc-api-proxy-ca-file=/etc/headlamp/proxy-ca.pem
```

Mount the CA file with a Kubernetes Secret and a volume:

```yaml
extraVolumes:
  - name: proxy-ca
    secret:
      secretName: headlamp-proxy-ca

extraVolumeMounts:
  - name: proxy-ca
    mountPath: /etc/headlamp
    readOnly: true
```

---

### Option B — kubeconfig `auth-provider` (per-cluster)

Use this approach when you manage multiple clusters via a kubeconfig file and
only specific clusters should use a proxy.

```yaml
users:
- name: my-user
  user:
    auth-provider:
      name: oidc
      config:
        client-id: my-client
        client-secret: my-secret
        idp-issuer-url: https://dex.example.com
        scope: "profile,email"
        # api-proxy fields
        api-proxy: https://api-proxy.example.com/kubernetes
        api-proxy-ca-data: <base64-encoded PEM CA bundle>
        api-proxy-skip-tls-verify: "false"
```

| Key | Required | Description |
|---|---|---|
| `api-proxy` | yes (to enable) | URL of the external Kubernetes API proxy. |
| `api-proxy-ca-data` | no | Base64-encoded PEM CA bundle for the proxy TLS certificate. |
| `api-proxy-skip-tls-verify` | no | `"true"` to skip TLS verification. **Testing only.** |

To base64-encode your CA file:

```bash
base64 -w 0 /path/to/proxy-ca.pem
```

---

## TLS configuration

The api-proxy transport uses its **own** TLS settings, completely independent
of the kube-apiserver client certificate or CA:

- If `api-proxy-ca-file` / `api-proxy-ca-data` is provided, only that CA bundle
  is used to verify the proxy's certificate (instead of the system roots).
- If neither is provided, the system CA pool is used.
- `api-proxy-skip-tls-verify` / `api-proxy-ca-file` are validated at startup;
  an invalid CA file causes Headlamp to exit with an error.

## HTTP/2 note

HTTP/2 is intentionally **disabled** for the api-proxy transport. External
proxies frequently send `GOAWAY` frames to rebalance connections; once the
request body has been written the Go HTTP/2 client cannot retry and surfaces:

```
http2: Transport received Server's graceful shutdown GOAWAY
```

HTTP/1.1 retries this transparently. Headlamp forces HTTP/1.1 by setting an
empty `TLSNextProto` map (which prevents the automatic `h2` ALPN upgrade over
TLS) and leaving `ForceAttemptHTTP2 = false`.

## Security considerations

- `--oidc-api-proxy-skip-tls-verify` / `api-proxy-skip-tls-verify: "true"` are
  intended **for local testing only**. A `WARN` log is emitted at startup when
  this option is set.
- The proxy must be deployed so that it cannot be bypassed (e.g., via network
  policy) and must strip or reject any pre-existing `Authorization` headers from
  untrusted sources before forwarding to the kube-apiserver.
- The OIDC bearer token is forwarded as-is; ensure your proxy validates it
  against the correct OIDC issuer and audience.
