# Interface: LogOptions

Defined in: [lib/k8s/pod.ts:93](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/pod.ts#L93)

## Properties

### follow?

```ts
optional follow?: boolean;
```

Defined in: [lib/k8s/pod.ts:101](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/pod.ts#L101)

Whether to follow the log stream

***

### formatJsonValues?

```ts
optional formatJsonValues?: boolean;
```

Defined in: [lib/k8s/pod.ts:105](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/pod.ts#L105)

Whether to format JSON string values by unescaping string literals

***

### onReconnectStop?

```ts
optional onReconnectStop?: () => void;
```

Defined in: [lib/k8s/pod.ts:107](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/pod.ts#L107)

Callback to be called when the reconnection attempts stop

#### Returns

`void`

***

### prettifyLogs?

```ts
optional prettifyLogs?: boolean;
```

Defined in: [lib/k8s/pod.ts:103](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/pod.ts#L103)

Whether to prettify JSON logs with formatted indentation

***

### showPrevious?

```ts
optional showPrevious?: boolean;
```

Defined in: [lib/k8s/pod.ts:97](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/pod.ts#L97)

Whether to show the logs from previous runs of the container (only for restarted containers)

***

### showTimestamps?

```ts
optional showTimestamps?: boolean;
```

Defined in: [lib/k8s/pod.ts:99](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/pod.ts#L99)

Whether to show the timestamps in the logs

***

### tailLines?

```ts
optional tailLines?: number;
```

Defined in: [lib/k8s/pod.ts:95](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/pod.ts#L95)

The number of lines to display from the end side of the log
