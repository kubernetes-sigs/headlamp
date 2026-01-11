# Interface: CallbackActionOptions

## Properties

### callbackArgs?

```ts
optional callbackArgs: any[];
```

#### Defined in

[src/redux/clusterActionSlice.ts:86](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L86)

***

### cancelCallback()?

```ts
optional cancelCallback: (...args: any[]) => void;
```

A callback to execute when the action is cancelled.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | `any`[] |

#### Returns

`void`

#### Defined in

[src/redux/clusterActionSlice.ts:138](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L138)

***

### cancelUrl?

```ts
optional cancelUrl: string;
```

The url to navigate to when it is cancelled.

#### Defined in

[src/redux/clusterActionSlice.ts:94](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L94)

***

### cancelledMessage?

```ts
optional cancelledMessage: string;
```

The message to display when the action is cancelled.

#### Defined in

[src/redux/clusterActionSlice.ts:110](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L110)

***

### cancelledOptions?

```ts
optional cancelledOptions: OptionsObject<
  | "warning"
  | "error"
  | "default"
  | "success"
| "info">;
```

The props to pass to the snackbar when the action is cancelled.

#### Defined in

[src/redux/clusterActionSlice.ts:126](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L126)

***

### errorMessage?

```ts
optional errorMessage: string;
```

The message to display when there is an error.

#### Defined in

[src/redux/clusterActionSlice.ts:114](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L114)

***

### errorOptions?

```ts
optional errorOptions: OptionsObject<
  | "warning"
  | "error"
  | "default"
  | "success"
| "info">;
```

The props to pass to the snackbar when it is successful.

#### Defined in

[src/redux/clusterActionSlice.ts:134](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L134)

***

### errorUrl?

```ts
optional errorUrl: string;
```

The url to navigate to when there is an error.

#### Defined in

[src/redux/clusterActionSlice.ts:98](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L98)

***

### startMessage?

```ts
optional startMessage: string;
```

The message to display when the action has started.

#### Defined in

[src/redux/clusterActionSlice.ts:106](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L106)

***

### startOptions?

```ts
optional startOptions: OptionsObject<
  | "warning"
  | "error"
  | "default"
  | "success"
| "info">;
```

The props to pass to the snackbar when the action has started.

#### Defined in

[src/redux/clusterActionSlice.ts:122](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L122)

***

### startUrl?

```ts
optional startUrl: string;
```

The url to navigate to when the action has started.

#### Defined in

[src/redux/clusterActionSlice.ts:90](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L90)

***

### successMessage?

```ts
optional successMessage: string;
```

The message to display when it is successful.

#### Defined in

[src/redux/clusterActionSlice.ts:118](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L118)

***

### successOptions?

```ts
optional successOptions: OptionsObject<
  | "warning"
  | "error"
  | "default"
  | "success"
| "info">;
```

The props to pass to the snackbar when there is an error.

#### Defined in

[src/redux/clusterActionSlice.ts:130](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L130)

***

### successUrl?

```ts
optional successUrl: string;
```

The url to navigate to when it is successful.

#### Defined in

[src/redux/clusterActionSlice.ts:102](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/clusterActionSlice.ts#L102)
