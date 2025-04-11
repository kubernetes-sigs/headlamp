# Example Plugin: Pod Counter

This example plugin shows how to put something in the appbar at the top of Headlamp. Also how to
use the K8s API to count the number of pods in the cluster.

![screenshot of the logo being changed](../../../docs/development/plugins/images/podcounter_screenshot.png)

To run the plugin:

```bash
cd plugins/examples/pod-counter
npm install
npm start
# See the app bar at the top of Headlamp has changed to show the number of Pods.
```

The main code for the plugin is in [src/index.tsx](src/index.tsx).

See the API documentation for:

- [registerAppBarAction](https://headlamp.dev/docs/latest/development/api/modules/plugin_registry/#registerappbaraction)
