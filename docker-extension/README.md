## Requirements
- Docker Desktop (>4.8.0) [Refer](https://www.docker.com/products/extensions/)

## Steps to build and install Headlamp docker extension

- In Docker desktop settings enable Kubernetes and make sure the cluster is in healthy state.
- Clone this repository.
- Run `docker build -t headlamp ./docker-extension`.
- Install the extension `docker extension install headlamp`.
- Open Docker desktop and the Headlamp extension should be visible in the left pane (If the icon is not visible try restarting Docker desktop).
