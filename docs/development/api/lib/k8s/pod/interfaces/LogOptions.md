# Interface: LogOptions

Defined in: [lib/k8s/pod.ts:100](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/pod.ts#L100)

## Properties

### follow?

```ts
optional follow?: boolean;
```

Defined in: [lib/k8s/pod.ts:108](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/pod.ts#L108)

Whether to follow the log stream

***

### formatJsonValues?

```ts
optional formatJsonValues?: boolean;
```

Defined in: [lib/k8s/pod.ts:112](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/pod.ts#L112)

Whether to format JSON string values by unescaping string literals

***

### onReconnectStop?

```ts
optional onReconnectStop?: () => void;
```

Defined in: [lib/k8s/pod.ts:114](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/pod.ts#L114)

Callback to be called when the reconnection attempts stop

#### Returns

`void`

***

### prettifyLogs?

```ts
optional prettifyLogs?: boolean;
```

Defined in: [lib/k8s/pod.ts:110](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/pod.ts#L110)

Whether to prettify JSON logs with formatted indentation

***

### showPrevious?

```ts
optional showPrevious?: boolean;
```

Defined in: [lib/k8s/pod.ts:104](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/pod.ts#L104)

Whether to show the logs from previous runs of the container (only for restarted containers)

***

### showTimestamps?

```ts
optional showTimestamps?: boolean;
```

Defined in: [lib/k8s/pod.ts:106](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/pod.ts#L106)

Whether to show the timestamps in the logs

***

### tailLines?

```ts
optional tailLines?: number;
```

Defined in: [lib/k8s/pod.ts:102](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/pod.ts#L102)

The number of lines to display from the end side of the log
