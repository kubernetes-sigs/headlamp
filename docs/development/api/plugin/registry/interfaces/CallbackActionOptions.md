# Interface: CallbackActionOptions

Defined in: [redux/clusterActionSlice.ts:85](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L85)

## Properties

### callbackArgs?

```ts
optional callbackArgs?: any[];
```

Defined in: [redux/clusterActionSlice.ts:86](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L86)

***

### cancelCallback?

```ts
optional cancelCallback?: (...args: any[]) => void;
```

Defined in: [redux/clusterActionSlice.ts:138](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L138)

A callback to execute when the action is cancelled.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | `any`[] |

#### Returns

`void`

***

### cancelledMessage?

```ts
optional cancelledMessage?: string;
```

Defined in: [redux/clusterActionSlice.ts:110](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L110)

The message to display when the action is cancelled.

***

### cancelledOptions?

```ts
optional cancelledOptions?: OptionsObject<"warning" | "error" | "default" | "success" | "info">;
```

Defined in: [redux/clusterActionSlice.ts:126](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L126)

The props to pass to the snackbar when the action is cancelled.

***

### cancelUrl?

```ts
optional cancelUrl?: string;
```

Defined in: [redux/clusterActionSlice.ts:94](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L94)

The url to navigate to when it is cancelled.

***

### errorMessage?

```ts
optional errorMessage?: string;
```

Defined in: [redux/clusterActionSlice.ts:114](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L114)

The message to display when there is an error.

***

### errorOptions?

```ts
optional errorOptions?: OptionsObject<"warning" | "error" | "default" | "success" | "info">;
```

Defined in: [redux/clusterActionSlice.ts:134](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L134)

The props to pass to the snackbar when it is successful.

***

### errorUrl?

```ts
optional errorUrl?: string;
```

Defined in: [redux/clusterActionSlice.ts:98](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L98)

The url to navigate to when there is an error.

***

### startMessage?

```ts
optional startMessage?: string;
```

Defined in: [redux/clusterActionSlice.ts:106](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L106)

The message to display when the action has started.

***

### startOptions?

```ts
optional startOptions?: OptionsObject<"warning" | "error" | "default" | "success" | "info">;
```

Defined in: [redux/clusterActionSlice.ts:122](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L122)

The props to pass to the snackbar when the action has started.

***

### startUrl?

```ts
optional startUrl?: string;
```

Defined in: [redux/clusterActionSlice.ts:90](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L90)

The url to navigate to when the action has started.

***

### successMessage?

```ts
optional successMessage?: string;
```

Defined in: [redux/clusterActionSlice.ts:118](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L118)

The message to display when it is successful.

***

### successOptions?

```ts
optional successOptions?: OptionsObject<"warning" | "error" | "default" | "success" | "info">;
```

Defined in: [redux/clusterActionSlice.ts:130](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L130)

The props to pass to the snackbar when there is an error.

***

### successUrl?

```ts
optional successUrl?: string;
```

Defined in: [redux/clusterActionSlice.ts:102](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/clusterActionSlice.ts#L102)

The url to navigate to when it is successful.
