# Headlamp + OAuth2-Proxy + Dex test scripts

This folder reproduces the [Headlamp + OAuth2-Proxy + Dex tutorial](../index.md) end-to-end so you can
try it yourself with a single command.

It brings up:

- A **Minikube** profile (`dex`) with RBAC enabled (no `apiserver.oidc-*` flags; see "How it differs" below).
- A **Dex** instance (running on the host machine) acting as the OIDC provider.
- A **Headlamp** install via the official Helm chart, with no OIDC config.
- An **OAuth2-Proxy** install via the official Helm chart, configured to
  authenticate users against Dex and forward the resulting `id_token` to
  Headlamp as an `Authorization: Bearer …` header.
- A `ClusterRoleBinding` that grants the Dex test user `cluster-admin`.

When everything is up, you reach Headlamp by opening
<http://localhost:8080> in your browser, signing in to Dex
(`admin@example.com` / `password`), and being redirected back to Headlamp
with full access.

## Prerequisites

Make sure the following are installed and on your `PATH`:

- [`minikube`](https://minikube.sigs.k8s.io/) ≥ 1.31
- [`kubectl`](https://kubernetes.io/docs/tasks/tools/)
- [`helm`](https://helm.sh/) ≥ 3.10
- [`dex`](https://github.com/dexidp/dex) ≥ 2.38 (build from source with
  `make build`; Dex does not publish prebuilt binaries)
- `curl` (for the smoke test)
- `openssl` (for the random cookie secret)

Tested with Headlamp 0.36, OAuth2-Proxy 7.x, Dex 2.45 and Minikube 1.34
on Linux. macOS should work the same way; on Windows you'll need WSL.

### Installing the prerequisites

Pick the section for your OS. `kubectl`, `minikube` and `helm` are not
shipped in the default Ubuntu/Debian repositories, so on those platforms
we use their upstream package sources / install scripts. Dex does not
publish prebuilt `dex` binaries (only source tarballs and container
images), so on Ubuntu/Debian we build `dex` from source with `go build`;
on macOS, all four tools (including `dex`) are available from Homebrew.

#### Ubuntu LTS (22.04 / 24.04) and Debian-based WSL

```bash
# Common build tools, curl, openssl, git, golang
sudo apt-get update
sudo apt-get install -y curl ca-certificates apt-transport-https gnupg openssl tar git golang-go

# kubectl: Kubernetes apt repo
sudo mkdir -p -m 755 /etc/apt/keyrings
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key \
  | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /' \
  | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubectl

# helm: official apt repo
curl -fsSL https://baltocdn.com/helm/signing.asc \
  | sudo gpg --dearmor -o /etc/apt/keyrings/helm.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/helm.gpg] https://baltocdn.com/helm/stable/debian/ all main" \
  | sudo tee /etc/apt/sources.list.d/helm-stable-debian.list
sudo apt-get update
sudo apt-get install -y helm

# minikube: upstream .deb
curl -fsSL -o /tmp/minikube.deb \
  https://storage.googleapis.com/minikube/releases/latest/minikube_latest_amd64.deb
sudo dpkg -i /tmp/minikube.deb && rm /tmp/minikube.deb

# dex: no prebuilt binaries, build from source
DEX_VERSION=v2.45.1
git clone --depth=1 --branch "${DEX_VERSION}" \
  https://github.com/dexidp/dex.git /tmp/dex-src
(cd /tmp/dex-src && go build -o /tmp/dex ./cmd/dex)
sudo install -m 0755 /tmp/dex /usr/local/bin/dex
rm -rf /tmp/dex-src /tmp/dex

# Sanity check
kubectl version --client
minikube version
helm version
dex version
```

You'll also need a Minikube driver. On a fresh Ubuntu host, `docker.io`
from apt is the simplest choice (`sudo apt-get install -y docker.io &&
sudo usermod -aG docker "$USER"`, then re-login).

#### macOS with Homebrew

```bash
# All four binaries are in homebrew-core
brew install kubectl minikube helm dex
# curl and openssl ship with macOS, no install needed.

# Sanity check
kubectl version --client
minikube version
helm version
dex version
```

Minikube on macOS needs a driver too; the easiest is Docker Desktop
(`brew install --cask docker`) or the QEMU driver (`brew install qemu`).

## Files

| File                          | What it is                                                          |
|-------------------------------|---------------------------------------------------------------------|
| `dex-config.yaml`             | Dex configuration (static client + static password).                |
| `clusterrolebinding.yaml`     | RBAC binding mapping the Dex user to `cluster-admin`.               |
| `headlamp-values.yaml`        | Helm values for Headlamp (auth handled by OAuth2-Proxy, no OIDC needed). |
| `oauth2-proxy-values.yaml.tpl`| Template Helm values for OAuth2-Proxy (cookie secret is injected).  |
| `run.sh`                      | Brings up Minikube, Dex, Headlamp, OAuth2-Proxy and port-forwards.  |
| `test.sh`                     | Smoke-tests that the OAuth2-Proxy login redirects to Dex.           |
| `cleanup.sh`                  | Stops Dex, deletes the Helm releases and the Minikube profile.      |

## Usage

```bash
# Start everything. Leaves Dex running in the background and
# port-forwards OAuth2-Proxy on http://localhost:8080.
./run.sh

# In another terminal, sanity-check the deployment.
./test.sh

# Open Headlamp in your browser:
#   http://localhost:8080
# Sign in as: admin@example.com / password

# When you're done:
./cleanup.sh
```

`run.sh` is idempotent: re-running it picks up where a previous run
left off.

## How it differs from the older Dex tutorial

The [other Dex tutorial](../index.md) points Headlamp directly at Dex
and lets Headlamp drive the OIDC flow. The new pattern, which matches
[OAuth2-Proxy's official Headlamp integration guide](https://oauth2-proxy.github.io/oauth2-proxy/configuration/integrations/headlamp),
puts OAuth2-Proxy in front of Headlamp. OAuth2-Proxy talks OIDC to Dex,
issues a session cookie to the browser, and forwards the user's
`id_token` to Headlamp as an `Authorization: Bearer …` header.

> **Note:** These scripts omit `apiserver.oidc-*` flags, so `clusterrolebinding.yaml`
> has no effect here. For per-user RBAC see `../index.md`.
