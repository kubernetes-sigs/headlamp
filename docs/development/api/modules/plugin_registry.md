[API](../API.md) / plugin/registry

# Module: plugin/registry

## Enumerations

- [DefaultAppBarAction](../enums/plugin_registry.DefaultAppBarAction.md)
- [DefaultDetailsViewSection](../enums/plugin_registry.DefaultDetailsViewSection.md)
- [DefaultSidebars](../enums/plugin_registry.DefaultSidebars.md)

## Classes

- [PluginManager](../classes/plugin_registry.PluginManager.md)
- [Registry](../classes/plugin_registry.Registry.md)

## Interfaces

- [AppLogoProps](../interfaces/plugin_registry.AppLogoProps.md)
- [ClusterChooserProps](../interfaces/plugin_registry.ClusterChooserProps.md)
- [CreateResourceEvent](../interfaces/plugin_registry.CreateResourceEvent.md)
- [DeleteResourceEvent](../interfaces/plugin_registry.DeleteResourceEvent.md)
- [DetailsViewSectionProps](../interfaces/plugin_registry.DetailsViewSectionProps.md)
- [EditResourceEvent](../interfaces/plugin_registry.EditResourceEvent.md)
- [ErrorBoundaryEvent](../interfaces/plugin_registry.ErrorBoundaryEvent.md)
- [EventListEvent](../interfaces/plugin_registry.EventListEvent.md)
- [HeadlampEvent](../interfaces/plugin_registry.HeadlampEvent.md)
- [LogsEvent](../interfaces/plugin_registry.LogsEvent.md)
- [PluginLoadingErrorEvent](../interfaces/plugin_registry.PluginLoadingErrorEvent.md)
- [PluginSettingsDetailsProps](../interfaces/plugin_registry.PluginSettingsDetailsProps.md)
- [PluginsLoadedEvent](../interfaces/plugin_registry.PluginsLoadedEvent.md)
- [PodAttachEvent](../interfaces/plugin_registry.PodAttachEvent.md)
- [ResourceDetailsViewLoadedEvent](../interfaces/plugin_registry.ResourceDetailsViewLoadedEvent.md)
- [ResourceListViewLoadedEvent](../interfaces/plugin_registry.ResourceListViewLoadedEvent.md)
- [RestartResourceEvent](../interfaces/plugin_registry.RestartResourceEvent.md)
- [ScaleResourceEvent](../interfaces/plugin_registry.ScaleResourceEvent.md)
- [SectionFuncProps](../interfaces/plugin_registry.SectionFuncProps.md)
- [SidebarEntryProps](../interfaces/plugin_registry.SidebarEntryProps.md)
- [TerminalEvent](../interfaces/plugin_registry.TerminalEvent.md)

## Type aliases

### AppBarActionProcessorType

Ƭ **AppBarActionProcessorType**: (`info`: `AppBarActionsProcessorArgs`) => `AppBarAction`[]

#### Type declaration

▸ (`info`): `AppBarAction`[]

##### Parameters

| Name | Type |
| :------ | :------ |
| `info` | `AppBarActionsProcessorArgs` |

##### Returns

`AppBarAction`[]

#### Defined in

[redux/actionButtonsSlice.ts:59](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/actionButtonsSlice.ts#L59)

___

### AppLogoType

Ƭ **AppLogoType**: `React.ComponentType`<[`AppLogoProps`](../interfaces/plugin_registry.AppLogoProps.md)\> \| `ReactElement` \| typeof `React.Component` \| ``null``

#### Defined in

[components/App/AppLogo.tsx:25](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/AppLogo.tsx#L25)

___

### ClusterChooserType

Ƭ **ClusterChooserType**: `React.ComponentType`<[`ClusterChooserProps`](../interfaces/plugin_registry.ClusterChooserProps.md)\> \| `ReactElement` \| ``null``

#### Defined in

[components/cluster/ClusterChooser.tsx:10](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/cluster/ClusterChooser.tsx#L10)

___

### DetailsViewHeaderActionType

Ƭ **DetailsViewHeaderActionType**: `HeaderActionType`

#### Defined in

[plugin/registry.tsx:115](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L115)

___

### DetailsViewHeaderActionsProcessor

Ƭ **DetailsViewHeaderActionsProcessor**: `HeaderActionsProcessor`

#### Defined in

[plugin/registry.tsx:116](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L116)

___

### DetailsViewSectionType

Ƭ **DetailsViewSectionType**: (...`args`: `any`[]) => `JSX.Element` \| ``null`` \| `ReactNode` \| ``null`` \| `ReactElement` \| `ReactNode`

#### Defined in

[components/DetailsViewSection/DetailsViewSection.tsx:10](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/DetailsViewSection/DetailsViewSection.tsx#L10)

___

### HeadlampEventCallback

Ƭ **HeadlampEventCallback**: (`data`: [`HeadlampEvent`](../interfaces/plugin_registry.HeadlampEvent.md)) => `void`

#### Type declaration

▸ (`data`): `void`

##### Parameters

| Name | Type |
| :------ | :------ |
| `data` | [`HeadlampEvent`](../interfaces/plugin_registry.HeadlampEvent.md) |

##### Returns

`void`

#### Defined in

[redux/headlampEventSlice.ts:278](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L278)

___

### PluginSettingsComponentType

Ƭ **PluginSettingsComponentType**: `React.ComponentType`<[`PluginSettingsDetailsProps`](../interfaces/plugin_registry.PluginSettingsDetailsProps.md)\> \| `ReactElement` \| ``null``

PluginSettingsComponentType is the type of the component associated with the plugin's settings.

#### Defined in

[plugin/pluginsSlice.ts:24](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/pluginsSlice.ts#L24)

___

### sectionFunc

Ƭ **sectionFunc**: (`resource`: [`KubeObject`](lib_k8s_cluster.md#kubeobject)) => [`SectionFuncProps`](../interfaces/plugin_registry.SectionFuncProps.md) \| ``null`` \| `undefined`

#### Type declaration

▸ (`resource`): [`SectionFuncProps`](../interfaces/plugin_registry.SectionFuncProps.md) \| ``null`` \| `undefined`

**`deprecated`** please used DetailsViewSectionType and registerDetailViewSection

##### Parameters

| Name | Type |
| :------ | :------ |
| `resource` | [`KubeObject`](lib_k8s_cluster.md#kubeobject) |

##### Returns

[`SectionFuncProps`](../interfaces/plugin_registry.SectionFuncProps.md) \| ``null`` \| `undefined`

#### Defined in

[plugin/registry.tsx:107](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L107)

## Variables

### DefaultHeadlampEvents

• **DefaultHeadlampEvents**: typeof `HeadlampEventType` = `HeadlampEventType`

#### Defined in

[plugin/registry.tsx:101](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L101)

___

### DetailsViewDefaultHeaderActions

• **DetailsViewDefaultHeaderActions**: typeof `DefaultHeaderAction` = `DefaultHeaderAction`

#### Defined in

[plugin/registry.tsx:102](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L102)

## Functions

### getHeadlampAPIHeaders

▸ **getHeadlampAPIHeaders**(): `Object`

Returns headers for making API calls to the headlamp-server backend.

#### Returns

`Object`

#### Defined in

[helpers/index.ts:369](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/helpers/index.ts#L369)

___

### registerAppBarAction

▸ **registerAppBarAction**(`headerAction`): `void`

Add a component into the app bar (at the top of the app).

**`example`**

```tsx
import { registerAppBarAction } from '@kinvolk/headlamp-plugin/lib';
import { Button } from '@mui/material';

function ConsoleLogger() {
  return (
    <Button
      onClick={() => {
        console.log('Hello from ConsoleLogger!')
      }}
    >
      Print Log
    </Button>
  );
}

registerAppBarAction(ConsoleLogger);
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `headerAction` | `AppBarAction` \| `AppBarActionsProcessor` \| [`AppBarActionProcessorType`](plugin_registry.md#appbaractionprocessortype) \| `AppBarActionType` | The action (link) to put in the app bar. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:450](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L450)

___

### registerAppLogo

▸ **registerAppLogo**(`logo`): `void`

Add a logo for Headlamp to use instead of the default one.

**`example`**

```tsx
import { registerAppLogo } from '@kinvolk/headlamp-plugin/lib';

registerAppLogo(<p>my logo</p>)
```

More complete logo example in plugins/examples/change-logo:

**`see`** [Change Logo Example](http://github.com/kinvolk/headlamp/plugins/examples/change-logo/)

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `logo` | [`AppLogoType`](plugin_registry.md#applogotype) | is a React Component that takes two required props `logoType` which is a constant string literal that accepts either of the two values `small` or `large` depending on whether the sidebar is in shrink or expanded state so that you can change your logo from small to large and the other optional prop is the `themeName` which is a string with two values 'light' and 'dark' base on which theme is selected. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:550](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L550)

___

### registerClusterChooser

▸ **registerClusterChooser**(`chooser`): `void`

Use a custom cluster chooser button

**`example`**

```tsx
import { ClusterChooserProps, registerClusterChooser } from '@kinvolk/headlamp-plugin/lib';

registerClusterChooser(({ clickHandler, cluster }: ClusterChooserProps) => {
  return <button onClick={clickHandler}>my chooser Current cluster: {cluster}</button>;
})
```

**`see`** [Cluster Chooser example](http://github.com/kinvolk/headlamp/plugins/examples/cluster-chooser/)

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `chooser` | [`ClusterChooserType`](plugin_registry.md#clusterchoosertype) | is a React Component that takes one required props ```clickHandler``` which is the action handler that happens when the custom chooser button component click event occurs |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:573](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L573)

___

### registerDetailsViewHeaderAction

▸ **registerDetailsViewHeaderAction**(`headerAction`): `void`

Add a component into the details view header.

**`example`**

```tsx
import { ActionButton } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { registerDetailsViewHeaderAction } from '@kinvolk/headlamp-plugin/lib';

function IconAction() {
  return (
    <ActionButton
     description="Launch"
     icon="mdi:comment-quote"
     onClick={() => console.log('Hello from IconAction!')}
   />
  )
}

registerDetailsViewHeaderAction(IconAction);
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `headerAction` | `HeaderActionType` | The action (link) to put in the app bar. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:351](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L351)

___

### registerDetailsViewHeaderActionsProcessor

▸ **registerDetailsViewHeaderActionsProcessor**(`processor`): `void`

Add a processor for the details view header actions. Allowing the modification of header actions.

**`example`**

```tsx
import { registerDetailsViewHeaderActionsProcessor, DetailsViewDefaultHeaderActions } from '@kinvolk/headlamp-plugin/lib';

// Processor that removes the default edit action.
registerDetailsViewHeaderActionsProcessor((resource, headerActions) => {
 return headerActions.filter(action => action.name !== DetailsViewDefaultHeaderActions.EDIT);
});

More complete detail view example in plugins/examples/details-view:
@see [Detail View Example](http://github.com/kinvolk/headlamp/plugins/examples/details-view/)

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `processor` | `HeaderActionsProcessor` \| `HeaderActionFuncType` | The processor to add. Receives a resource (for which we are processing the header actions) and the current header actions and returns the new header actions. Return an empty array to remove all header actions. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:374](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L374)

___

### registerDetailsViewSection

▸ **registerDetailsViewSection**(`viewSection`): `void`

Append a component to the details view for a given resource.

**`example`**

```tsx
import {
  registerDetailsViewSection,
  DetailsViewSectionProps
} from '@kinvolk/headlamp-plugin/lib';

registerDetailsViewSection(({ resource }: DetailsViewSectionProps) => {
  if (resource.kind === 'Pod') {
    return (
      <SectionBox title="A very fine section title">
        The body of our Section for {resource.kind}
      </SectionBox>
    );
  }
  return null;
});
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `viewSection` | [`DetailsViewSectionType`](plugin_registry.md#detailsviewsectiontype) | The section to add on different view screens. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:484](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L484)

___

### registerDetailsViewSectionsProcessor

▸ **registerDetailsViewSectionsProcessor**(`processor`): `void`

Add a processor for the details view sections. Allowing the modification of what sections are shown.

**`example`**

```tsx
import { registerDetailsViewSectionsProcessor } from '@kinvolk/headlamp-plugin/lib';

registerDetailsViewSectionsProcessor(function addTopSection( resource, sections ) {
  // Ignore if there is no resource.
  if (!resource) {
   return sections;
  }

  // Check if we already have added our custom section (this function may be called multiple times).
  const customSectionId = 'my-custom-section';
  if (sections.findIndex(section => section.id === customSectionId) !== -1) {
    return sections;
  }

  return [
    {
      id: 'my-custom-section',
      section: (
        <SectionBox title="I'm the top of the world!" />
),
    },
    ...sections,
  ];
});
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `processor` | `DetailsViewSectionsProcessor` \| `DetailsViewSectionProcessorType` | The processor to add. Receives a resource (for which we are processing the sections) and the current sections and returns the new sections. Return an empty array to remove all sections. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:522](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L522)

___

### registerGetTokenFunction

▸ **registerGetTokenFunction**(`override`): `void`

Override headlamp getToken method

**`example`**

```ts
registerGetTokenFunction(() => {
// set token logic here
});
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `override` | (`cluster`: `string`) => `undefined` \| `string` | The getToken override method to use. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:607](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L607)

___

### registerHeadlampEventCallback

▸ **registerHeadlampEventCallback**(`callback`): `void`

Add a callback for headlamp events.

**`example`**

```ts
import {
  DefaultHeadlampEvents,
  registerHeadlampEventCallback,
  HeadlampEvent,
} from '@kinvolk/headlamp-plugin/lib';

registerHeadlampEventCallback((event: HeadlampEvent) => {
  if (event.type === DefaultHeadlampEvents.ERROR_BOUNDARY) {
    console.error('Error:', event.data);
  } else {
    console.log(`Headlamp event of type ${event.type}: ${event.data}`)
  }
});
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `callback` | [`HeadlampEventCallback`](plugin_registry.md#headlampeventcallback) | The callback to add. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:633](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L633)

___

### registerPluginSettings

▸ **registerPluginSettings**(`name`, `component`, `displaySaveButton?`): `void`

Register a plugin settings component.

**`example`**

```tsx
import { registerPluginSettings } from '@kinvolk/headlamp-plugin/lib';
import { TextField } from '@mui/material';

function MyPluginSettingsComponent(props: PluginSettingsDetailsProps) {
  const { data, onDataChange } = props;

  function onChange(value: string) {
    if (onDataChange) {
      onDataChange({ works: value });
    }
  }

  return (
    <TextField
      value={data?.works || ''}
      onChange={e => onChange(e.target.value)}
      label="Normal Input"
      variant="outlined"
      fullWidth
    />
  );
}

const displaySaveButton = true;
// Register a plugin settings component.
registerPluginSettings('my-plugin', MyPluginSettingsComponent, displaySaveButton);
```

More complete plugin settings example in plugins/examples/change-logo:

**`see`** [Change Logo Example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/change-logo)

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `name` | `string` | `undefined` | The name of the plugin. |
| `component` | [`PluginSettingsComponentType`](plugin_registry.md#pluginsettingscomponenttype) | `undefined` | The component to use for the settings. |
| `displaySaveButton` | `boolean` | `false` | Whether to display the save button. |

#### Returns

`void`

void

#### Defined in

[plugin/registry.tsx:679](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L679)

___

### registerResourceTableColumnsProcessor

▸ **registerResourceTableColumnsProcessor**(`processor`): `void`

Add a processor for the resource table columns. Allowing the modification of what tables show.

**`example`**

```tsx
import { registerResourceTableColumnsProcessor } from '@kinvolk/headlamp-plugin/lib';

// Processor that adds a column to show how many init containers pods have (in the default pods' list table).
registerResourceTableColumnsProcessor(function ageRemover({ id, columns }) {
  if (id === 'headlamp-pods') {
    columns.push({
      label: 'Init Containers',
      // return plain value to allow filtering and sorting
      getValue: (pod: Pod) => {
        return pod.spec.initContainers.length;
      }
      // (optional) customise how the cell value is rendered
      render: (pod: Pod) => <div style={{ color: "red" }}>{pod.spec.initContainers.length}</div>
    });
  }

  return columns;
});
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `processor` | `TableColumnsProcessor` \| <T\>(`args`: { `columns`: (`ColumnType` \| `ResourceTableColumn`<`T`\>)[] ; `id`: `string`  }) => (`ColumnType` \| `ResourceTableColumn`<`T`\>)[] | The processor ID and function. See #TableColumnsProcessor. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:408](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L408)

___

### registerRoute

▸ **registerRoute**(`routeSpec`): `void`

Add a Route for a component.

**`example`**

```tsx
import { registerRoute } from '@kinvolk/headlamp-plugin/lib';

// Add a route that will display the given component and select
// the "traces" sidebar item.
registerRoute({
  path: '/traces',
  sidebar: 'traces',
  component: () => <TraceList />
});
```

**`see`** [Route examples](https://github.com/kinvolk/headlamp/blob/main/frontend/src/lib/router.tsx)

**`see`** [Sidebar Example](http://github.com/kinvolk/headlamp/plugins/examples/sidebar/)

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `routeSpec` | [`Route`](../interfaces/lib_router.Route.md) | details of URL, highlighted sidebar and component to use. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:323](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L323)

___

### registerRouteFilter

▸ **registerRouteFilter**(`filterFunc`): `void`

Remove routes.

**`example`**

```tsx
import { registerRouteFilter } from '@kinvolk/headlamp-plugin/lib';

registerRouteFilter(route => (route.path === '/workloads' ? null : route));
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `filterFunc` | (`entry`: [`Route`](../interfaces/lib_router.Route.md)) => ``null`` \| [`Route`](../interfaces/lib_router.Route.md) | a function for filtering routes. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:296](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L296)

___

### registerSetTokenFunction

▸ **registerSetTokenFunction**(`override`): `void`

Override headlamp setToken method

**`example`**

```ts
registerSetTokenFunction((cluster: string, token: string | null) => {
// set token logic here
});
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `override` | (`cluster`: `string`, `token`: ``null`` \| `string`) => `void` | The setToken override method to use. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:589](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L589)

___

### registerSidebarEntry

▸ **registerSidebarEntry**(`__namedParameters`): `void`

Add a Sidebar Entry to the menu (on the left side of Headlamp).

**`example`**

```tsx
import { registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
registerSidebarEntry({ parent: 'cluster', name: 'traces', label: 'Traces', url: '/traces' });

```

**`see`** [Sidebar Example](http://github.com/kinvolk/headlamp/plugins/examples/sidebar/)

#### Parameters

| Name | Type |
| :------ | :------ |
| `__namedParameters` | [`SidebarEntryProps`](../interfaces/plugin_registry.SidebarEntryProps.md) |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:242](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L242)

___

### registerSidebarEntryFilter

▸ **registerSidebarEntryFilter**(`filterFunc`): `void`

Remove sidebar menu items.

**`example`**

```tsx
import { registerSidebarEntryFilter } from '@kinvolk/headlamp-plugin/lib';

registerSidebarEntryFilter(entry => (entry.name === 'workloads' ? null : entry));
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `filterFunc` | (`entry`: [`SidebarEntryProps`](../interfaces/plugin_registry.SidebarEntryProps.md)) => ``null`` \| [`SidebarEntryProps`](../interfaces/plugin_registry.SidebarEntryProps.md) | a function for filtering sidebar entries. |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:277](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L277)

___

### runCommand

▸ **runCommand**(`command`, `args`, `options`): `Object`

Runs a shell command and returns an object that mimics the interface of a ChildProcess object returned by Node's spawn function.

This function is intended to be used only when Headlamp is in app mode.

**`see`** handleRunCommand in app/electron/main.ts

This function uses the desktopApi.send and desktopApi.receive methods to communicate with the main process.

**`example`**

```ts
  const minikube = runCommand('minikube', ['status']);
  minikube.stdout.on('data', (data) => {
    console.log('stdout:', data);
  });
  minikube.stderr.on('data', (data) => {
    console.log('stderr:', data);
  });
  minikube.on('exit', (code) => {
    console.log('exit code:', code);
  });
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `command` | ``"minikube"`` \| ``"az"`` | The command to run. |
| `args` | `string`[] | An array of arguments to pass to the command. |
| `options` | `Object` | - |

#### Returns

`Object`

An object with `stdout`, `stderr`, and `on` properties. You can listen for 'data' events on `stdout` and `stderr`, and 'exit' events with `on`.

| Name | Type |
| :------ | :------ |
| `stderr` | { `on`: (`event`: `string`, `listener`: (`chunk`: `any`) => `void`) => `void`  } |
| `stderr.on` | [object Object] |
| `stdout` | { `on`: (`event`: `string`, `listener`: (`chunk`: `any`) => `void`) => `void`  } |
| `stdout.on` | [object Object] |
| `on` | (`event`: `string`, `listener`: (`code`: ``null`` \| `number`) => `void`) => `void` |

#### Defined in

[components/App/runCommand.ts:27](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/runCommand.ts#L27)
