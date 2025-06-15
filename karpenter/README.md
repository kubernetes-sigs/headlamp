# Karpenter Headlamp Plugin

This Headlamp plugin adds support for visualizing Karpenter's NodeClass custom resources in a user-friendly way.

## Features

✅ **Current Features**:
- List all NodeClass resources in the cluster
- View key provisioning details (IAM role, subnet selectors, security groups)
- Monitor NodeClass status and conditions
- Clean, non-JSON display of configuration

🚧 **Work in Progress**:
This is an early version of the plugin. Future updates will include support for visualizing NodePools, real-time autoscaling decisions, and integration with Prometheus for provisioning metrics.

## Getting Started with Karpenter on EKS

Before using this plugin, you'll need Karpenter installed in your cluster. Here's the official setup guide:

[Karpenter Getting Started on EKS](https://karpenter.sh/docs/getting-started/getting-started-with-karpenter/)

## 🎥 Demo

[Watch the Demo Video on Vimeo](https://vimeo.com/1093533280/25ac6a636b?share=copy)