# Resource CircularCharts Plugin

This plugin demonstrates how to add custom resource charts to Headlamp's Overview page. Currently, it adds a Pod Failure chart that visualizes the number of failed pods in the cluster.

## Features

- Adds a "Pods Failed" chart to the Overview page
- Uses theme-based colors to highlight failed pods
- Shows percentage and count of failed pods vs total pods

## Usage

To run the plugin:

```bash
cd plugins/examples/resource-charts
npm install
npm start
```

Then visit the Overview page in Headlamp to see the Pod Failure chart in action.

## Development

The main implementation is in [src/index.tsx](src/index.tsx), which shows how to:

- Create a custom chart component using Headlamp's TileChart
- Use Kubernetes resource data with Headlamp's K8s API
- Register charts to appear in the Overview page using the charts processor

For more information on developing Headlamp plugins, please refer to:

- [Getting Started](https://headlamp.dev/docs/latest/development/plugins/)
- [API Reference](https://headlamp.dev/docs/latest/development/api/)
- [UI Component Storybook](https://headlamp.dev/docs/latest/development/frontend/#storybook)
