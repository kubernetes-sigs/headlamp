---
title: Custom Favicon
sidebar_label: Custom Favicon
sidebar_position: 5
---

Headlamp can serve a custom favicon (the browser-tab icon) at runtime, for
branding purposes, without rebuilding the frontend. The icon is provided to the
backend either as a file path or as a base64-encoded PNG, which makes it easy to
set in container and Kubernetes environments.

Only the browser-tab icons are replaced:

- `/favicon.ico`
- `/favicon-16x16.png`
- `/favicon-32x32.png`

The same image is served for all three. The Apple touch icon
(`/apple-touch-icon.png`, used for the iOS "Add to Home Screen" icon) is left
unchanged.

## Options

| Flag               | Environment variable             | Description                                              |
| ------------------ | -------------------------------- | -------------------------------------------------------- |
| `-favicon`         | `HEADLAMP_CONFIG_FAVICON`        | Path to a custom favicon file (`.png` or `.ico`).        |
| `-favicon-base64`  | `HEADLAMP_CONFIG_FAVICON_BASE64` | Base64-encoded PNG to use as the favicon.                |

As with all Headlamp options, a command-line flag takes precedence over the
matching environment variable. If both `-favicon` and `-favicon-base64` are set,
`-favicon` (the file) is used and the base64 value is ignored (a warning is
logged).

## Requirements and behavior

- **Accepted formats:** PNG (`.png`) and ICO (`.ico`) for `-favicon`; PNG only
  for `-favicon-base64`.
- **Validation:** The file extension determines the served `Content-Type`, and
  the file contents are validated against it (the leading "magic bytes" must
  match). Files larger than 1 MiB are rejected.
- **Safe fallback:** If the configured icon is missing, too large, of an
  unsupported type, or does not match its declared format, Headlamp logs a
  warning and serves its **default** icon instead — it does not fail to start.
- **A single image is enough.** Browsers scale the icon, so a single 32×32 (or
  larger) image works for every tab-icon size.
- **Caching:** The favicon is served with `Cache-Control: public, max-age=86400`.
  After changing it, do a hard refresh (or use a private window) to bypass the
  browser cache.

## Examples

### Local / static build

```bash
npm run frontend:build
./backend/headlamp-server -html-static-dir frontend/build -favicon /branding/favicon.ico
```

Then open <http://localhost:4466/> — the tab shows your custom icon.

### Environment variable

```bash
export HEADLAMP_CONFIG_FAVICON=/branding/favicon.png
./backend/headlamp-server -html-static-dir frontend/build
```

### Base64 (no file needed)

Useful in containers where mounting a file is inconvenient:

```bash
export HEADLAMP_CONFIG_FAVICON_BASE64="$(base64 < favicon.png | tr -d '\n')"
./backend/headlamp-server -html-static-dir frontend/build
```

### Docker

Mount the icon and point the flag at it:

```bash
docker run -p 127.0.0.1:4466:4466 \
  -v "$(pwd)/branding:/branding:ro" \
  ghcr.io/headlamp-k8s/headlamp:latest \
  -in-cluster -favicon /branding/favicon.ico
```

Or pass it inline as base64, with no volume:

```bash
docker run -p 127.0.0.1:4466:4466 \
  -e HEADLAMP_CONFIG_FAVICON_BASE64="$(base64 < favicon.png | tr -d '\n')" \
  ghcr.io/headlamp-k8s/headlamp:latest -in-cluster
```

### Kubernetes

The base64 form is the simplest in-cluster, because no volume is required:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: headlamp
spec:
  template:
    spec:
      containers:
        - name: headlamp
          image: ghcr.io/headlamp-k8s/headlamp:latest
          args:
            - "-in-cluster"
          env:
            - name: HEADLAMP_CONFIG_FAVICON_BASE64
              valueFrom:
                secretKeyRef:
                  name: headlamp-branding
                  key: favicon-base64
```

where the `headlamp-branding` Secret (or ConfigMap) holds the base64 string:

```bash
kubectl create secret generic headlamp-branding \
  --from-literal=favicon-base64="$(base64 < favicon.png | tr -d '\n')"
```

Alternatively, mount the icon file from a ConfigMap and use `-favicon`:

```yaml
args:
  - "-in-cluster"
  - "-favicon=/branding/favicon.png"
volumeMounts:
  - name: branding
    mountPath: /branding
    readOnly: true
volumes:
  - name: branding
    configMap:
      name: headlamp-branding
```

Create that ConfigMap from a binary file with:

```bash
kubectl create configmap headlamp-branding --from-file=favicon.png=favicon.png
```
