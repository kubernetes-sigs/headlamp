[API](../API.md) / [lib/router](../modules/lib_router.md) / Route

# Interface: Route

[lib/router](../modules/lib_router.md).Route

## Properties

### disabled

• `Optional` **disabled**: `boolean`

Whether the route should be disabled (not registered).

#### Defined in

[lib/router.tsx:118](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L118)

___

### exact

• `Optional` **exact**: `boolean`

When true, will only match if the path matches the location.pathname exactly.

#### Defined in

[lib/router.tsx:97](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L97)

___

### hideAppBar

• `Optional` **hideAppBar**: `boolean`

Hide the appbar at the top.

#### Defined in

[lib/router.tsx:116](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L116)

___

### name

• `Optional` **name**: `string`

Human readable name. Capitalized and short.

#### Defined in

[lib/router.tsx:99](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L99)

___

### noAuthRequired

• `Optional` **noAuthRequired**: `boolean`

This route does not require Authentication.

#### Defined in

[lib/router.tsx:110](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L110)

___

### noCluster

• `Optional` **noCluster**: `boolean`

In case this route does *not* need a cluster prefix and context.

**`deprecated`** please use useClusterURL.

#### Defined in

[lib/router.tsx:104](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L104)

___

### path

• **path**: `string`

Any valid URL path or array of paths that path-to-regexp@^1.7.0 understands.

#### Defined in

[lib/router.tsx:95](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L95)

___

### sidebar

• **sidebar**: ``null`` \| `string` \| { `item`: ``null`` \| `string` ; `sidebar`: `string`  }

The sidebar entry this Route should enable, or null if it shouldn't enable any. If an object is passed with item and sidebar, it will try to enable the given sidebar and the given item.

#### Defined in

[lib/router.tsx:112](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L112)

___

### useClusterURL

• `Optional` **useClusterURL**: `boolean`

Should URL have the cluster prefix? (default=true)

#### Defined in

[lib/router.tsx:108](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L108)

## Methods

### component

▸ **component**(): `Element`

Shown component for this route.

#### Returns

`Element`

#### Defined in

[lib/router.tsx:114](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L114)
