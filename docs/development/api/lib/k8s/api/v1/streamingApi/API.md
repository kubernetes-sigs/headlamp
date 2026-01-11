# lib/k8s/api/v1/streamingApi

## Index

### Interfaces

| Interface | Description |
| ------ | ------ |
| [StreamArgs](interfaces/StreamArgs.md) | Configure a stream with... StreamArgs. |
| [StreamResultsParams](interfaces/StreamResultsParams.md) | - |

### Type Aliases

| Type alias | Description |
| ------ | ------ |
| [StreamErrCb](type-aliases/StreamErrCb.md) | - |
| [StreamResultsCb](type-aliases/StreamResultsCb.md) | - |
| [StreamUpdate](type-aliases/StreamUpdate.md) | - |
| [StreamUpdatesCb](type-aliases/StreamUpdatesCb.md) | - |

### Functions

| Function | Description |
| ------ | ------ |
| [connectStream](functions/connectStream.md) | Connects to a WebSocket stream at the specified path and returns an object with a `close` function and a `socket` property. Sends messages to `cb` callback. |
| [connectStreamWithParams](functions/connectStreamWithParams.md) | connectStreamWithParams is a wrapper around connectStream that allows for more flexibility in the parameters that can be passed to the WebSocket connection. |
| [stream](functions/stream.md) | Establishes a WebSocket connection to the specified URL and streams the results to the provided callback function. |
| [streamResult](functions/streamResult.md) | Fetches the data and watches for changes to the data. |
| [streamResults](functions/streamResults.md) | Streams the results of a Kubernetes API request. |
| [streamResultsForCluster](functions/streamResultsForCluster.md) | - |
