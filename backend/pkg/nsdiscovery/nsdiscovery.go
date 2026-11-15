// Copyright 2025 The Kubernetes Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Package nsdiscovery finds the namespaces a user can work in when the user is
// not allowed to list namespaces.
//
// The namespace names are listed with Headlamp's own service account, which is
// the only thing that credential is used for. Every name is then checked with a
// SelfSubjectAccessReview sent with the user's own token, so the API server's
// authorizer chain (RBAC, webhooks such as EKS access entries, and so on)
// decides which names are returned. A user never learns the name of a
// namespace in which none of the probe permissions are granted.
package nsdiscovery

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
	"golang.org/x/sync/singleflight"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// Status tells the frontend how to treat the result.
type Status string

const (
	// StatusAll means the user can list namespaces, so no restriction applies.
	StatusAll Status = "all"
	// StatusRestricted means Namespaces holds the namespaces the user can access.
	StatusRestricted Status = "restricted"
	// StatusUnsupported means discovery is not available for this cluster.
	StatusUnsupported Status = "unsupported"
)

// Result is the response of a discovery run.
type Result struct {
	Status     Status   `json:"status"`
	Namespaces []string `json:"namespaces"`
}

// Probe is one permission that, when granted in a namespace, makes that
// namespace accessible.
type Probe struct {
	Group    string
	Resource string
	Verb     string
}

const (
	verbList = "list"
	verbGet  = "get"

	resourceNamespaces = "namespaces"
)

// DefaultProbes are the permissions checked per namespace. A namespace is
// accessible when at least one of them is allowed.
//
// "get namespaces" covers roles such as the built-in view, edit and admin
// (and CRD-only roles that include it) and is what the frontend requests to
// load a discovered namespace. The list probes cover minimal roles without it.
var DefaultProbes = []Probe{
	{Resource: "pods", Verb: verbList},
	{Group: "apps", Resource: "deployments", Verb: verbList},
	{Resource: "services", Verb: verbList},
	{Resource: "configmaps", Verb: verbList},
	{Resource: resourceNamespaces, Verb: verbGet},
}

const (
	defaultConcurrency = 16
	defaultTTL         = time.Minute
	defaultMaxEntries  = 1024
	namespacePageSize  = 500
)

type cacheEntry struct {
	result    Result
	expiresAt time.Time
}

// ListError reports that Headlamp's own credentials could not list namespaces.
// It is a configuration problem of the deployment, not of the user.
type ListError struct {
	Err error
}

func (e *ListError) Error() string {
	return fmt.Sprintf("listing namespaces with the Headlamp service account: %v", e.Err)
}

func (e *ListError) Unwrap() error {
	return e.Err
}

// Discoverer runs and caches namespace discovery.
type Discoverer struct {
	// Probes checked per namespace. DefaultProbes when empty.
	Probes []Probe
	// Concurrency limits parallel SelfSubjectAccessReviews per run.
	Concurrency int
	// TTL is how long a result is reused for the same cluster and token.
	TTL time.Duration
	// MaxEntries bounds the number of cached results.
	MaxEntries int

	now   func() time.Time
	mu    sync.Mutex
	cache map[string]cacheEntry
	group singleflight.Group
}

// New returns a Discoverer with default settings.
func New() *Discoverer {
	return &Discoverer{}
}

func (d *Discoverer) probes() []Probe {
	if len(d.Probes) == 0 {
		return DefaultProbes
	}

	return d.Probes
}

func (d *Discoverer) concurrency() int {
	if d.Concurrency <= 0 {
		return defaultConcurrency
	}

	return d.Concurrency
}

func (d *Discoverer) ttl() time.Duration {
	if d.TTL <= 0 {
		return defaultTTL
	}

	return d.TTL
}

func (d *Discoverer) maxEntries() int {
	if d.MaxEntries <= 0 {
		return defaultMaxEntries
	}

	return d.MaxEntries
}

func (d *Discoverer) timeNow() time.Time {
	if d.now != nil {
		return d.now()
	}

	return time.Now()
}

// CacheKey builds a cache key for a cluster and user token without keeping the
// token itself in memory.
func CacheKey(cluster, token string) string {
	sum := sha256.Sum256([]byte(cluster + "\x00" + token))
	return hex.EncodeToString(sum[:])
}

// Discover returns the namespaces the user behind userClient can access.
//
// lister must use Headlamp's own credentials and is only used to list
// namespace names. userClient must carry the user's token and nothing else.
func (d *Discoverer) Discover(
	ctx context.Context,
	cacheKey string,
	lister kubernetes.Interface,
	userClient kubernetes.Interface,
) (Result, error) {
	if result, ok := d.cached(cacheKey); ok {
		return result, nil
	}

	value, err, _ := d.group.Do(cacheKey, func() (interface{}, error) {
		result, err := d.discover(ctx, lister, userClient)
		if err != nil {
			return Result{}, err
		}

		d.store(cacheKey, result)

		return result, nil
	})
	if err != nil {
		return Result{}, err
	}

	return value.(Result), nil
}

func (d *Discoverer) cached(key string) (Result, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()

	entry, ok := d.cache[key]
	if !ok || d.timeNow().After(entry.expiresAt) {
		return Result{}, false
	}

	return entry.result, true
}

func (d *Discoverer) store(key string, result Result) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.cache == nil {
		d.cache = make(map[string]cacheEntry)
	}

	now := d.timeNow()

	if len(d.cache) >= d.maxEntries() {
		for k, entry := range d.cache {
			if now.After(entry.expiresAt) {
				delete(d.cache, k)
			}
		}
	}

	if len(d.cache) >= d.maxEntries() {
		d.cache = make(map[string]cacheEntry)
	}

	d.cache[key] = cacheEntry{result: result, expiresAt: now.Add(d.ttl())}
}

// Invalidate drops all cached results.
func (d *Discoverer) Invalidate() {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.cache = nil
}

func (d *Discoverer) discover(
	ctx context.Context,
	lister kubernetes.Interface,
	userClient kubernetes.Interface,
) (Result, error) {
	canListNamespaces, err := allowed(ctx, userClient, Probe{Resource: resourceNamespaces, Verb: verbList}, "")
	if err != nil {
		return Result{}, err
	}

	if canListNamespaces {
		return Result{Status: StatusAll, Namespaces: []string{}}, nil
	}

	names, err := listNamespaceNames(ctx, lister)
	if err != nil {
		return Result{}, &ListError{Err: err}
	}

	// A user who may list a probe resource across the cluster can access every
	// namespace, and could read the names from that list anyway.
	for _, probe := range d.probes() {
		clusterWide, err := allowed(ctx, userClient, probe, "")
		if err != nil {
			return Result{}, err
		}

		if clusterWide {
			return Result{Status: StatusRestricted, Namespaces: names}, nil
		}
	}

	accessible, err := d.filterAccessible(ctx, userClient, names)
	if err != nil {
		return Result{}, err
	}

	return Result{Status: StatusRestricted, Namespaces: accessible}, nil
}

func (d *Discoverer) filterAccessible(
	ctx context.Context,
	userClient kubernetes.Interface,
	names []string,
) ([]string, error) {
	keep := make([]bool, len(names))

	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(d.concurrency())

	for i, name := range names {
		group.Go(func() error {
			for _, probe := range d.probes() {
				ok, err := allowed(groupCtx, userClient, probe, name)
				if err != nil {
					return err
				}

				if ok {
					keep[i] = true
					return nil
				}
			}

			return nil
		})
	}

	if err := group.Wait(); err != nil {
		return nil, err
	}

	accessible := make([]string, 0, len(names))

	for i, name := range names {
		if keep[i] {
			accessible = append(accessible, name)
		}
	}

	return accessible, nil
}

func listNamespaceNames(ctx context.Context, lister kubernetes.Interface) ([]string, error) {
	names := []string{}
	opts := metav1.ListOptions{Limit: namespacePageSize}

	for {
		list, err := lister.CoreV1().Namespaces().List(ctx, opts)
		if err != nil {
			return nil, err
		}

		for _, ns := range list.Items {
			names = append(names, ns.Name)
		}

		if list.Continue == "" {
			break
		}

		opts.Continue = list.Continue
	}

	sort.Strings(names)

	return names, nil
}

// allowed checks a probe in a namespace, or across the cluster when namespace
// is empty.
func allowed(ctx context.Context, client kubernetes.Interface, probe Probe, namespace string) (bool, error) {
	attrs := &authorizationv1.ResourceAttributes{
		Namespace: namespace,
		Group:     probe.Group,
		Resource:  probe.Resource,
		Verb:      probe.Verb,
	}

	// The API server authorizes GET /api/v1/namespaces/<name> with both the
	// namespace and the name set to <name>, so a RoleBinding in that namespace
	// can grant it. Ask the same question.
	if probe.Group == "" && probe.Resource == resourceNamespaces {
		attrs.Name = namespace
	}

	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{ResourceAttributes: attrs},
	}

	result, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
	if err != nil {
		return false, err
	}

	return result.Status.Allowed, nil
}
