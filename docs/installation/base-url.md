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

```bash
./backend/headlamp-server -dev -base-url /headlamp
PUBLIC_URL="/headlamp" npm run frontend:start
```

Then go to <http://localhost:3000/headlamp/> in your browser.

### Static build mode

```bash
npm run frontend:build
./backend/headlamp-server -dev -base-url /headlamp -html-static-dir frontend/build
```

Then go to <http://localhost:4466/headlamp/> in your browser.

### Docker mode

Append `--base-url /headlamp` to the docker run command. Note the extra "-".

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
    path: /headlamp/  
```
