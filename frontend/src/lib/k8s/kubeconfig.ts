/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * KubeconfigObject is the object that is stored in indexDB as string format.
 * It is a JSON encoded version of the kubeconfig file.
 * It is used to store the kubeconfig for stateless clusters.
 * This is basically a k8s client - go Kubeconfig object.
 * KubeconfigObject holds the information needed to build connect to remote kubernetes clusters as a given user
 * * @see {@link https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/ | more info}
 * @see storeStatelessClusterKubeconfig
 * @see getStatelessClusterKubeConfigs
 * @see findKubeconfigByClusterName
 */
export interface KubeconfigObject {
  /** version of the kubeconfig file. */
  apiVersion: string;
  /** kind is the type of the kubeconfig file. It is always 'Config'. */
  kind: string;
  /** Preferences holds general information to be use for cli interactions
   * @see {@link https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#Preferences | more info}
   */
  preferences?: {
    /** colors specifies whether output should use colors. */
    colors?: boolean;
    /** extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields on the Preferences object. */
    extensions?: Array<{
      /** name is the nickname of the extension. */
      name: string;
      /** Extension holds the extension information */
      extension: {};
    }>;
  };
  /** Clusters is a map of referencable names to cluster configs.
   * @see {@link https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedCluster | more info}
   */
  clusters: Array<{
    /** name is the name of the cluster. */
    name: string;
    /** cluster is the cluster information.
     * @see {@link https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#Cluster | more info}
     */
    cluster: {
      /** Server is the address of the kubernetes cluster (https://hostname:port). */
      server: string;
      /** TLSServerName is used to check server certificate. If TLSServerName is empty, the hostname used to contact the server is used. */
      tlsServerName?: string;
      /** InsecureSkipTLSVerify skips the validity check for the server's certificate. This will make your HTTPS connections insecure. */
      insecureSkipTLSVerify?: boolean;
      /** CertificateAuthority is the path to a cert file for the certificate authority. */
      certificateAuthority?: string;
      /** CertificateAuthorityData contains PEM-encoded certificate authority certificates. Overrides CertificateAuthority */
      certificateAuthorityData?: string;
      /** ProxyURL is the URL to the proxy to be used for requests to this cluster. */
      proxyURL?: string;
      /** Extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields on the Cluster object. */
      /** DisableCompression allows client to opt-out of response compression for all requests to the server. This is useful to speed up requests (specifically lists) when client-server network bandwidth is ample, by saving time on compression (server-side) and decompression (client-side): https://github.com/kubernetes/kubernetes/issues/112296. */
      disableCompression?: boolean;
      extensions?: Array<{
        /** name is the nickname of the extension. */
        name: string;
        /** Extension holds the extension information */
        extension: {};
      }>;
    };
  }>;
  /** AuthInfos is a map of referencable names to user configs.
   * @see {@link https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedAuthInfo | more info}
   */
  users: Array<{
    /** name is the name of the user. */
    name: string;
    /** holds the auth information
     * @see {@link https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#AuthInfo | more info}
     *  */
    user: {
      /** ClientCertificate is the path to a client key file for TLS. */
      clientCertificate?: string;
      /** ClientCertificateData contains PEM-encoded data from a client key file for TLS. */
      clientCertificateData?: string;
      /** ClientKey is the path to a client key file for TLS. */
      clientKey?: string;
      /** ClientKeyData contains PEM-encoded data from a client key file for TLS. */
      clientKeyData?: string;
      /** Token is the bearer token for authentication to the kubernetes cluster. */
      token?: string;
      /** TokenFile is a pointer to a file that contains a bearer token (as described above). */
      tokenFile?: string;
      /** Impersonate is the username to imperonate. */
      impersonate?: string;
      /** ImpersonateGroups is the groups to imperonate. */
      impersonateGroups?: string[];
      /** ImpersonateUserExtra contains additional information for impersonated user. */
      impersonateUserExtra?: {
        [key: string]: string[];
      };
      /** Username is the username for basic authentication to the kubernetes cluster. */
      username?: string;
      /** Password is the password for basic authentication to the kubernetes cluster. */
      password?: string;
      /** AuthProvider is a reference to a specific auth provider. */
      authProvider?: {
        /** name is the name of the auth provider. */
        name: string;
        /** config is a map of strings to objects. The contents of the map are dependent on the provider: */
        config: {
          [key: string]: string;
        };
      };
      /** Exec specifies a command to provide client credentials. */
      exec?: {
        /** Command to execute. */
        command: string;
        /** Arguments to pass to the command when executing it. */
        args?: string[];
        /** Env defines additional environment variables to expose to the process. */
        env?: {
          [key: string]: string;
        };
      };
      /** Extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields on the AuthInfo object. */
      extensions?: Array<{
        /** name is the nickname of the extension. */
        name: string;
        /** Extension holds the extension information */
        extension: {};
      }>;
    };
  }>;
  /** Contexts is a map of referencable names to context configs.
   * @see {@link https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedContext | more info}
   */
  contexts: Array<{
    /** name is the name of the context. */
    name: string;
    /** context is the context information. */
    context: {
      /** cluster is the cluster information. */
      cluster: string;
      /** user is the user information. */
      user: string;
      /** namespace is the default namespace. */
      namespace?: string;
      /**  this is needed for attaching clusterID to the cluster for accurate cluster actions */
      clusterID?: string;
      /** Source for kubeconfig */
      source?: string;
      /** Extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields on the Context object. */
      extensions?: Array<{
        /** name is the nickname of the extension. */
        name: string;
        /** Extension holds the extension information */
        extension: {
          /** customName is the custom name for the cluster. */
          customName?: string;
        };
      }>;
    };
  }>;
  /** CurrentContext is the name of the context that you would like to use by default */
  'current-context': string;
  /** Extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields
   * @see {@link https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedExtension | more info}
   */
  extensions?: Array<{
    /** name is the nickname of the extension. */
    name: string;
    /** Extension holds the extension information */
    extension: {};
  }>;
}
