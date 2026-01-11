# Interface: KubeContainer

## Link

https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#container-v1-core

## Properties

### args?

```ts
optional args: string[];
```

Arguments to the entrypoint. The container image's CMD is used if this is not provided.
Variable references $(VAR_NAME) are expanded using the container's environment.
If a variable cannot be resolved, the reference in the input string will be unchanged.
Double $$ are reduced to a single $, which allows for escaping the $(VAR_NAME)
syntax: i.e. "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)".
Escaped references will never be expanded, regardless of whether the variable exists or not.
Cannot be updated.

#### See

[more information](https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell)

#### Defined in

[src/lib/k8s/cluster.ts:193](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L193)

***

### command?

```ts
optional command: string[];
```

Entrypoint array. Not executed within a shell. The container image's ENTRYPOINT is used if
this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment.
If a variable cannot be resolved, the reference in the input string will be unchanged.
Double $$ are reduced to a single $, which allows for escaping the $(VAR_NAME)
syntax: i.e. "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)".
Escaped references will never be expanded, regardless of whether the variable exists or not.
Cannot be updated.

#### See

[more information](https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell)

#### Defined in

[src/lib/k8s/cluster.ts:205](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L205)

***

### env?

```ts
optional env: object[];
```

List of environment variables to set in the container. Cannot be updated.

#### Defined in

[src/lib/k8s/cluster.ts:208](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L208)

***

### envFrom?

```ts
optional envFrom: object[];
```

#### Defined in

[src/lib/k8s/cluster.ts:270](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L270)

***

### image

```ts
image: string;
```

Container image name. This field is optional to allow higher level config management to
default or override container images in workload controllers like Deployments and StatefulSets.

#### See

[more info](https://kubernetes.io/docs/concepts/containers/images)

#### Defined in

[src/lib/k8s/cluster.ts:294](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L294)

***

### imagePullPolicy

```ts
imagePullPolicy: string;
```

Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is
specified, or IfNotPresent otherwise. Cannot be updated.

#### See

[more info](https://kubernetes.io/docs/concepts/containers/images#updating-images)

#### Defined in

[src/lib/k8s/cluster.ts:302](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L302)

***

### livenessProbe?

```ts
optional livenessProbe: KubeContainerProbe;
```

Periodic probe of container liveness. Container will be restarted if the probe fails.
Cannot be updated.

#### See

[more info](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes)

#### Defined in

[src/lib/k8s/cluster.ts:312](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L312)

***

### name

```ts
name: string;
```

Name of the container specified as a DNS_LABEL.
Each container in a pod must have a unique name (DNS_LABEL).

Cannot be updated.

#### Defined in

[src/lib/k8s/cluster.ts:320](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L320)

***

### ports?

```ts
optional ports: object[];
```

List of ports to expose from the container. Not specifying a port here DOES NOT prevent that
port from being exposed. Any port which is listening on the default "0.0.0.0" address inside
a container will be accessible from the network. Modifying this array with strategic merge
patch may corrupt the data. For more information See https://github.com/kubernetes/kubernetes/issues/108255.

Cannot be updated.

https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#containerport-v1-core

#### Defined in

[src/lib/k8s/cluster.ts:332](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L332)

***

### readinessProbe?

```ts
optional readinessProbe: KubeContainerProbe;
```

Periodic probe of container service readiness. Container will be removed from service endpoints
if the probe fails.

Cannot be updated.

#### See

[more info](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes)

#### Defined in

[src/lib/k8s/cluster.ts:355](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L355)

***

### resizePolicy?

```ts
optional resizePolicy: object[];
```

Resources resize policy for the container.

#### Defined in

[src/lib/k8s/cluster.ts:357](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L357)

***

### resources?

```ts
optional resources: object;
```

Compute Resources required by this container. Cannot be updated.

#### claims?

```ts
optional claims: object;
```

#### claims.name

```ts
name: string;
```

Name must match the name of one entry in pod.spec.resourceClaims of the Pod where
this field is used. It makes that resource available inside a container.

#### limits?

```ts
optional limits: object;
```

Limits describes the maximum amount of compute resources allowed.

##### See

[more info](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

Can also have hugpages like: "hugepages-2Mi": "100Mi" // Requesting 100 Mebibytes of 2 MiB HugePages

#### limits.cpu?

```ts
optional cpu: string;
```

example "100m", 100 milliCPU (0.1 CPU core)

#### limits.memory?

```ts
optional memory: string;
```

example , "256Mi" 256 Mebibytes

#### requests?

```ts
optional requests: object;
```

#### requests.cpu?

```ts
optional cpu: string;
```

example "500m", 500 milliCPU (0.5 CPU core)

#### requests.memory?

```ts
optional memory: string;
```

example , "1Gi" 1 Gibibyte

#### See

[more info](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#resourcerequirements-v1-core

#### Defined in

[src/lib/k8s/cluster.ts:376](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L376)

***

### restartPolicy?

```ts
optional restartPolicy: string;
```

RestartPolicy defines the restart behavior of individual containers in a pod. This field may only be
set for init containers, and the only allowed value is "Always". For non-init containers or when this
field is not specified, the restart behavior is defined by the Pod's restart policy and the container
type. Setting the RestartPolicy as "Always" for the init container will have the following effect: this
init container will be continually restarted on exit until all regular containers have terminated.
Once all regular containers have completed, all init containers with restartPolicy "Always" will be
shut down. This lifecycle differs from normal init containers and is often referred to as a "sidecar"
container. Although this init container still starts in the init container sequence, it does not wait for
the container to complete before proceeding to the next init container. Instead, the next init
container starts immediately after this init container is started, or after any startupProbe has
successfully completed.

#### Defined in

[src/lib/k8s/cluster.ts:418](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L418)

***

### stdin?

```ts
optional stdin: boolean;
```

Whether this container should allocate a buffer for stdin in the container runtime.
If this is not set, reads from stdin in the container will always result in EOF.

Default is false.

#### Defined in

[src/lib/k8s/cluster.ts:458](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L458)

***

### stdinOnce?

```ts
optional stdinOnce: boolean;
```

Whether the container runtime should close the stdin channel after it has been opened
by a single attach. When stdin is true the stdin stream will remain open across
multiple attach sessions. If stdinOnce is set to true, stdin is opened on container start,
is empty until the first client attaches to stdin, and then remains open and accepts data
until the client disconnects, at which time stdin is closed and remains closed until the
container is restarted. If this flag is false, a container processes that reads from stdin
will never receive an EOF.

Default is false

#### Defined in

[src/lib/k8s/cluster.ts:470](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L470)

***

### terminationMessagePath?

```ts
optional terminationMessagePath: string;
```

Path at which the file to which the container's termination message will be written is mounted
into the container's filesystem. Message written is intended to be brief final status, such as
an assertion failure message. Will be truncated by the node if greater than 4096 bytes.
The total message length across all containers will be limited to 12kb.
Defaults to /dev/termination-log.

Cannot be updated.

#### Defined in

[src/lib/k8s/cluster.ts:433](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L433)

***

### terminationMessagePolicy?

```ts
optional terminationMessagePolicy: string;
```

Indicate how the termination message should be populated. File will use the contents of
terminationMessagePath to populate the container status message on both success and failure.
FallbackToLogsOnError will use the last chunk of container log output if the termination message
file is empty and the container exited with an error. The log output is limited to 2048 bytes or
80 lines, whichever is smaller. Defaults to File.

Cannot be updated.

#### Defined in

[src/lib/k8s/cluster.ts:444](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L444)

***

### tty?

```ts
optional tty: boolean;
```

Whether this container should allocate a TTY for itself, also requires
'stdin' to be true.

Default is false.

#### Defined in

[src/lib/k8s/cluster.ts:477](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L477)

***

### volumeDevices?

```ts
optional volumeDevices: object[];
```

volumeDevices is the list of block devices to be used by the container.

patch strategy: merge
patch merge key: devicePath

#### Defined in

[src/lib/k8s/cluster.ts:484](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L484)

***

### volumeMounts?

```ts
optional volumeMounts: object[];
```

#### Defined in

[src/lib/k8s/cluster.ts:446](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L446)

***

### workingDir?

```ts
optional workingDir: string;
```

Container's working directory. If not specified, the container runtime's default
will be used, which might be configured in the container image.
Cannot be updated.

#### Defined in

[src/lib/k8s/cluster.ts:495](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L495)
