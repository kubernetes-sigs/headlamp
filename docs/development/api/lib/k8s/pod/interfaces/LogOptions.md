# Interface: LogOptions

## Properties

### follow?

```ts
optional follow: boolean;
```

Whether to follow the log stream

#### Defined in

[src/lib/k8s/pod.ts:80](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L80)

***

### formatJsonValues?

```ts
optional formatJsonValues: boolean;
```

Whether to format JSON string values by unescaping string literals

#### Defined in

[src/lib/k8s/pod.ts:84](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L84)

***

### onReconnectStop()?

```ts
optional onReconnectStop: () => void;
```

Callback to be called when the reconnection attempts stop

#### Returns

`void`

#### Defined in

[src/lib/k8s/pod.ts:86](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L86)

***

### prettifyLogs?

```ts
optional prettifyLogs: boolean;
```

Whether to prettify JSON logs with formatted indentation

#### Defined in

[src/lib/k8s/pod.ts:82](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L82)

***

### showPrevious?

```ts
optional showPrevious: boolean;
```

Whether to show the logs from previous runs of the container (only for restarted containers)

#### Defined in

[src/lib/k8s/pod.ts:76](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L76)

***

### showTimestamps?

```ts
optional showTimestamps: boolean;
```

Whether to show the timestamps in the logs

#### Defined in

[src/lib/k8s/pod.ts:78](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L78)

***

### tailLines?

```ts
optional tailLines: number;
```

The number of lines to display from the end side of the log

#### Defined in

[src/lib/k8s/pod.ts:74](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L74)
