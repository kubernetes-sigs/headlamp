# TLS Termination at Headlamp Backend

Headlamp now supports optional TLS termination at the backend server. This allows you to terminate TLS either at the ingress (default) or directly at the Headlamp container, enabling use cases such as NGINX TLS passthrough and transport server.

## Enabling TLS at the Backend

To enable TLS termination at the Headlamp backend, set the following environment variables in your deployment or container:

- `HEADLAMP_ENABLE_TLS=true` — Enable TLS termination at the backend
- `HEADLAMP_TLS_CERT_FILE=/path/to/tls.crt` — Path to the TLS certificate file
- `HEADLAMP_TLS_KEY_FILE=/path/to/tls.key` — Path to the TLS private key file

Example (Kubernetes manifest snippet):

```yaml
containers:
  - name: headlamp
    image: ...
    env:
      - name: HEADLAMP_ENABLE_TLS
        value: "true"
      - name: HEADLAMP_TLS_CERT_FILE
        value: "/certs/tls.crt"
      - name: HEADLAMP_TLS_KEY_FILE
        value: "/certs/tls.key"
    volumeMounts:
      - name: certs
        mountPath: /certs
volumes:
  - name: certs
    secret:
      secretName: headlamp-tls
```

## Notes
- If `HEADLAMP_ENABLE_TLS` is not set or is not `true`, Headlamp will listen without TLS (default behavior).
- If either the cert or key file is missing, Headlamp will not start in TLS mode.
- You can now use NGINX or other ingress controllers in TLS passthrough mode, letting Headlamp terminate TLS.

## Compatibility
- This feature is optional and fully backward compatible. If you do not set these variables, Headlamp will continue to expect TLS termination at the ingress.

## See Also
- [In-cluster installation guide](https://headlamp.dev/docs/latest/installation/in-cluster/)
- [Kubernetes TLS Secrets](https://kubernetes.io/docs/concepts/configuration/secret/#tls-secrets)
