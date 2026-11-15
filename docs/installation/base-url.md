---
title: Run Headlamp with a base-url
sidebar_label: Base URL
sidebar_position: 3
---

Normally Headlamp runs at the root of the domain. However, you can also ask
to run it at a base-url like "/headlamp" for example.

- default at the root of the domain: `https://headlamp.example.com/`.
- base-url `https://example.com/headlamp/`

## A warning about multiple apps on the same sub domain

Hosting multiple websites (apps) on the [same origin](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy) can lead to possible conflicts between the apps. Each app is able to access information and make requests of the other. Therefore each app needs to be **tested** together, **trusted**, and a compatible **[Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)** should be considered for each of them.

If in doubt, host Headlamp on a separate origin (domain or port, don't use the `-base-url` option).

## How to use with a base-url

### Dev mode

First, build the backend. This creates the `backend/headlamp-server` binary, which is not present in a fresh clone of the repository:

```bash
npm run backend:build
npm run frontend:install
```

Then start the backend in one terminal:

```bash
./backend/headlamp-server -dev -base-url /headlamp
```

And the frontend in a second terminal:

```bash
PUBLIC_URL="/headlamp" npm run frontend:start
```

Then go to <http://localhost:3000/headlamp/> in your browser.

### Static build mode

First, build the backend and the frontend. The backend build creates the `backend/headlamp-server` binary, and the frontend build creates the `frontend/build` directory that the backend will serve:

```bash
npm run backend:build
npm run frontend:install
npm run frontend:build
```

Then start the backend and tell it to serve the built frontend:

```bash
./backend/headlamp-server -dev -base-url /headlamp -html-static-dir frontend/build
```

Then go to <http://localhost:4466/headlamp/> in your browser.

### Docker mode

Append `-base-url /headlamp` to the end of the `docker run` command, after the
image name:

```bash
docker run --rm -p 4466:4466 ghcr.io/headlamp-k8s/headlamp:latest -base-url /headlamp
```

Then go to <http://localhost:4466/headlamp/> in your browser.

> **Note:** Use `http://`, not `https://`. Headlamp serves plain HTTP by
> default, so opening `https://localhost:4466/headlamp/` will fail.

### Kubernetes

You can modify your kubernetes deployment file to add `-base-url /headlamp`
to the containers args. Additionally, update the livenessProbe and readinessProbe paths accordingly to match the base-url.

```yaml
args:
  - "-in-cluster"
  - "-plugins-dir=/headlamp/plugins"
  - "-base-url=/headlamp"

livenessProbe:
  httpGet:
    path: /headlamp/   # note the trailing slash

readinessProbe:
  httpGet:
    path: /headlamp/   # note the trailing slash
```
