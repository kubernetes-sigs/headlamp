---
title: OIDC Troubleshooting
sidebar_label: OIDC Troubleshooting
---

## Real-time updates not working (Ingress NGINX and large JWT tokens)

If real-time updates in Headlamp stop working after OIDC login, oversized JWT tokens are a common cause.

If your OIDC provider issues large JWT tokens (e.g., >8KB), WebSocket connections may fail or authentication headers may be truncated when Headlamp is behind an Ingress NGINX controller.

To resolve this, increase the header buffer size using the following annotation in your [NGINX Ingress](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/) resource:

```yaml
nginx.ingress.kubernetes.io/server-snippet: |-
  large_client_header_buffers 4 64k;
```

> **Note:** Regular HTTP requests may still work even with large tokens, but WebSocket connections are more sensitive to header size limits and will fail without this change.
