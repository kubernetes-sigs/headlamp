/*
Copyright 2026 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package clusterdiscovery

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd/api"
)

// Descriptor identifies a source without coupling the engine to its resource types.
type Descriptor struct {
	ID          string
	DisplayName string
	Resource    schema.GroupVersionResource
	// ContextSource preserves existing source values. New sources use DiscoveredCluster.
	ContextSource int
	View          SourceView
}

// Settings selects a registered source and scopes its resource watches.
type Settings struct {
	Enabled               bool
	Namespaces            string
	LabelSelector         string
	RootReconcileInterval time.Duration
	NoCRDCacheTTL         time.Duration
}

// FlagPrefix keeps standard flags consistent with the public source ID.
func (d Descriptor) FlagPrefix() string { return strings.ReplaceAll(d.ID, "_", "-") }

// Source describes resource watches and converts their cached objects to kubeconfigs.
// Build must not return cluster credentials; the engine supplies user OIDC authentication.
type Source interface {
	Descriptor() Descriptor
	Watches(config *rest.Config, namespace, selector string) ([]ResourceWatch, error)
	OwnersForChange(resource schema.GroupVersionResource, obj interface{}) []types.NamespacedName
	Build(root string, owner types.NamespacedName, snapshot Snapshot) ([]GeneratedKubeconfig, error)
}

// InformerFactory is the lifecycle shared by typed and dynamic informer factories.
type InformerFactory interface {
	Start(stopCh <-chan struct{})
	Shutdown()
}

// ResourceWatch pairs a resource cache with the factory that owns it.
type ResourceWatch struct {
	Resource schema.GroupVersionResource
	Factory  InformerFactory
	Informer cache.SharedIndexInformer
}

// Snapshot gives adapters access to the current resource caches within one namespace watch.
type Snapshot interface {
	Get(resource schema.GroupVersionResource, owner types.NamespacedName) (interface{}, bool)
}

// GeneratedKubeconfig is one stable connection produced by a source owner.
type GeneratedKubeconfig struct {
	Key          string
	Name         string
	ClusterID    string
	Config       *api.Config
	Metadata     map[string]json.RawMessage
	Presentation *kubeconfig.ConnectionPresentation
}

// Registry contains the sources linked into this Headlamp binary.
type Registry struct{ sources []Source }

func (r *Registry) Register(source Source) error {
	if source == nil {
		return errors.New("discovery source is required")
	}

	d := source.Descriptor()
	if d.ID == "" || d.DisplayName == "" || d.Resource.Empty() {
		return errors.New("discovery source descriptor is incomplete")
	}

	for _, existing := range r.sources {
		if existing.Descriptor().ID == d.ID {
			return fmt.Errorf("discovery source %q already registered", d.ID)
		}
	}

	r.sources = append(r.sources, source)

	return nil
}

func (r *Registry) Sources() []Source { return append([]Source(nil), r.sources...) }

// ConfigForCluster builds a credential-free kubeconfig for a source connection.
func ConfigForCluster(name string, cluster *api.Cluster, namespace string) *api.Config {
	return &api.Config{
		Clusters:       map[string]*api.Cluster{name: cluster},
		Contexts:       map[string]*api.Context{name: {Cluster: name, Namespace: namespace}},
		CurrentContext: name,
	}
}

// ConnectionCluster copies connection fields supported by discovered kubeconfigs.
// Local file paths and extensions are never interpreted on the Headlamp host.
func ConnectionCluster(cluster *api.Cluster) (*api.Cluster, error) {
	if cluster == nil || cluster.Server == "" {
		return nil, errors.New("access provider has no server URL")
	}

	server, err := url.Parse(cluster.Server)
	if err != nil || server.Scheme != "https" || server.Hostname() == "" || server.User != nil || server.RawQuery != "" ||
		server.Fragment != "" {
		return nil, errors.New("discovery server must be an HTTPS URL without credentials, query or fragment")
	}

	if cluster.ProxyURL != "" {
		proxy, err := url.Parse(cluster.ProxyURL)
		if err != nil || proxy.Hostname() == "" ||
			(proxy.Scheme != "http" && proxy.Scheme != "https" && proxy.Scheme != "socks5") {
			return nil, errors.New("discovery proxy must be an HTTP, HTTPS or SOCKS5 URL")
		}
	}

	return &api.Cluster{
		Server:                   cluster.Server,
		TLSServerName:            cluster.TLSServerName,
		InsecureSkipTLSVerify:    cluster.InsecureSkipTLSVerify,
		CertificateAuthorityData: append([]byte(nil), cluster.CertificateAuthorityData...),
		ProxyURL:                 cluster.ProxyURL,
		DisableCompression:       cluster.DisableCompression,
	}, nil
}

// loadGenerated uses the same loader and OIDC settings for every registered source.
func (r *Runner) loadGenerated(
	root string,
	owner types.NamespacedName,
	g GeneratedKubeconfig,
) (*kubeconfig.Context, error) {
	config, err := generatedOIDCConfig(g, r.oidcConfig)
	if err != nil {
		return nil, err
	}

	contexts, errs := kubeconfig.LoadContextsFromAPIConfig(config, false)
	if len(errs) > 0 {
		return nil, errors.Join(errs...)
	}

	if len(contexts) != 1 {
		return nil, errors.New("generated kubeconfig did not produce one context")
	}

	context := &contexts[0]
	d := r.source.Descriptor()

	context.Source = d.ContextSource
	if context.Source == 0 {
		context.Source = kubeconfig.DiscoveredCluster
	}

	context.Presentation = generatedPresentation(root, owner, g)
	context.ClusterID = g.ClusterID
	context.OidcConf = r.oidcConfig.Copy()
	context.Discovery = &kubeconfig.DiscoveryOrigin{
		Source:      d.ID,
		DisplayName: d.DisplayName,
		Root:        root,
		Namespace:   owner.Namespace,
		Name:        owner.Name,
		Entry:       g.Key,
	}

	if err := context.SetDiscoveryMetadata(g.Metadata); err != nil {
		return nil, err
	}

	return context, nil
}

func (w rootWatch) Get(resource schema.GroupVersionResource, owner types.NamespacedName) (interface{}, bool) {
	for _, watch := range w.resources {
		if watch.Resource == resource {
			obj, exists, err := watch.Informer.GetIndexer().GetByKey(owner.Namespace + "/" + owner.Name)
			return obj, exists && err == nil
		}
	}

	return nil, false
}

func (w rootWatch) hasSynced() bool {
	for _, watch := range w.resources {
		if !watch.Informer.HasSynced() {
			return false
		}
	}

	return true
}

func objectOwner(obj interface{}) []types.NamespacedName {
	if tombstone, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		return objectOwner(tombstone.Obj)
	}

	if tombstone, ok := obj.(*cache.DeletedFinalStateUnknown); ok {
		return objectOwner(tombstone.Obj)
	}

	meta, ok := obj.(metav1.Object)
	if !ok {
		return nil
	}

	return []types.NamespacedName{{Namespace: meta.GetNamespace(), Name: meta.GetName()}}
}

func generatedOIDCConfig(g GeneratedKubeconfig, oidc *kubeconfig.OidcConfig) (*api.Config, error) {
	if g.Key == "" || g.Name == "" || g.ClusterID == "" || g.Config == nil || len(g.Config.Contexts) != 1 {
		return nil, errors.New("generated connection must identify exactly one context")
	}

	var (
		namespace string
		cluster   *api.Cluster
	)

	for _, context := range g.Config.Contexts {
		if context == nil {
			return nil, errors.New("generated kubeconfig context is nil")
		}

		namespace = context.Namespace
		cluster = g.Config.Clusters[context.Cluster]
	}

	connection, err := ConnectionCluster(cluster)
	if err != nil {
		return nil, err
	}

	config := ConfigForCluster(g.Name, connection, namespace)

	settings := map[string]string{
		"client-id":      oidc.ClientID,
		"idp-issuer-url": oidc.IdpIssuerURL,
		"scope":          strings.Join(oidc.Scopes, ","),
	}
	if oidc.CACert != nil {
		settings["idp-certificate-authority-data"] = base64.StdEncoding.EncodeToString([]byte(*oidc.CACert))
	}

	config.AuthInfos = map[string]*api.AuthInfo{
		g.Name: {
			AuthProvider: &api.AuthProviderConfig{Name: "oidc", Config: settings},
		},
	}
	config.Contexts[g.Name].AuthInfo = g.Name

	return config, nil
}

func generatedPresentation(
	root string, owner types.NamespacedName, g GeneratedKubeconfig,
) *kubeconfig.ConnectionPresentation {
	presentation := g.Presentation.Copy()
	if presentation == nil {
		presentation = &kubeconfig.ConnectionPresentation{}
	}

	if presentation.DisplayName == "" {
		presentation.DisplayName = owner.Name
	}

	if presentation.Fields == nil {
		presentation.Fields = map[string]string{}
	}

	presentation.Fields["namespace"] = owner.Namespace
	presentation.Fields[logFieldRoot] = strings.TrimPrefix(root, storeRootPrefix)

	return presentation
}
