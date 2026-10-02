// Package nsaccess narrows the set of namespaces shown to a user down to the
// namespaces the user is allowed to GET.
//
// Kubernetes RBAC cannot restrict the LIST verb to a subset of namespaces, so
// multi-tenant platforms often grant LIST on namespaces cluster-wide while
// per-namespace access is expressed through RoleBindings. In that setup a
// plain namespace listing reveals every namespace in the cluster. Mirroring
// Kiali's require_namespace_get feature flag, this package probes
// GET /api/v1/namespaces/{name} with the user's own credentials for every
// candidate namespace and keeps only the ones the user may GET.
//
// Decisions are cached per user (token hash) and namespace for a short
// period so that repeated listings do not re-probe the cluster.
package nsaccess

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
)

const (
	// DefaultCacheTTL is how long a GET decision is remembered per user.
	DefaultCacheTTL = 30 * time.Second
	// DefaultConcurrency bounds the number of GET probes running in
	// parallel for a single listing.
	DefaultConcurrency = 8

	namespacesPath = "api/v1/namespaces"
	keySeparator   = "\x00"

	eventTypeDeleted = "DELETED"
	eventTypeError   = "ERROR"
)

// Probe performs GET /api/v1/namespaces/{name} with the user's credentials and
// returns the HTTP status code of the response.
type Probe func(ctx context.Context, name string) (int, error)

// Filter decides which namespaces a user may see.
type Filter struct {
	cache       cache.Cache[bool]
	ttl         time.Duration
	concurrency int
}

// New returns a Filter backed by the given cache. Non-positive ttl and
// concurrency values select the defaults.
func New(c cache.Cache[bool], ttl time.Duration, concurrency int) *Filter {
	if ttl <= 0 {
		ttl = DefaultCacheTTL
	}

	if concurrency <= 0 {
		concurrency = DefaultConcurrency
	}

	return &Filter{cache: c, ttl: ttl, concurrency: concurrency}
}

// UserKey derives the cache key prefix for a user of the given cluster. The
// token is hashed so that it is never stored in clear text.
func UserKey(cluster, token string) string {
	sum := sha256.Sum256([]byte(token))

	return cluster + keySeparator + hex.EncodeToString(sum[:16])
}

// IsNamespaceListPath reports whether apiPath addresses the namespace
// collection (/api/v1/namespaces), ignoring surrounding slashes.
func IsNamespaceListPath(apiPath string) bool {
	return strings.Trim(apiPath, "/") == namespacesPath
}

// IsWatchQuery reports whether the query parameters request a watch.
func IsWatchQuery(query url.Values) bool {
	v := query.Get("watch")

	return v != "" && v != "0" && v != "false"
}

// Allowed returns the subset of names the user may GET. Any probe outcome
// other than a clean allow (200) or deny (403/404) aborts the whole check so
// that an unfiltered list is never returned by accident.
func (f *Filter) Allowed(ctx context.Context, userKey string, names []string, probe Probe) (map[string]bool, error) {
	allowed := make(map[string]bool, len(names))

	var pending []string

	for _, name := range names {
		if ok, found := f.cached(ctx, userKey, name); found {
			if ok {
				allowed[name] = true
			}

			continue
		}

		pending = append(pending, name)
	}

	if len(pending) == 0 {
		return allowed, nil
	}

	results, err := f.probeAll(ctx, userKey, pending, probe)
	if err != nil {
		return nil, err
	}

	for name, ok := range results {
		if ok {
			allowed[name] = true
		}
	}

	return allowed, nil
}

// probeAll runs the probe for every name with bounded parallelism and
// returns the decision for each name. The first error cancels the rest.
func (f *Filter) probeAll(ctx context.Context, userKey string, names []string, probe Probe) (map[string]bool, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var (
		mu       sync.Mutex
		wg       sync.WaitGroup
		firstErr error
	)

	results := make(map[string]bool, len(names))
	sem := make(chan struct{}, f.concurrency)

	for _, name := range names {
		if ctx.Err() != nil {
			break
		}

		sem <- struct{}{}

		wg.Add(1)

		go func(name string) {
			defer wg.Done()
			defer func() { <-sem }()

			ok, err := f.check(ctx, userKey, name, probe)

			mu.Lock()
			defer mu.Unlock()

			if err != nil {
				if firstErr == nil {
					firstErr = err

					cancel()
				}

				return
			}

			results[name] = ok
		}(name)
	}

	wg.Wait()

	if firstErr != nil {
		return nil, firstErr
	}

	return results, nil
}

func (f *Filter) check(ctx context.Context, userKey, name string, probe Probe) (bool, error) {
	status, err := probe(ctx, name)
	if err != nil {
		return false, fmt.Errorf("checking access to namespace %q: %w", name, err)
	}

	ok, err := decide(name, status)
	if err != nil {
		return false, err
	}

	// A failed cache write only costs an extra probe next time.
	_ = f.cache.SetWithTTL(ctx, cacheKey(userKey, name), ok, f.ttl)

	return ok, nil
}

func (f *Filter) cached(ctx context.Context, userKey, name string) (ok, found bool) {
	v, err := f.cache.Get(ctx, cacheKey(userKey, name))
	if err != nil {
		return false, false
	}

	return v, true
}

func cacheKey(userKey, name string) string {
	return userKey + keySeparator + name
}

func decide(name string, status int) (bool, error) {
	switch status {
	case http.StatusOK:
		return true, nil
	case http.StatusForbidden, http.StatusNotFound:
		return false, nil
	default:
		return false, fmt.Errorf("unexpected status %d checking access to namespace %q", status, name)
	}
}

type objectMeta struct {
	Metadata struct {
		Name string `json:"name"`
	} `json:"metadata"`
}

type tableRow struct {
	Object objectMeta `json:"object"`
}

type watchEvent struct {
	Type   string     `json:"type"`
	Object objectMeta `json:"object"`
}

// FilterList rewrites a NamespaceList JSON document (or its Table form) so
// that it only contains the namespaces the user may GET. Documents without an
// items/rows array are returned unchanged.
func (f *Filter) FilterList(ctx context.Context, userKey string, body []byte, probe Probe) ([]byte, error) {
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("parsing namespace list: %w", err)
	}

	field := "items"

	raw, ok := doc[field]
	if !ok {
		field = "rows"
		raw, ok = doc[field]
	}

	if !ok {
		return body, nil
	}

	var entries []json.RawMessage
	if err := json.Unmarshal(raw, &entries); err != nil {
		return nil, fmt.Errorf("parsing namespace list %s: %w", field, err)
	}

	names := make([]string, len(entries))
	for i, entry := range entries {
		names[i] = entryName(entry, field == "rows")
	}

	allowed, err := f.Allowed(ctx, userKey, nonEmptyUnique(names), probe)
	if err != nil {
		return nil, err
	}

	kept := make([]json.RawMessage, 0, len(entries))

	for i, entry := range entries {
		if allowed[names[i]] {
			kept = append(kept, entry)
		}
	}

	keptRaw, err := json.Marshal(kept)
	if err != nil {
		return nil, err
	}

	doc[field] = keptRaw

	return json.Marshal(doc)
}

// AllowEvent reports whether a namespace watch event may be forwarded to the
// user. Events that carry no namespace name (ERROR, BOOKMARK) are forwarded.
// DELETED events are forwarded unless the namespace is known to be hidden,
// because a GET on a deleted namespace can no longer succeed.
func (f *Filter) AllowEvent(ctx context.Context, userKey string, event []byte, probe Probe) (bool, error) {
	var ev watchEvent
	if err := json.Unmarshal(event, &ev); err != nil {
		return false, fmt.Errorf("parsing namespace watch event: %w", err)
	}

	name := ev.Object.Metadata.Name
	if name == "" || ev.Type == eventTypeError {
		return true, nil
	}

	if ev.Type == eventTypeDeleted {
		ok, found := f.cached(ctx, userKey, name)

		return !found || ok, nil
	}

	allowed, err := f.Allowed(ctx, userKey, []string{name}, probe)
	if err != nil {
		return false, err
	}

	return allowed[name], nil
}

func entryName(entry json.RawMessage, isRow bool) string {
	if isRow {
		var row tableRow
		if err := json.Unmarshal(entry, &row); err != nil {
			return ""
		}

		return row.Object.Metadata.Name
	}

	var meta objectMeta
	if err := json.Unmarshal(entry, &meta); err != nil {
		return ""
	}

	return meta.Metadata.Name
}

func nonEmptyUnique(names []string) []string {
	seen := make(map[string]struct{}, len(names))
	out := make([]string, 0, len(names))

	for _, name := range names {
		if name == "" {
			continue
		}

		if _, dup := seen[name]; dup {
			continue
		}

		seen[name] = struct{}{}
		out = append(out, name)
	}

	return out
}
