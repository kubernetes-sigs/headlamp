# Example Plugin: Details view

Shows how to make custom sections and actions in particular details views. For example add a section at the bottom of the config map view, along with an action button to the top of the view.

![screenshot of the custom details view section and action button](../../../docs/development/plugins/images/details-view.png)

To run the plugin:

```bash
cd plugins/examples/details-view
npm install
npm start
# See bottom of view, and action bar for changes.
# http://localhost:3000/c/minikube/configmaps/kube-system/coredns
```

The main code for the example plugin is in [src/index.tsx](src/index.tsx).

See the API documentation for:

- [registerDetailsViewSection](https://headlamp.dev/docs/latest/development/api/classes/plugin_registry.registry/#registerdetailsviewsection)
- [registerDetailsViewHeaderAction](https://headlamp.dev/docs/latest/development/api/classes/plugin_registry.registry/#registerdetailsviewheaderaction)
