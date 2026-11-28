package k8cache

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	authorizationv1 "k8s.io/api/authorization/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

func (c *ClientsetCache) requestSSAR(
	ctx context.Context,
	headlampContextKey string,
	k *kubeconfig.Context,
	token string,
	resourceAttributes *authorizationv1.ResourceAttributes,
) (bool, error) {
	clientset, err := c.GetClientSet(headlampContextKey, k, token)
	if err != nil {
		return false, err
	}

	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{ResourceAttributes: resourceAttributes},
	}

	result, err := clientset.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
	if err != nil {
		if apierrors.IsUnauthorized(err) {
			c.evictClientsetIfMatch(headlampContextKey, token, clientset)
		}

		return false, err
	}

	if result == nil {
		return false, fmt.Errorf("nil SelfSubjectAccessReview result")
	}

	if result.Status.EvaluationError != "" {
		return false, fmt.Errorf("SelfSubjectAccessReview evaluation error: %s", result.Status.EvaluationError)
	}

	return result.Status.Allowed, nil
}

func (c *ClientsetCache) evictClientsetIfMatch(
	headlampContextKey, token string,
	clientset *kubernetes.Clientset,
) {
	contextPrefix := headlampContextKey + "\x00"
	tokenSuffix := "\x00" + token

	for i := range c.shards {
		shard := &c.shards[i]
		shard.mu.Lock()

		for key, cached := range shard.clientsets {
			prefix := clientsetCachePrefixFromCacheKey(key)
			if cached.clientset == clientset &&
				strings.HasPrefix(prefix, contextPrefix) &&
				strings.HasSuffix(key, tokenSuffix) {
				delete(shard.clientsets, key)
				c.cachedCount.Add(-1)
				shard.mu.Unlock()

				return
			}
		}

		shard.mu.Unlock()
	}
}

func isSSARCacheable(verb string) bool {
	return verb == "get" || verb == "list" || verb == "watch"
}

func buildSSARCacheKey(contextCacheKey, token string, attrs *authorizationv1.ResourceAttributes) string {
	fieldSelector := ""
	if attrs.FieldSelector != nil {
		fieldSelector = attrs.FieldSelector.RawSelector
	}

	labelSelector := ""
	if attrs.LabelSelector != nil {
		labelSelector = attrs.LabelSelector.RawSelector
	}

	return strings.Join([]string{
		contextCacheKey, token, attrs.Group, attrs.Version, attrs.Resource, attrs.Subresource,
		attrs.Verb, attrs.Namespace, attrs.Name, fieldSelector, labelSelector,
	}, "\x00")
}

func ssarCachePrefixFromCacheKey(cacheKey string) string {
	prefix := cacheKey
	for range 10 {
		separator := strings.LastIndex(prefix, "\x00")
		if separator < 0 {
			return ""
		}

		prefix = prefix[:separator]
	}

	return prefix
}

func (c *ClientsetCache) acquireSSARRequest(key string) (bool, bool, *ssarInFlightEntry, bool) {
	c.ssarMu.Lock()
	defer c.ssarMu.Unlock()

	if entry, found := c.ssarCache[key]; found {
		if time.Now().Before(entry.expiresAt) {
			return entry.allowed, true, nil, false
		}

		c.deleteSSARCacheEntryLocked(key)
	}

	if entry, found := c.ssarInFlight[key]; found {
		return false, false, entry, false
	}

	if c.ssarWorkerCount >= ssarMaxInFlight {
		return false, false, nil, false
	}

	entry := &ssarInFlightEntry{waitCh: make(chan struct{}), workerActive: true}
	c.ssarInFlight[key] = entry
	c.ssarWorkerCount++

	return false, false, entry, true
}

func waitForSSARRequest(ctx context.Context, entry *ssarInFlightEntry) (bool, error) {
	select {
	case <-entry.waitCh:
		return entry.allowed, entry.err
	case <-ctx.Done():
		return false, ctx.Err()
	}
}

func (c *ClientsetCache) startSSARRequest(
	parent context.Context,
	key string,
	entry *ssarInFlightEntry,
	request func(context.Context) (bool, error),
) {
	go func() {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), ssarRequestTimeout)
		defer cancel()

		requestDone := make(chan struct{})

		go func() {
			allowed, err := request(ctx)
			c.finishSSARRequest(key, entry, allowed, err)
			close(requestDone)
		}()

		select {
		case <-requestDone:
		case <-ctx.Done():
			c.timeoutSSARRequest(entry, ctx.Err())
		}
	}()
}

func (c *ClientsetCache) finishSSARRequest(key string, entry *ssarInFlightEntry, allowed bool, err error) {
	if entry == nil {
		return
	}

	c.blockedMu.RLock()
	blocked := c.isPrefixBlockedLocked(ssarCachePrefixFromCacheKey(key))
	c.blockedMu.RUnlock()

	c.ssarMu.Lock()
	defer c.ssarMu.Unlock()

	current, attached := c.ssarInFlight[key]

	if entry.completed {
		c.finishSSARWorkerLocked(entry)

		if attached && current == entry {
			delete(c.ssarInFlight, key)
		}

		return
	}

	entry.allowed = allowed
	entry.err = err
	entry.completed = true
	c.finishSSARWorkerLocked(entry)

	if err == nil && !blocked && attached && current == entry {
		c.storeSSARCacheResultLocked(key, allowed)
	}

	if attached && current == entry {
		delete(c.ssarInFlight, key)
	}

	close(entry.waitCh)
}

func (c *ClientsetCache) finishSSARWorkerLocked(entry *ssarInFlightEntry) {
	if !entry.workerActive {
		return
	}

	entry.workerActive = false

	if c.ssarWorkerCount > 0 {
		c.ssarWorkerCount--
	}
}

func (c *ClientsetCache) storeSSARCacheResultLocked(key string, allowed bool) {
	if _, found := c.ssarCache[key]; found {
		c.deleteSSARCacheEntryLocked(key)
	}

	for len(c.ssarCache) >= ssarCacheMaxEntries {
		element := c.ssarCacheOrder.Front()
		if element == nil {
			break
		}

		oldestKey, ok := element.Value.(string)
		if !ok {
			c.ssarCacheOrder.Remove(element)

			continue
		}

		c.deleteSSARCacheEntryLocked(oldestKey)
	}

	entry := &ssarCacheEntry{allowed: allowed, expiresAt: time.Now().Add(ssarTTL)}
	entry.orderElement = c.ssarCacheOrder.PushBack(key)
	c.ssarCache[key] = entry
}

func (c *ClientsetCache) deleteSSARCacheEntryLocked(key string) {
	entry, found := c.ssarCache[key]
	if !found {
		return
	}

	if entry.orderElement != nil {
		c.ssarCacheOrder.Remove(entry.orderElement)
	}

	delete(c.ssarCache, key)
}

func (c *ClientsetCache) evictSSARCacheForPrefix(prefix string) {
	c.ssarMu.Lock()
	evicted := 0
	prefixWithNul := prefix + "\x00"

	for key := range c.ssarCache {
		if strings.HasPrefix(key, prefixWithNul) {
			c.deleteSSARCacheEntryLocked(key)

			evicted++
		}
	}

	for key := range c.ssarInFlight {
		if strings.HasPrefix(key, prefixWithNul) {
			delete(c.ssarInFlight, key)
		}
	}

	c.ssarMu.Unlock()

	if evicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("evicted %d cached SSAR result(s) for prefix %s", evicted, redactContextKey(prefix)))
	}
}

func (c *ClientsetCache) evictExpiredSSARResults(now time.Time) {
	c.ssarMu.Lock()
	evicted := 0

	for key, entry := range c.ssarCache {
		if now.After(entry.expiresAt) {
			c.deleteSSARCacheEntryLocked(key)

			evicted++
		}
	}

	remaining := len(c.ssarCache)
	c.ssarMu.Unlock()

	if evicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("janitor: evicted %d expired SSAR result(s), %d remaining", evicted, remaining))
	}
}

func (c *ClientsetCache) isAllowedCached(
	headlampContextKey string,
	k *kubeconfig.Context,
	r *http.Request,
) (bool, error) {
	token := auth.BearerTokenValue(r.Header.Get("Authorization"))

	attrs, err := getResourceAttributes(r)
	if err != nil {
		return false, err
	}

	if token == "" || !isSSARCacheable(attrs.Verb) {
		return c.requestSSAR(r.Context(), headlampContextKey, k, token, attrs)
	}

	contextCacheKey, err := ContextCacheKey(headlampContextKey, k)
	if err != nil {
		return false, err
	}

	key := buildSSARCacheKey(contextCacheKey, token, attrs)

	allowed, found, inFlight, leader := c.acquireSSARRequest(key)
	if found {
		return allowed, nil
	}

	if inFlight == nil {
		return false, errSSARWorkersAtCapacity
	}

	if leader {
		c.startSSARRequest(r.Context(), key, inFlight, func(ctx context.Context) (bool, error) {
			return c.requestSSAR(ctx, headlampContextKey, k, token, attrs)
		})
	}

	return waitForSSARRequest(r.Context(), inFlight)
}

func (c *ClientsetCache) getSSARCacheResult(key string) (bool, bool) {
	c.ssarMu.Lock()
	defer c.ssarMu.Unlock()

	entry, found := c.ssarCache[key]
	if !found {
		return false, false
	}

	if !time.Now().Before(entry.expiresAt) {
		c.deleteSSARCacheEntryLocked(key)

		return false, false
	}

	return entry.allowed, true
}

func (c *ClientsetCache) storeSSARCacheResult(key string, allowed bool) {
	c.ssarMu.Lock()
	c.storeSSARCacheResultLocked(key, allowed)
	c.ssarMu.Unlock()
}

func (c *ClientsetCache) ExpireSSARForTesting() {
	c.ssarMu.Lock()
	for _, entry := range c.ssarCache {
		entry.expiresAt = time.Now().Add(-ssarTTL)
	}
	c.ssarMu.Unlock()
}

func (c *ClientsetCache) timeoutSSARRequest(entry *ssarInFlightEntry, err error) {
	c.ssarMu.Lock()
	defer c.ssarMu.Unlock()

	if entry.completed {
		return
	}

	entry.allowed = false
	entry.err = err
	entry.completed = true
	close(entry.waitCh)
}
