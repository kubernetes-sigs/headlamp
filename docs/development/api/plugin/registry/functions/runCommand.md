# Function: runCommand()

```ts
function runCommand(
   command: "minikube" | "az" | "scriptjs", 
   args: string[], 
   options: object, 
   permissionSecrets?: Record<string, number>, 
   desktopApiSend?: (channel: string, data: object) => void, 
   desktopApiReceive?: (channel: string, listener: (cmdId: string, data: string | number) => void) => void): object
```

Runs a shell command and returns an object that mimics the interface of a ChildProcess object returned by Node's spawn function.

This function is intended to be used only when Headlamp is in app mode.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `command` | `"minikube"` \| `"az"` \| `"scriptjs"` | The command to run. |
| `args` | `string`[] | An array of arguments to pass to the command. |
| `options` | `object` | Additional options for the command. |
| `permissionSecrets`? | `Record`\<`string`, `number`\> | Internal use. A record of permission secrets that may be required for the command. |
| `desktopApiSend`? | (`channel`: `string`, `data`: `object`) => `void` | Internal use. The function to send data to the main process. |
| `desktopApiReceive`? | (`channel`: `string`, `listener`: (`cmdId`: `string`, `data`: `string` \| `number`) => `void`) => `void` | Internal use. The function to receive data from the main process. |

## Returns

`object`

An object with `stdout`, `stderr`, and `on` properties. You can listen for 'data' events on `stdout` and `stderr`, and 'exit' events with `on`.

### on()

```ts
on: (event: string, listener: (code: number | null) => void) => void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `string` |
| `listener` | (`code`: `number` \| `null`) => `void` |

#### Returns

`void`

### stderr

```ts
stderr: object;
```

### stderr.on()

```ts
on: (event: string, listener: (chunk: any) => void) => void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `string` |
| `listener` | (`chunk`: `any`) => `void` |

#### Returns

`void`

### stdout

```ts
stdout: object;
```

### stdout.on()

```ts
on: (event: string, listener: (chunk: any) => void) => void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `string` |
| `listener` | (`chunk`: `any`) => `void` |

#### Returns

`void`

## See

handleRunCommand in app/electron/main.ts

This function uses the desktopApi.send and desktopApi.receive methods to communicate with the main process.

## Example

How it can be used in a plugin:
```ts
  declare const pluginRunCommand: typeof runCommand;
  const minikube = pluginRunCommand('minikube', ['status'], {});

  minikube.stdout.on('data', (data) => {
    console.log('stdout:', data);
  });
  minikube.stderr.on('data', (data) => {
    console.log('stderr:', data);
  });
  minikube.on('exit', (code) => {
    console.log('exit code:', code);
  });
```

## Defined in

[src/components/App/runCommand.ts:50](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/App/runCommand.ts#L50)
