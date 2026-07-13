---
title: TLS and TLS pass through
sidebar_label: TLS
---

## TLS Termination at Headlamp Backend

Headlamp supports optional TLS termination at the backend server. This terminating TLS either at the ingress (default) or directly at the Headlamp container, enabling use cases such as NGINX TLS passthrough and transport server.

### Enabling TLS at the Backend

To enable TLS termination at the Headlamp backend, set the following environment variables in your deployment or container:

- `HEADLAMP_CONFIG_TLS_CERT_PATH=/path/to/tls.crt` — Path to the TLS certificate file
- `HEADLAMP_CONFIG_TLS_KEY_PATH=/path/to/tls.key` — Path to the TLS private key file

Instead of environment variables you could also add arguments `-tls-cert-path` and `-tls-key-path` to headlamp-server.


Example (Kubernetes manifest snippet):

```yaml
containers:
  - name: headlamp
    image: ...
    env:
      ...
    #   - name: HEADLAMP_CONFIG_TLS_CERT_PATH
    #     value: "/certs/tls.crt"
    #   - name: HEADLAMP_CONFIG_TLS_KEY_PATH
    #     value: "/certs/tls.key"
    args:
      ...
      - "-tls-cert-path=/certs/tls.crt"
      - "-tls-key-path=/certs/tls.key"
    volumeMounts:
      - name: certs
        mountPath: /certs
volumes:
  - name: certs
    secret:
      secretName: headlamp-tls
```

### Headlamp Helm Chart Example

If you are using the headlamp helm chart, you can configure it like this:

```yaml
config:
  tlsCertPath: "/headlamp-cert/headlamp-ca.crt"
  tlsKeyPath: "/headlamp-cert/headlamp-tls.key"

volumes:
  - name: "headlamp-cert"
    secret:
      secretName: "headlamp-tls"
      items:
        - key: "tls.crt"
          path: "headlamp-ca.crt"
        - key: "tls.key"
          path: "headlamp-tls.key"

volumeMounts:
  - name: "headlamp-cert"
    mountPath: "/headlamp-cert"
```

### Notes

- If `HEADLAMP_CONFIG_TLS_CERT_PATH` and `HEADLAMP_CONFIG_TLS_KEY_PATH` are not set, Headlamp will listen without TLS (default behavior).
- You can now use NGINX or other ingress controllers in TLS passthrough mode, letting Headlamp terminate TLS.

### Optional Compatibility

- This feature is optional and fully backward compatible. If you do not set these variables, Headlamp will continue to expect TLS termination at the ingress.

### See Also

- [In-cluster installation guide](https://headlamp.dev/docs/latest/installation/in-cluster/)
- [Kubernetes TLS Secrets](https://kubernetes.io/docs/concepts/configuration/secret/#tls-secrets)
