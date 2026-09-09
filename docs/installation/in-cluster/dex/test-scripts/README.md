# Headlamp + OAuth2-Proxy + Dex test scripts

This folder provides a runnable local version of the
[Headlamp + OAuth2-Proxy + Dex tutorial](../index.md).

It brings up:

- A **Minikube** profile (`dex`) with RBAC enabled and no
  `apiserver.oidc-*` flags.
- A **Dex** instance (running on the host machine) acting as the OIDC provider.
- A **Headlamp** install via the official Helm chart, with no OIDC config.
- An **OAuth2-Proxy** install via the official Helm chart, configured to
  authenticate users against Dex and forward the resulting `id_token` to
  Headlamp as an `Authorization: Bearer …` header.

When everything is up, you reach Headlamp by opening
<http://localhost:8080> in your browser, signing in to Dex
(`admin@example.com` / `password`), and being redirected back to Headlamp
with access provided by Headlamp's in-cluster ServiceAccount. This is an
explicitly local mode: every authenticated user receives the same Kubernetes
permissions. See the parent tutorial for per-user RBAC.

## Prerequisites

Make sure the following are installed and on your `PATH`:

- [`minikube`](https://minikube.sigs.k8s.io/) ≥ 1.31
- [`kubectl`](https://kubernetes.io/docs/tasks/tools/)
- [`helm`](https://helm.sh/) ≥ 3.10
- [`dex`](https://github.com/dexidp/dex) 2.45.1 (built with Go 1.25 or newer;
  Dex does not publish prebuilt binaries)
- `curl` (for the smoke test)
- `openssl` (for the random cookie secret)
- Browser-side resolution for `host.minikube.internal`

The login flow redirects your browser to
`http://host.minikube.internal:5556`. If that name does not resolve where the
browser runs, add it to that operating system's hosts file. Use `127.0.0.1`
when the browser can reach Dex through localhost. For a browser outside WSL or
a VM, use the WSL/VM address that reaches Dex instead.

- Linux/macOS hosts file: `/etc/hosts`
- Windows hosts file: `%SystemRoot%\System32\drivers\etc\hosts`

For example:

```text
127.0.0.1 host.minikube.internal
```

The scripts pin Headlamp chart 0.44.0, OAuth2-Proxy chart 10.7.0
(OAuth2-Proxy 7.15.3), and Dex 2.45.1. They were tested with Minikube 1.38
on Linux. macOS should work the same way; on Windows, use WSL.

### Installing the prerequisites

Pick the section for your OS. `kubectl`, `minikube` and `helm` are not
shipped in the default Ubuntu/Debian repositories, so on those platforms
we use their upstream package sources / install scripts. Dex does not
publish prebuilt `dex` binaries (only source tarballs and container
images), so on Ubuntu/Debian we build `dex` from source with `go build`;
on macOS, all four tools (including `dex`) are available from Homebrew.

#### Ubuntu LTS (22.04 / 24.04) and Debian-based WSL

```bash
# Common build tools, curl, openssl, and git
sudo apt-get update
sudo apt-get install -y curl ca-certificates apt-transport-https gnupg openssl tar git

# Go 1.25 (Dex 2.45.1 requires Go 1.25 or newer)
GO_VERSION=1.25.7
case "$(dpkg --print-architecture)" in
  amd64) GO_ARCH=amd64 ;;
  arm64) GO_ARCH=arm64 ;;
  *) echo "unsupported architecture: $(dpkg --print-architecture)" >&2; exit 1 ;;
esac
curl -fsSLo /tmp/go.tgz "https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf /tmp/go.tgz
sudo ln -sf /usr/local/go/bin/go /usr/local/bin/go
rm /tmp/go.tgz
go version

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
  "https://storage.googleapis.com/minikube/releases/latest/minikube_latest_${GO_ARCH}.deb"
sudo dpkg -i /tmp/minikube.deb && rm /tmp/minikube.deb

# dex: no prebuilt binaries, build from source
DEX_VERSION=v2.45.1
git clone --depth=1 --branch "${DEX_VERSION}" \
  https://github.com/dexidp/dex.git /tmp/dex-src
(cd /tmp/dex-src && go build -o /tmp/dex ./cmd/dex)
sudo install -m 0755 /tmp/dex /usr/local/bin/dex
rm -rf /tmp/dex-src /tmp/dex

# Verify the installation
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

# Verify the installation
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
| `headlamp-values.yaml`        | Helm values for Headlamp (auth handled by OAuth2-Proxy, no OIDC needed). |
| `oauth2-proxy-values.yaml.tpl`| Template Helm values for OAuth2-Proxy (cookie secret is injected).  |
| `run.sh`                      | Brings up Minikube, Dex, Headlamp, OAuth2-Proxy and port-forwards.  |
| `test.sh`                     | Smoke-tests that the OAuth2-Proxy login redirects to Dex.           |
| `cleanup.sh`                  | Stops Dex and deletes stack resources owned by these scripts.       |

## Usage

```bash
# Start everything. Leaves Dex running in the background and
# port-forwards OAuth2-Proxy on http://localhost:8080.
./run.sh

# In another terminal, verify the deployment.
./test.sh

# Open Headlamp in your browser:
#   http://localhost:8080
# Sign in as: admin@example.com / password

# When you're done:
./cleanup.sh
```

`run.sh` is safe to re-run: it reuses the Minikube profile and Dex process that
it created, then reapplies the pinned Helm releases. It refuses to reuse an
existing `dex` profile that it does not own. `cleanup.sh` deletes the profile
only when the ownership marker created by `run.sh` is present.

To use a different profile name, pass the same value to both commands:

```bash
HEADLAMP_DEX_MINIKUBE_PROFILE=headlamp-dex ./run.sh
HEADLAMP_DEX_MINIKUBE_PROFILE=headlamp-dex ./test.sh
HEADLAMP_DEX_MINIKUBE_PROFILE=headlamp-dex ./cleanup.sh
```

## How the authentication flow works

This setup follows
[OAuth2-Proxy's official Headlamp integration guide](https://oauth2-proxy.github.io/oauth2-proxy/configuration/integrations/headlamp):
OAuth2-Proxy sits in front of Headlamp, talks OIDC to Dex, issues a session
cookie to the browser, and forwards the user's `id_token` to Headlamp as an
`Authorization: Bearer …` header.

These scripts omit `apiserver.oidc-*` flags and deliberately set Headlamp's
`unsafeUseServiceAccountToken` option. OAuth2-Proxy authenticates access to
Headlamp, but Kubernetes authorizes every signed-in user as Headlamp's
ServiceAccount. The [parent tutorial](../index.md) explains the HTTPS issuer
and API-server configuration required for per-user RBAC.
