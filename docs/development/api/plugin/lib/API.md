# plugin/lib

## Index

### Classes

| Class | Description |
| ------ | ------ |
| [Headlamp](classes/Headlamp.md) | This class is a more convenient way for plugins to call registerPlugin in order to register themselves. |
| [Plugin](classes/Plugin.md) | Plugins may call Headlamp.registerPlugin(pluginId: string, pluginObj: Plugin) to register themselves. |

### Interfaces

| Interface | Description |
| ------ | ------ |
| [AppMenu](interfaces/AppMenu.md) | The members of AppMenu should be the same as the options for the MenuItem in https://www.electronjs.org/docs/latest/api/menu-item except for the "submenu" (which is the AppMenu type) and "click" (which is not supported here, use the "url" field instead). |
