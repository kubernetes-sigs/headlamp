# Example Plugin: Set up clusters dynamically

Configure (or update) a cluster dynamically that can then be used throughout Headlamp.

Headlamp supports both dynamic and static cluster configurations.

### Static Clusters (Default):

- If dynamic cluster is disabled (default setting), Headlamp prompts users to manually enter information about the cluster, including the cluster name and server details.
- Users can submit the form, and Headlamp will load the cluster based on the provided information.

<img width="584" alt="dynamic cluster is disabled" src="https://github.com/kubernetes-sigs/headlamp/assets/24803604/8b67f739-dd41-4114-9f2f-93f8cf2bbf0a">

### Dynamic Clusters (Enable with -enable-dynamic-clusters flag):

- When dynamic cluster is enabled on the backend using the -enable-dynamic-clusters flag, Headlamp allows users to paste the base64 encoded value of their kubeconfig.
- Upon submission, Headlamp seamlessly loads the cluster statelessly using the provided kubeconfig information.

<img width="763" alt="dynamic cluster is enabled" src="https://github.com/kubernetes-sigs/headlamp/assets/24803604/19bceb85-9d68-44bc-a8b4-e0303da09f70">

## Running the plugin

To run the plugin with [node.js](https://nodejs.org/en/) installed:

```bash
git clone git@github.com:kinvolk/headlamp.git
cd headlamp/plugins/examples/dynamic-clusters/
npm install
npm start
```

The main code for the plugin is in [src/index.tsx](src/index.tsx).

## Further information

See:

- API documentation for [Headlamp.setCluster](https://headlamp.dev/docs/latest/development/api/classes/plugin_lib.headlamp/#setcluster)
- The [getting started documentation for Headlamp plugin development](https://headlamp.dev/docs/latest/development/plugins/building/)
