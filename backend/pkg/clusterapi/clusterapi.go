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

// Package clusterapi discovers Cluster API Cluster resources and registers them as
// Headlamp clusters, without reading their kubeconfig Secrets.
package clusterapi

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/validation"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterregistration"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const (
	registrationSource = "cluster-api"
	clusterGroup       = "cluster.x-k8s.io"

	defaultAPIPort         = int64(6443)
	discoveryRetryInterval = 5 * time.Minute

	logFieldCluster = "cluster"
)

// preferredClusterVersions are the Cluster API versions tried, most preferred first.
var preferredClusterVersions = []string{"v1beta2", "v1beta1"}

func clusterGVR(version string) schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: clusterGroup, Version: version, Resource: "clusters"}
}

// Options controls Cluster API discovery from a management cluster.
type Options struct {
	// Registry stores source-independent, routable cluster registrations.
	Registry *clusterregistration.Registry
	// RESTConfig connects to the management cluster hosting the Cluster resources.
	RESTConfig *rest.Config
	// OriginCluster is the Headlamp cluster ID of the management cluster.
	OriginCluster string
	// DefaultNamespace is watched when Namespaces is empty.
	DefaultNamespace string
	// Namespaces limits discovery as parsed by [clusterregistration.ParseNamespaces].
	// Empty watches DefaultNamespace.
	Namespaces string
	// LabelSelector filters Cluster resources before they are registered.
	LabelSelector string
	// OIDCConfig is copied to discovered contexts.
	OIDCConfig *kubeconfig.OidcConfig
}

// Runner watches Cluster API Cluster resources and updates the shared registry.
type Runner struct {
	registry      *clusterregistration.Registry
	discovery     discovery.DiscoveryInterface
	client        dynamic.Interface
	originCluster string
	namespaces    []string
	labelSelector labels.Selector
	oidcConfig    *kubeconfig.OidcConfig
}

// NewRunner validates options and creates a Cluster API discovery runner.
func NewRunner(opts Options) (*Runner, error) {
	if opts.RESTConfig == nil {
		return nil, errors.New("management cluster config is required")
	}

	if opts.OriginCluster == "" {
		return nil, errors.New("origin cluster is required")
	}

	discoveryClient, err := discovery.NewDiscoveryClientForConfig(rest.CopyConfig(opts.RESTConfig))
	if err != nil {
		return nil, fmt.Errorf("create discovery client: %w", err)
	}

	client, err := dynamic.NewForConfig(rest.CopyConfig(opts.RESTConfig))
	if err != nil {
		return nil, fmt.Errorf("create dynamic client: %w", err)
	}

	return newRunner(opts, discoveryClient, client)
}

// resolveClusterGVR returns the most preferred Cluster API version the management
// cluster serves.
func resolveClusterGVR(client discovery.DiscoveryInterface) (schema.GroupVersionResource, error) {
	for _, version := range preferredClusterVersions {
		candidate := clusterGVR(version)

		enabled, err := discovery.IsResourceEnabled(client, candidate)
		if err != nil {
			return schema.GroupVersionResource{}, fmt.Errorf("%s clusters: %w", clusterGroup, err)
		}

		if enabled {
			return candidate, nil
		}
	}

	return schema.GroupVersionResource{}, fmt.Errorf("no served %s clusters resource", clusterGroup)
}

func newRunner(
	opts Options,
	discoveryClient discovery.DiscoveryInterface,
	client dynamic.Interface,
) (*Runner, error) {
	labelSelector, namespaces, err := clusterregistration.ParseSelectors(opts.LabelSelector, opts.Namespaces)
	if err != nil {
		return nil, err
	}

	return &Runner{
		registry:      opts.Registry,
		discovery:     discoveryClient,
		client:        client,
		originCluster: opts.OriginCluster,
		namespaces:    clusterregistration.NamespacesOrDefault(namespaces, opts.DefaultNamespace),
		labelSelector: labelSelector,
		oidcConfig:    opts.OIDCConfig,
	}, nil
}

// Run blocks until ctx is cancelled, retrying until the management cluster serves a
// Cluster resource.
func (r *Runner) Run(ctx context.Context) {
	var clusterGVR schema.GroupVersionResource

	err := wait.PollUntilContextCancel(ctx, discoveryRetryInterval, true,
		func(context.Context) (bool, error) {
			var err error

			clusterGVR, err = resolveClusterGVR(r.discovery)
			if err != nil {
				logger.Log(logger.LevelWarn, nil, err, "cluster-api: waiting for a served Cluster resource")
			}

			return err == nil, nil
		})
	if err != nil {
		return
	}

	r.watchClusters(ctx, clusterGVR)
}

func (r *Runner) watchClusters(ctx context.Context, clusterGVR schema.GroupVersionResource) {
	selector := r.labelSelector.String()

	factories := make([]dynamicinformer.DynamicSharedInformerFactory, 0, len(r.namespaces))
	for _, namespace := range r.namespaces {
		factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(
			r.client,
			0,
			namespace,
			func(options *metav1.ListOptions) { options.LabelSelector = selector },
		)

		_, err := factory.ForResource(clusterGVR).Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
			AddFunc:    r.handleUpsert,
			UpdateFunc: func(_, newObj interface{}) { r.handleUpsert(newObj) },
			DeleteFunc: r.handleDelete,
		})
		if err != nil {
			logger.Log(logger.LevelWarn, nil, err, "cluster-api: failed to add Cluster event handler")
			continue
		}

		factories = append(factories, factory)

		factory.Start(ctx.Done())
	}

	<-ctx.Done()

	for _, factory := range factories {
		factory.Shutdown()
	}
}

func (r *Runner) handleUpsert(obj interface{}) {
	cluster, ok := clusterregistration.ObjectFromEvent[*unstructured.Unstructured](obj)
	if !ok {
		return
	}

	origin := r.originFor(cluster)

	server, ok := controlPlaneServer(cluster)
	if !ok {
		r.remove(origin)
		return
	}

	_, err := r.registry.Upsert(clusterregistration.Candidate{
		DisplayName: cluster.GetName(),
		Source:      registrationSource,
		Origin:      origin,
		Context: &kubeconfig.Context{
			Cluster:  &clientcmdapi.Cluster{Server: server},
			OidcConf: r.oidcConfig,
			Source:   kubeconfig.ClusterAPI,
		},
	})
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{logFieldCluster: clusterKey(origin)}, err,
			"cluster-api: failed to register cluster")
	}
}

func (r *Runner) handleDelete(obj interface{}) {
	cluster, ok := clusterregistration.ObjectFromEvent[*unstructured.Unstructured](obj)
	if !ok {
		return
	}

	r.remove(r.originFor(cluster))
}

func (r *Runner) originFor(cluster *unstructured.Unstructured) clusterregistration.Origin {
	return clusterregistration.OriginFor(r.originCluster, cluster.GroupVersionKind(), cluster)
}

// clusterKey returns the namespaced name of the Cluster an origin was discovered from.
func clusterKey(origin clusterregistration.Origin) string {
	return cache.NewObjectName(origin.Resource.Namespace, origin.Resource.Name).String()
}

func (r *Runner) remove(origin clusterregistration.Origin) {
	if err := r.registry.RemoveOrigin(registrationSource, origin); err != nil {
		logger.Log(logger.LevelWarn, map[string]string{logFieldCluster: clusterKey(origin)}, err,
			"cluster-api: failed to prune registration")
	}
}

func controlPlaneServer(cluster *unstructured.Unstructured) (string, bool) {
	host, found, err := unstructured.NestedString(cluster.Object, "spec", "controlPlaneEndpoint", "host")

	host = strings.TrimSpace(host)
	if err != nil || !found || host == "" {
		return "", false
	}

	port, found, err := unstructured.NestedInt64(cluster.Object, "spec", "controlPlaneEndpoint", "port")
	if err != nil {
		return "", false
	}

	if !found || port == 0 {
		port = defaultAPIPort
	}

	if errs := validation.IsValidPortNum(int(port)); len(errs) > 0 {
		return "", false
	}

	return "https://" + net.JoinHostPort(host, strconv.FormatInt(port, 10)), true
}
