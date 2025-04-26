---
title: How to create a Plugin
---

This section will walk you through basic plugin development.

## Types

If you are using TypeScript to develop the plugin, the
`@kinvolk/headlamp-plugin` package ships some type declarations in
`@kinvolk/headlamp-plugin/types`. Please note that the whole external
plugin mechanics are still in an early development phase. Thus, only the
actual type declarations (and not the corresponding code) are shipped in this
package.

## Hello Kubernetes

The following example will show basic plugin declaration and registration
in a file that should match the `src/index.tsx` structure explained in the
[building](./building.md) section.

```tsx title="/src/index.tsx"
import { registerAppBarAction } from "@kinvolk/headlamp-plugin/lib";
registerAppBarAction(<span>Hello Kubernetes</span>);
```

## Plugin Example

Let's create a plugin that just gets the number of pods in the cluster and
displays that information in the top bar (i.e. registers an "app bar action").

```tsx title="/src/index.tsx"
import { K8s, registerAppBarAction } from '@kinvolk/headlamp-plugin/lib';
import { Typography } from '@mui/material';

function PodCounter() {
  const [pods, error]: K8s.ResourceClasses.Pod.useList();
  const msg: pods === null ? 'Loading…' : pods.length.toString();

  return (
    <Typography color="textPrimary" sx={{fontStyle: 'italic'}}>
      {!error ? `# Pods: ${msg}` : 'Uh, pods!?'}
    </Typography>
  );
}

registerAppBarAction(<PodCounter />);
```

Here is the result, running Headlamp with this plugin and using with a Minikube cluster:

![screenshot showing a label on the top bar with the number of pods available](./images/podcounter_screenshot.png)

Please refer to the [functionality](./functionality/index.md) section for learning about
the different functionality that is available to plugins by the registry.
