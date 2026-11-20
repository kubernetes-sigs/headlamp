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

package nsdiscovery

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	authorizationv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func namespaceLister(names ...string) *fake.Clientset {
	objects := make([]runtime.Object, 0, len(names))
	for _, name := range names {
		objects = append(objects, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: name}})
	}

	return fake.NewClientset(objects...)
}

type grantFunc func(attrs authorizationv1.ResourceAttributes) bool

// userClient returns a fake client that answers SelfSubjectAccessReviews with
// grant and counts the reviews it received.
func userClient(grant grantFunc, calls *atomic.Int32) *fake.Clientset {
	client := fake.NewClientset()
	client.PrependReactor("create", "selfsubjectaccessreviews",
		func(action k8stesting.Action) (bool, runtime.Object, error) {
			if calls != nil {
				calls.Add(1)
			}

			review := action.(k8stesting.CreateAction).GetObject().(*authorizationv1.SelfSubjectAccessReview)
			review.Status.Allowed = grant(*review.Spec.ResourceAttributes)

			return true, review, nil
		})

	return client
}

func TestDiscoverUserCanListNamespaces(t *testing.T) {
	d := New()
	user := userClient(func(a authorizationv1.ResourceAttributes) bool {
		return a.Resource == "namespaces" && a.Verb == "list" && a.Namespace == ""
	}, nil)

	result, err := d.Discover(context.Background(), "k", namespaceLister("a", "b"), user)

	require.NoError(t, err)
	assert.Equal(t, StatusAll, result.Status)
	assert.Empty(t, result.Namespaces)
}

func TestDiscoverReturnsOnlyAccessibleNamespaces(t *testing.T) {
	d := New()
	user := userClient(func(a authorizationv1.ResourceAttributes) bool {
		switch a.Namespace {
		case "team-a":
			return a.Resource == "pods"
		case "team-b":
			// Only a later probe is granted, the namespace must still count.
			return a.Resource == "configmaps"
		default:
			return false
		}
	}, nil)

	result, err := d.Discover(context.Background(), "k", namespaceLister("team-b", "kube-system", "team-a", "other"), user)

	require.NoError(t, err)
	assert.Equal(t, StatusRestricted, result.Status)
	assert.Equal(t, []string{"team-a", "team-b"}, result.Namespaces)
}

// TestDiscoverGetNamespaceProbe covers roles that grant "get namespaces" but
// none of the list probes, e.g. a CRD-only role. The review must name the
// namespace like the API server does for GET /api/v1/namespaces/<name>.
func TestDiscoverGetNamespaceProbe(t *testing.T) {
	d := New()
	user := userClient(func(a authorizationv1.ResourceAttributes) bool {
		return a.Group == "" && a.Resource == "namespaces" && a.Verb == "get" &&
			a.Namespace == "crd-team" && a.Name == "crd-team"
	}, nil)

	result, err := d.Discover(context.Background(), "k", namespaceLister("crd-team", "other"), user)

	require.NoError(t, err)
	assert.Equal(t, StatusRestricted, result.Status)
	assert.Equal(t, []string{"crd-team"}, result.Namespaces)
}

func TestDiscoverClusterWideProbeReturnsAllNames(t *testing.T) {
	d := New()
	user := userClient(func(a authorizationv1.ResourceAttributes) bool {
		return a.Group == "apps" && a.Resource == "deployments" && a.Namespace == ""
	}, nil)

	result, err := d.Discover(context.Background(), "k", namespaceLister("b", "a"), user)

	require.NoError(t, err)
	assert.Equal(t, StatusRestricted, result.Status)
	assert.Equal(t, []string{"a", "b"}, result.Namespaces)
}

func TestDiscoverNoAccess(t *testing.T) {
	d := New()
	user := userClient(func(authorizationv1.ResourceAttributes) bool { return false }, nil)

	result, err := d.Discover(context.Background(), "k", namespaceLister("a"), user)

	require.NoError(t, err)
	assert.Equal(t, StatusRestricted, result.Status)
	assert.Empty(t, result.Namespaces)
	assert.NotNil(t, result.Namespaces, "namespaces must encode as [] not null")
}

func TestDiscoverCustomProbes(t *testing.T) {
	d := &Discoverer{Probes: []Probe{{Resource: "secrets", Verb: "get"}}}
	user := userClient(func(a authorizationv1.ResourceAttributes) bool {
		return a.Namespace == "vault" && a.Resource == "secrets" && a.Verb == "get"
	}, nil)

	result, err := d.Discover(context.Background(), "k", namespaceLister("vault", "app"), user)

	require.NoError(t, err)
	assert.Equal(t, []string{"vault"}, result.Namespaces)
}

func TestDiscoverCachesPerKey(t *testing.T) {
	now := time.Now()
	d := &Discoverer{TTL: time.Minute, now: func() time.Time { return now }}

	var calls atomic.Int32

	user := userClient(func(a authorizationv1.ResourceAttributes) bool { return a.Namespace == "a" }, &calls)
	lister := namespaceLister("a", "b")

	_, err := d.Discover(context.Background(), "k1", lister, user)
	require.NoError(t, err)

	first := calls.Load()

	_, err = d.Discover(context.Background(), "k1", lister, user)
	require.NoError(t, err)
	assert.Equal(t, first, calls.Load(), "second call within TTL must be served from cache")

	_, err = d.Discover(context.Background(), "k2", lister, user)
	require.NoError(t, err)
	assert.Greater(t, calls.Load(), first, "another key must not share the cache entry")

	now = now.Add(2 * time.Minute)
	beforeExpiry := calls.Load()

	_, err = d.Discover(context.Background(), "k1", lister, user)
	require.NoError(t, err)
	assert.Greater(t, calls.Load(), beforeExpiry, "expired entry must be recomputed")
}

func TestDiscoverCacheIsBounded(t *testing.T) {
	d := &Discoverer{MaxEntries: 2}
	user := userClient(func(authorizationv1.ResourceAttributes) bool { return false }, nil)
	lister := namespaceLister("a")

	for _, key := range []string{"k1", "k2", "k3", "k4"} {
		_, err := d.Discover(context.Background(), key, lister, user)
		require.NoError(t, err)
	}

	d.mu.Lock()
	defer d.mu.Unlock()

	assert.LessOrEqual(t, len(d.cache), 2)
}

func TestDiscoverListError(t *testing.T) {
	d := New()
	lister := fake.NewClientset()
	lister.PrependReactor("list", "namespaces", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("forbidden")
	})

	user := userClient(func(authorizationv1.ResourceAttributes) bool { return false }, nil)

	_, err := d.Discover(context.Background(), "k", lister, user)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "Headlamp service account")
}

func TestDiscoverReviewErrorIsNotCached(t *testing.T) {
	d := New()

	var fail atomic.Bool
	fail.Store(true)

	user := fake.NewClientset()
	user.PrependReactor("create", "selfsubjectaccessreviews",
		func(action k8stesting.Action) (bool, runtime.Object, error) {
			if fail.Load() {
				return true, nil, errors.New("unauthorized")
			}

			review := action.(k8stesting.CreateAction).GetObject().(*authorizationv1.SelfSubjectAccessReview)
			review.Status.Allowed = review.Spec.ResourceAttributes.Namespace == "a"

			return true, review, nil
		})

	_, err := d.Discover(context.Background(), "k", namespaceLister("a"), user)
	require.Error(t, err)

	fail.Store(false)

	result, err := d.Discover(context.Background(), "k", namespaceLister("a"), user)
	require.NoError(t, err)
	assert.Equal(t, []string{"a"}, result.Namespaces)
}

func TestCacheKeyDoesNotContainToken(t *testing.T) {
	key := CacheKey("cluster", "secret-token")

	assert.NotContains(t, key, "secret-token")
	assert.NotEqual(t, key, CacheKey("cluster", "other-token"))
	assert.NotEqual(t, key, CacheKey("other", "secret-token"))
}
