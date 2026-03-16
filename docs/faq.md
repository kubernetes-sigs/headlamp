---
title: Frequently Asked Questions
sidebar_position: 5
---

## General Questions

### What is Headlamp and who is it for?

Headlamp is a graphical user interface specifically tailored to simplify the management of Kubernetes clusters.

### What Kubernetes flavors or vendors does Headlamp support?

Headlamp is designed to be vendor-agnostic, supporting a variety of Kubernetes flavors. For a full list of compatible platforms, please refer to our [platforms section in the documentation](./platforms.md).

### Is Headlamp a desktop or web application?

Headlamp is available both as a desktop application and a web application. The desktop version can be installed on your local machine and the web version can be accessed through a browser.

### Is there any cost involved in using Headlamp?

Headlamp is a 100% open source project, under the Apache 2.0 License. It is thus available at no charge, and users are encouraged to modify and redistribute it in accordance with the license terms.

### Can I use Headlamp for commercial purposes?

Yes, and it's encouraged. Headlamp is developed under the permissive Apache 2.0 License making it ideal for personal and commercial use.

### Where can I find the source code for Headlamp?

The source code for Headlamp is publicly available on [GitHub](https://github.com/kubernetes-sigs/headlamp). You are welcome to explore, fork, and contribute to the codebase.

### Who maintains Headlamp?

You can find the list of Headlamp's maintainers in its [OWNERS_ALIASES](https://github.com/kubernetes-sigs/headlamp/blob/main/OWNERS_ALIASES) file in the repository. As a 100% open source project and a CNCF Sandbox project, Headlamp encourages any users/developers to participate in it.

### What capabilities / credentials does Headlamp require to access my Kubernetes cluster?

Headlamp doesn't require access to the cluster itself; it instead relies on RBAC to connect to the Kubernetes API server. This means that it's the user(s) who must have the required credentials to access the cluster (via a service token or client certificate). Headlamp may store the token in the browser's local storage, but never in its backend/server.

### Is Headlamp customizable?

Yes, Headlamp is highly customizable, thanks to its robust plugin system. This system extends Headlamp's core functionalities, catering to specific use cases and workflows. For more information on creating and managing plugins, visit our [plugins page](./development/plugins/building.md).

### How often is Headlamp updated?

Headlamp tries to have a new feature version released every month. Sometimes, there may be delays of a couple of weeks. Bug fix versions can also be released between feature versions, whenever appropriate. These are often released quickly after a fix is added.

---

## Installation and Setup

### How can I install and access Headlamp?

To install Headlamp, follow the detailed instructions provided in the [official installation guide](./installation/index.mdx). The process will guide you through downloading the application, setting up your Kubernetes cluster access, and launching Headlamp to connect to your cluster. For desktop applications, you can find additional information in the [desktop installation guide](./installation/desktop/index.mdx).

### Can I install Headlamp in my Kubernetes cluster?

Absolutely! Headlamp can be deployed directly within your Kubernetes cluster. Detailed instructions for in-cluster installation can be found in the [in-cluster installation guide](./installation/in-cluster/index.md).

---

## Usage and Features

### Can I monitor multiple clusters with Headlamp?

Yes, Headlamp allows you to monitor multiple clusters. You can switch between different clusters using the cluster switcher in the Headlamp interface.

### Can I manage my Kubernetes resources directly through Headlamp?

Yes, Headlamp enables direct management of Kubernetes resources through its user interface as allowed by the user's role and permissions.

### Headlamp is not showing delete/edit/scale buttons in a resource, why is that?

Headlamp shows controls based on the user's role (RBAC), so if the user has, e.g., no permissions to delete a resource, the delete button is not shown.

### I cannot access any section in my cluster, it keeps saying Access Denied.

By default, Headlamp assumes users can list all namespaces. If you only have the permissions to list resources in certain namespaces, please access the cluster settings and set up the accessible namespaces.

### How do I add or remove plugins in Headlamp?

To add or remove plugins in Headlamp, you can follow the plugin management instructions provided in the [Headlamp plugin documentation](./development/plugins/index.md).

### Is there a way to contribute to the development of Headlamp features?

Absolutely! As an open source project, Headlamp thrives on community contributions. You can contribute in various ways, including submitting pull requests, creating plugins, reporting issues, and suggesting new features. For more details on how to get involved, visit our [contribution section](./contributing.md).

### How can I get help or assistance for Headlamp?

For support, refer to the [Headlamp documentation](./development/index.md). For further assistance, join the [Headlamp community on Slack](https://kubernetes.slack.com/messages/headlamp) or file an issue on the [GitHub issues page](https://github.com/kubernetes-sigs/headlamp/issues).

Join our [monthly community meeting](https://zoom-lfx.platform.linuxfoundation.org/meetings/headlamp) if you want to chat in a zoom call.
