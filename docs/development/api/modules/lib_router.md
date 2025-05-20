[API](../API.md) / lib/router

# Module: lib/router

## Interfaces

- [Route](../interfaces/lib_router.Route.md)
- [RouteURLProps](../interfaces/lib_router.RouteURLProps.md)

## Variables

### NotFoundRoute

• **NotFoundRoute**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `component` | () => `Element` |
| `exact` | `boolean` |
| `name` | `string` |
| `noAuthRequired` | `boolean` |
| `path` | `string` |
| `sidebar` | ``null`` |

#### Defined in

[lib/router.tsx:761](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L761)

## Functions

### createRouteURL

▸ **createRouteURL**(`routeName`, `params?`): `string`

#### Parameters

| Name | Type |
| :------ | :------ |
| `routeName` | `string` |
| `params` | [`RouteURLProps`](../interfaces/lib_router.RouteURLProps.md) |

#### Returns

`string`

#### Defined in

[lib/router.tsx:819](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L819)

___

### getDefaultRoutes

▸ **getDefaultRoutes**(): `Object`

#### Returns

`Object`

#### Defined in

[lib/router.tsx:847](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L847)

___

### getRoute

▸ **getRoute**(`routeName`): [`Route`](../interfaces/lib_router.Route.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `routeName` | `string` |

#### Returns

[`Route`](../interfaces/lib_router.Route.md)

#### Defined in

[lib/router.tsx:770](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L770)

___

### getRoutePath

▸ **getRoutePath**(`route`): `string`

#### Parameters

| Name | Type |
| :------ | :------ |
| `route` | [`Route`](../interfaces/lib_router.Route.md) |

#### Returns

`string`

#### Defined in

[lib/router.tsx:803](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L803)

___

### getRouteUseClusterURL

▸ **getRouteUseClusterURL**(`route`): `boolean`

Should the route use a cluster URL?

#### Parameters

| Name | Type |
| :------ | :------ |
| `route` | [`Route`](../interfaces/lib_router.Route.md) |

#### Returns

`boolean`

true when a cluster URL contains cluster in the URL. eg. /c/minikube/my-url
  false, the URL does not contain the cluster. eg. /my-url

#### Defined in

[lib/router.tsx:791](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/router.tsx#L791)
