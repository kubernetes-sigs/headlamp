# Contributing Guidelines

Welcome to Kubernetes. We are excited about the prospect of you joining our [community](https://github.com/kubernetes/community)! The Kubernetes community abides by the CNCF [code of conduct](code-of-conduct.md). Here is an excerpt:

_As contributors and maintainers of this project, and in the interest of fostering an open and welcoming community, we pledge to respect all people who contribute through reporting issues, posting feature requests, updating documentation, submitting pull requests or patches, and other activities._

## Getting Started

For contributing to the Headlamp project, please refer check out our:
- [Guidelines](https://headlamp.dev/docs/latest/contributing/)
- [Code of Conduct](./code-of-conduct.md),
- [#headlamp](https://kubernetes.slack.com/messages/headlamp) slack channel in the Kubernetes Slack
- [Monthly Community Meeting](https://zoom-lfx.platform.linuxfoundation.org/meetings/headlamp)

Since Headlamp is part of the Kubernetes Community, please read also:

- [Contributor License Agreement](https://git.k8s.io/community/CLA.md) Kubernetes projects require that you sign a Contributor License Agreement (CLA) before we can accept your pull requests
- [Kubernetes Contributor Guide](https://git.k8s.io/community/contributors/guide) - Main contributor documentation, or you can just jump directly to the [contributing section](https://git.k8s.io/community/contributors/guide#contributing)
- [Contributor Cheat Sheet](https://git.k8s.io/community/contributors/guide/contributor-cheatsheet/README.md) - Common resources for existing developers

## Local Development Setup

Ready to run Headlamp locally? Here's the full setup from scratch.

### Prerequisites

Make sure you have Node.js (>= 20.11.1 with npm >= 10.0.0) and Go installed before starting; see the development dependencies for the full list.

### Build and Run

1. **Install root dependencies**

   ```bash
   npm install
   ```

2. **Build the backend** (requires Go)

   ```bash
   npm run backend:build
   ```

3. **Install frontend dependencies**

   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. **Start the application**

   ```bash
   npm start
   ```

That's it—you should now have Headlamp running locally.

### Apple Silicon (ARM64)

If you're developing on an M1/M2/M3 Mac and want to use Minikube, you'll need a driver that supports ARM64. Two good options:

- **docker** – uses the Docker runtime
- **vfkit** – a lightweight hypervisor for macOS

Example commands:

```bash
minikube start --driver=docker
```

or

```bash
minikube start --driver=vfkit
```

> **Note:** VirtualBox does not support ARM64. Avoid `--driver=virtualbox` on Apple Silicon.

### macOS Gatekeeper / Security Warning

When you first launch the Headlamp app on macOS, you might see a warning that the app is "damaged" or can't be opened. This is due to Gatekeeper's quarantine flag.

Run the following command using the actual path to your .app file:

```bash
xattr -cr /path/to/Headlamp.app
```

Then try opening the app again.
