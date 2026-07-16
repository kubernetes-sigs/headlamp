# Interface: KubeconfigObject

Defined in: [lib/k8s/kubeconfig.ts:28](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/kubeconfig.ts#L28)

KubeconfigObject is the object that is stored in indexDB as string format.
It is a JSON encoded version of the kubeconfig file.
It is used to store the kubeconfig for stateless clusters.
This is basically a k8s client - go Kubeconfig object.
KubeconfigObject holds the information needed to build connect to remote kubernetes clusters as a given user
*

## See

 - [more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/)
 - storeStatelessClusterKubeconfig
 - getStatelessClusterKubeConfigs
 - findKubeconfigByClusterName

## Properties

### apiVersion

```ts
apiVersion: string;
```

Defined in: [lib/k8s/kubeconfig.ts:30](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/kubeconfig.ts#L30)

version of the kubeconfig file.

***

### clusters

```ts
clusters: object[];
```

Defined in: [lib/k8s/kubeconfig.ts:50](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/kubeconfig.ts#L50)

Clusters is a map of referencable names to cluster configs.

#### cluster

```ts
cluster: object;
```

cluster is the cluster information.

##### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#Cluster)

##### cluster.certificateAuthority?

```ts
optional certificateAuthority?: string;
```

CertificateAuthority is the path to a cert file for the certificate authority.

##### cluster.certificateAuthorityData?

```ts
optional certificateAuthorityData?: string;
```

CertificateAuthorityData contains PEM-encoded certificate authority certificates. Overrides CertificateAuthority

##### cluster.disableCompression?

```ts
optional disableCompression?: boolean;
```

DisableCompression allows client to opt-out of response compression for all requests to the server. This is useful to speed up requests (specifically lists) when client-server network bandwidth is ample, by saving time on compression (server-side) and decompression (client-side): https://github.com/kubernetes/kubernetes/issues/112296.

##### cluster.extensions?

```ts
optional extensions?: object[];
```

##### cluster.insecureSkipTLSVerify?

```ts
optional insecureSkipTLSVerify?: boolean;
```

InsecureSkipTLSVerify skips the validity check for the server's certificate. This will make your HTTPS connections insecure.

##### cluster.proxyURL?

```ts
optional proxyURL?: string;
```

ProxyURL is the URL to the proxy to be used for requests to this cluster.

##### cluster.server

```ts
server: string;
```

Server is the address of the kubernetes cluster (`https://hostname:port`).

##### cluster.tlsServerName?

```ts
optional tlsServerName?: string;
```

TLSServerName is used to check server certificate. If TLSServerName is empty, the hostname used to contact the server is used.

#### name

```ts
name: string;
```

name is the name of the cluster.

#### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedCluster)

***

### contexts

```ts
contexts: object[];
```

Defined in: [lib/k8s/kubeconfig.ts:146](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/kubeconfig.ts#L146)

Contexts is a map of referencable names to context configs.

#### context

```ts
context: object;
```

context is the context information.

##### context.cluster

```ts
cluster: string;
```

cluster is the cluster information.

##### context.clusterID?

```ts
optional clusterID?: string;
```

this is needed for attaching clusterID to the cluster for accurate cluster actions

##### context.extensions?

```ts
optional extensions?: object[];
```

Extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields on the Context object.

##### context.namespace?

```ts
optional namespace?: string;
```

namespace is the default namespace.

##### context.source?

```ts
optional source?: string;
```

Source for kubeconfig

##### context.user

```ts
user: string;
```

user is the user information.

#### name

```ts
name: string;
```

name is the name of the context.

#### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedContext)

***

### current-context

```ts
current-context: string;
```

Defined in: [lib/k8s/kubeconfig.ts:174](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/kubeconfig.ts#L174)

CurrentContext is the name of the context that you would like to use by default

***

### extensions?

```ts
optional extensions?: object[];
```

Defined in: [lib/k8s/kubeconfig.ts:178](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/kubeconfig.ts#L178)

Extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields

#### extension

```ts
extension: object;
```

Extension holds the extension information

#### name

```ts
name: string;
```

name is the nickname of the extension.

#### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedExtension)

***

### kind

```ts
kind: string;
```

Defined in: [lib/k8s/kubeconfig.ts:32](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/kubeconfig.ts#L32)

kind is the type of the kubeconfig file. It is always 'Config'.

***

### preferences?

```ts
optional preferences?: object;
```

Defined in: [lib/k8s/kubeconfig.ts:36](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/kubeconfig.ts#L36)

Preferences holds general information to be use for cli interactions

#### colors?

```ts
optional colors?: boolean;
```

colors specifies whether output should use colors.

#### extensions?

```ts
optional extensions?: object[];
```

extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields on the Preferences object.

#### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#Preferences)

***

### users

```ts
users: object[];
```

Defined in: [lib/k8s/kubeconfig.ts:83](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/kubeconfig.ts#L83)

AuthInfos is a map of referencable names to user configs.

#### name

```ts
name: string;
```

name is the name of the user.

#### user

```ts
user: object;
```

holds the auth information

##### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#AuthInfo)

##### user.authProvider?

```ts
optional authProvider?: object;
```

AuthProvider is a reference to a specific auth provider.

##### user.authProvider.config

```ts
config: object;
```

config is a map of strings to objects. The contents of the map are dependent on the provider:

###### Index Signature

```ts
[key: string]: string
```

##### user.authProvider.name

```ts
name: string;
```

name is the name of the auth provider.

##### user.clientCertificate?

```ts
optional clientCertificate?: string;
```

ClientCertificate is the path to a client key file for TLS.

##### user.clientCertificateData?

```ts
optional clientCertificateData?: string;
```

ClientCertificateData contains PEM-encoded data from a client key file for TLS.

##### user.clientKey?

```ts
optional clientKey?: string;
```

ClientKey is the path to a client key file for TLS.

##### user.clientKeyData?

```ts
optional clientKeyData?: string;
```

ClientKeyData contains PEM-encoded data from a client key file for TLS.

##### user.exec?

```ts
optional exec?: object;
```

Exec specifies a command to provide client credentials.

##### user.exec.args?

```ts
optional args?: string[];
```

Arguments to pass to the command when executing it.

##### user.exec.command

```ts
command: string;
```

Command to execute.

##### user.exec.env?

```ts
optional env?: object;
```

Env defines additional environment variables to expose to the process.

###### Index Signature

```ts
[key: string]: string
```

##### user.extensions?

```ts
optional extensions?: object[];
```

Extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields on the AuthInfo object.

##### user.impersonate?

```ts
optional impersonate?: string;
```

Impersonate is the username to imperonate.

##### user.impersonateGroups?

```ts
optional impersonateGroups?: string[];
```

ImpersonateGroups is the groups to imperonate.

##### user.impersonateUserExtra?

```ts
optional impersonateUserExtra?: object;
```

ImpersonateUserExtra contains additional information for impersonated user.

###### Index Signature

```ts
[key: string]: string[]
```

##### user.password?

```ts
optional password?: string;
```

Password is the password for basic authentication to the kubernetes cluster.

##### user.token?

```ts
optional token?: string;
```

Token is the bearer token for authentication to the kubernetes cluster.

##### user.tokenFile?

```ts
optional tokenFile?: string;
```

TokenFile is a pointer to a file that contains a bearer token (as described above).

##### user.username?

```ts
optional username?: string;
```

Username is the username for basic authentication to the kubernetes cluster.

#### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedAuthInfo)
