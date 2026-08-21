# Interface: AppMenu

Defined in: [plugin/lib.ts:96](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/lib.ts#L96)

The members of AppMenu should be the same as the options for the MenuItem in https://www.electronjs.org/docs/latest/api/menu-item
except for the "submenu" (which is the AppMenu type) and "click" (which is not supported here, use the
"url" field instead).

## Indexable

```ts
[key: string]: any
```

Any other members from Electron's MenuItem.

## Properties

### submenu?

```ts
optional submenu?: AppMenu[];
```

Defined in: [plugin/lib.ts:100](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/lib.ts#L100)

The submenus of this menu

***

### url?

```ts
optional url?: string;
```

Defined in: [plugin/lib.ts:98](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/lib.ts#L98)

A URL to open (if not starting with http, then it'll be opened in the external browser)
