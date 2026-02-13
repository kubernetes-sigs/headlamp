# Kueue Headlamp Plugin

A [Headlamp](https://github.com/kubernetes-sigs/headlamp) plugin for [Kueue](https://kueue.sigs.k8s.io/), a cloud-native job queueing system that manages quotas and how jobs consume them.

## Features

- **Queue Dashboard**: Visualize ClusterQueues and their status.
- **Workload Monitoring**: Track pending workloads and understand why they are queued.
- **Resource Usage**: View quota usage across different queues.

## Installation

This plugin can be installed in Headlamp by placing it in the plugins directory.

### Development

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Build the plugin:
    ```bash
    npm run build
    ```
4.  Start the plugin in development mode:
    ```bash
    npm start
    ```

## Screenshot

![Kueue Dashboard](https://raw.githubusercontent.com/kubernetes-sigs/kueue/main/docs/images/kueue-logo.png)
*(Note: Add actual screenshot of the plugin here)*
