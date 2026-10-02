package nsaccess_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/nsaccess"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// statusProbe returns a Probe answering from a fixed status map and counting
// the calls per namespace.
func statusProbe(statuses map[string]int, calls *sync.Map) nsaccess.Probe {
	return func(_ context.Context, name string) (int, error) {
		if calls != nil {
			v, _ := calls.LoadOrStore(name, new(int32))
			atomic.AddInt32(v.(*int32), 1) //nolint:forcetypeassert
		}

		status, ok := statuses[name]
		if !ok {
			return 0, errors.New("boom")
		}

		return status, nil
	}
}

func newFilter() *nsaccess.Filter {
	return nsaccess.New(cache.New[bool](), 0, 0)
}

func TestUserKey(t *testing.T) {
	assert.Equal(t, nsaccess.UserKey("c", "tok"), nsaccess.UserKey("c", "tok"))
	assert.NotEqual(t, nsaccess.UserKey("c", "tok"), nsaccess.UserKey("c", "other"))
	assert.NotEqual(t, nsaccess.UserKey("c", "tok"), nsaccess.UserKey("d", "tok"))
	assert.NotContains(t, nsaccess.UserKey("c", "tok"), "tok", "token must not appear in clear text")
}

func TestIsNamespaceListPath(t *testing.T) {
	assert.True(t, nsaccess.IsNamespaceListPath("api/v1/namespaces"))
	assert.True(t, nsaccess.IsNamespaceListPath("/api/v1/namespaces/"))
	assert.False(t, nsaccess.IsNamespaceListPath("api/v1/namespaces/default"))
	assert.False(t, nsaccess.IsNamespaceListPath("api/v1/pods"))
}

func TestIsWatchQuery(t *testing.T) {
	assert.True(t, nsaccess.IsWatchQuery(url.Values{"watch": {"1"}}))
	assert.True(t, nsaccess.IsWatchQuery(url.Values{"watch": {"true"}}))
	assert.False(t, nsaccess.IsWatchQuery(url.Values{"watch": {"false"}}))
	assert.False(t, nsaccess.IsWatchQuery(url.Values{}))
}

func TestAllowed(t *testing.T) {
	t.Run("keeps_200_drops_403_and_404", func(t *testing.T) {
		probe := statusProbe(map[string]int{"a": 200, "b": 403, "c": 404}, nil)

		allowed, err := newFilter().Allowed(context.Background(), "u", []string{"a", "b", "c"}, probe)
		require.NoError(t, err)
		assert.Equal(t, map[string]bool{"a": true}, allowed)
	})

	t.Run("unexpected_status_fails_closed", func(t *testing.T) {
		probe := statusProbe(map[string]int{"a": 200, "b": 500}, nil)

		allowed, err := newFilter().Allowed(context.Background(), "u", []string{"a", "b"}, probe)
		require.Error(t, err)
		assert.Nil(t, allowed)
	})

	t.Run("probe_error_fails_closed", func(t *testing.T) {
		probe := statusProbe(map[string]int{"a": 200}, nil)

		allowed, err := newFilter().Allowed(context.Background(), "u", []string{"a", "missing"}, probe)
		require.Error(t, err)
		assert.Nil(t, allowed)
	})
}

func TestAllowedCachesDecisionsPerUser(t *testing.T) {
	t.Run("decisions_are_cached_per_user", func(t *testing.T) {
		var calls sync.Map

		probe := statusProbe(map[string]int{"a": 200, "b": 403}, &calls)
		f := newFilter()

		for range 3 {
			allowed, err := f.Allowed(context.Background(), "user-1", []string{"a", "b"}, probe)
			require.NoError(t, err)
			assert.Equal(t, map[string]bool{"a": true}, allowed)
		}

		v, _ := calls.Load("a")
		assert.Equal(t, int32(1), atomic.LoadInt32(v.(*int32))) //nolint:forcetypeassert

		// Another user must get its own probes.
		_, err := f.Allowed(context.Background(), "user-2", []string{"a"}, probe)
		require.NoError(t, err)

		v, _ = calls.Load("a")
		assert.Equal(t, int32(2), atomic.LoadInt32(v.(*int32))) //nolint:forcetypeassert
	})
}

func TestAllowedBoundsParallelism(t *testing.T) {
	t.Run("many_namespaces_with_bounded_parallelism", func(t *testing.T) {
		statuses := make(map[string]int)
		names := make([]string, 0, 100)

		for i := range 100 {
			name := "ns-" + string(rune('a'+i%26)) + string(rune('a'+i/26))
			names = append(names, name)

			if i%2 == 0 {
				statuses[name] = http.StatusOK
			} else {
				statuses[name] = http.StatusForbidden
			}
		}

		var inFlight, maxInFlight int32

		probe := func(ctx context.Context, name string) (int, error) {
			cur := atomic.AddInt32(&inFlight, 1)
			defer atomic.AddInt32(&inFlight, -1)

			for {
				prev := atomic.LoadInt32(&maxInFlight)
				if cur <= prev || atomic.CompareAndSwapInt32(&maxInFlight, prev, cur) {
					break
				}
			}

			return statusProbe(statuses, nil)(ctx, name)
		}

		allowed, err := nsaccess.New(cache.New[bool](), 0, 4).Allowed(context.Background(), "u", names, probe)
		require.NoError(t, err)
		assert.Len(t, allowed, 50)
		assert.LessOrEqual(t, atomic.LoadInt32(&maxInFlight), int32(4))
	})
}

func TestFilterList(t *testing.T) {
	probe := statusProbe(map[string]int{"visible": 200, "hidden": 403}, nil)

	t.Run("filters_items", func(t *testing.T) {
		body := []byte(`{"kind":"NamespaceList","apiVersion":"v1","metadata":{"resourceVersion":"42"},` +
			`"items":[{"metadata":{"name":"visible"}},{"metadata":{"name":"hidden"}}]}`)

		out, err := newFilter().FilterList(context.Background(), "u", body, probe)
		require.NoError(t, err)

		var doc struct {
			Kind     string `json:"kind"`
			Metadata struct {
				ResourceVersion string `json:"resourceVersion"`
			} `json:"metadata"`
			Items []struct {
				Metadata struct {
					Name string `json:"name"`
				} `json:"metadata"`
			} `json:"items"`
		}

		require.NoError(t, json.Unmarshal(out, &doc))
		assert.Equal(t, "NamespaceList", doc.Kind)
		assert.Equal(t, "42", doc.Metadata.ResourceVersion, "list metadata must be preserved")
		require.Len(t, doc.Items, 1)
		assert.Equal(t, "visible", doc.Items[0].Metadata.Name)
	})

	t.Run("empty_result_is_an_empty_array", func(t *testing.T) {
		body := []byte(`{"kind":"NamespaceList","items":[{"metadata":{"name":"hidden"}}]}`)

		out, err := newFilter().FilterList(context.Background(), "u", body, probe)
		require.NoError(t, err)
		assert.JSONEq(t, `{"kind":"NamespaceList","items":[]}`, string(out))
	})
}

func TestFilterListEdgeCases(t *testing.T) {
	probe := statusProbe(map[string]int{"visible": 200, "hidden": 403}, nil)

	t.Run("filters_table_rows", func(t *testing.T) {
		body := []byte(`{"kind":"Table","rows":[{"cells":["visible"],"object":{"metadata":{"name":"visible"}}},` +
			`{"cells":["hidden"],"object":{"metadata":{"name":"hidden"}}}]}`)

		out, err := newFilter().FilterList(context.Background(), "u", body, probe)
		require.NoError(t, err)
		assert.JSONEq(t, `{"kind":"Table","rows":[{"cells":["visible"],"object":{"metadata":{"name":"visible"}}}]}`,
			string(out))
	})

	t.Run("documents_without_items_pass_through", func(t *testing.T) {
		body := []byte(`{"kind":"Status","code":403}`)

		out, err := newFilter().FilterList(context.Background(), "u", body, probe)
		require.NoError(t, err)
		assert.Equal(t, body, out)
	})

	t.Run("invalid_json_is_an_error", func(t *testing.T) {
		_, err := newFilter().FilterList(context.Background(), "u", []byte(`not json`), probe)
		require.Error(t, err)
	})

	t.Run("probe_failure_is_an_error", func(t *testing.T) {
		body := []byte(`{"items":[{"metadata":{"name":"unknown"}}]}`)

		_, err := newFilter().FilterList(context.Background(), "u", body, probe)
		require.Error(t, err)
	})
}

func TestAllowEvent(t *testing.T) {
	probe := statusProbe(map[string]int{"visible": 200, "hidden": 403}, nil)

	cases := []struct {
		name  string
		event string
		want  bool
	}{
		{"added_visible", `{"type":"ADDED","object":{"metadata":{"name":"visible"}}}`, true},
		{"modified_hidden", `{"type":"MODIFIED","object":{"metadata":{"name":"hidden"}}}`, false},
		{"bookmark_without_name", `{"type":"BOOKMARK","object":{"metadata":{"resourceVersion":"7"}}}`, true},
		{"error_status", `{"type":"ERROR","object":{"kind":"Status","code":410}}`, true},
		{"deleted_unknown_namespace", `{"type":"DELETED","object":{"metadata":{"name":"gone"}}}`, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := newFilter().AllowEvent(context.Background(), "u", []byte(tc.event), probe)
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}

	t.Run("deleted_known_hidden_namespace_is_dropped", func(t *testing.T) {
		f := newFilter()

		_, err := f.Allowed(context.Background(), "u", []string{"hidden"}, probe)
		require.NoError(t, err)

		got, err := f.AllowEvent(context.Background(), "u",
			[]byte(`{"type":"DELETED","object":{"metadata":{"name":"hidden"}}}`), probe)
		require.NoError(t, err)
		assert.False(t, got)
	})

	t.Run("invalid_event_is_an_error", func(t *testing.T) {
		_, err := newFilter().AllowEvent(context.Background(), "u", []byte(`garbage`), probe)
		require.Error(t, err)
	})
}
