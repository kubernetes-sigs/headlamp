---
title: Backend
sidebar_position: 1
---

Headlamp's backend is written in Go. It is in charge of redirecting
client requests to the right clusters and returning any available
plugins for the client to use.

The backend's most essential function is to read the cluster information
from the given configuration and set up proxies to the defined clusters as
well as endpoints to them. This means that instead of having a set of
endpoints related to the functionality available to the client, it simply
redirects the requests to the defined proxies.

## Building and running

The backend (Headlamp's server) can be quickly built using:

```bash
make backend
```

Once built, it can be run in development mode (insecure / don't use in production) using:

```bash
make run-backend
```

## Lint

To lint the backend/ code.

```bash
make backend-lint
```

This command can fix some lint issues.

```bash
make backend-lint-fix
```

## Format

To format the backend code.

```bash
make backend-format
```

## Test

```bash
make backend-test
```

Test coverage with a html report in the browser.

```bash
make backend-coverage-html
```

To just print a simpler coverage report to the console.
```bash
make backend-coverage
```

