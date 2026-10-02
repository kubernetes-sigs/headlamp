package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/nsaccess"
)

const (
	namespaceListAPIPath = "/api/v1/namespaces"
	// maxProbeBodyBytes bounds how much of a probe response is drained so
	// the connection can be reused.
	maxProbeBodyBytes = 64 << 10
	wsCloseTimeout    = 5 * time.Second
)

// newNamespaceFilter builds the filter used when --require-namespace-get is
// enabled.
func newNamespaceFilter() *nsaccess.Filter {
	return nsaccess.New(cache.New[bool](), nsaccess.DefaultCacheTTL, nsaccess.DefaultConcurrency)
}

// namespaceGetProbe returns a Probe that performs GET /api/v1/namespaces/{name}
// on behalf of the user through the context's reverse proxy, so the request
// takes the same route (kube-apiserver or API proxy) as the user's own calls.
func namespaceGetProbe(kContext *kubeconfig.Context, token string) nsaccess.Probe {
	return func(ctx context.Context, name string) (int, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet,
			namespaceListAPIPath+"/"+url.PathEscape(name), nil)
		if err != nil {
			return 0, err
		}

		req.Header.Set("Accept", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := kContext.ProxyRoundTrip(req)
		if err != nil {
			return 0, err
		}

		defer func() { _ = resp.Body.Close() }()

		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxProbeBodyBytes))

		return resp.StatusCode, nil
	}
}

// namespaceAccessToken returns the user's bearer token for the request, or an
// empty string when the request is unauthenticated or served with the
// service account token (in which case there is no per-user identity to
// filter by).
func (c *HeadlampConfig) namespaceAccessToken(r *http.Request, kContext *kubeconfig.Context) string {
	if c.ProxyAuthEnabled && c.ProxyAuthTokenHeader != "" {
		if token := strings.TrimSpace(r.Header.Get(c.ProxyAuthTokenHeader)); token != "" {
			return token
		}
	}

	return c.requestTokenForContext(r, mux.Vars(r)["clusterName"], kContext)
}

// namespaceEventFilter adapts the namespace filter to the multiplexer hook.
func (c *HeadlampConfig) namespaceEventFilter(
	ctx context.Context,
	kContext *kubeconfig.Context,
	token string,
	event []byte,
) (bool, error) {
	return c.namespaceFilter.AllowEvent(ctx, nsaccess.UserKey(kContext.Name, token), event,
		namespaceGetProbe(kContext, token))
}

// RequireNamespaceGetMiddleware restricts namespace listings and namespace
// watches served through the cluster proxy to the namespaces the user may
// GET. It must wrap the cluster handler outside of the response cache so
// that cached (unfiltered) bodies are filtered per user as well.
func RequireNamespaceGetMiddleware(c *HeadlampConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet || !nsaccess.IsNamespaceListPath(mux.Vars(r)["api"]) {
				next.ServeHTTP(w, r)
				return
			}

			kContext, token := c.namespaceAccessContext(r)
			if kContext == nil || token == "" {
				// Let the cluster handler produce the proper error or serve
				// the request with the service account identity unchanged.
				next.ServeHTTP(w, r)
				return
			}

			userKey := nsaccess.UserKey(kContext.Name, token)

			if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") || nsaccess.IsWatchQuery(r.URL.Query()) {
				c.relayFilteredNamespaceWatch(w, r, kContext, token, userKey)
				return
			}

			c.serveFilteredNamespaceList(w, r, next, kContext, token, userKey)
		})
	}
}

// namespaceAccessContext resolves the cluster context and the user's token
// for the request. Either value is empty when it cannot be determined.
func (c *HeadlampConfig) namespaceAccessContext(r *http.Request) (*kubeconfig.Context, string) {
	contextKey, err := c.getContextKeyForRequest(r)
	if err != nil {
		return nil, ""
	}

	kContext, err := c.KubeConfigStore.GetContext(contextKey)
	if err != nil {
		return nil, ""
	}

	return kContext, c.namespaceAccessToken(r, kContext)
}

// serveFilteredNamespaceList lets the cluster handler fetch the namespace
// list, then rewrites the body so that it only contains namespaces the user
// may GET.
func (c *HeadlampConfig) serveFilteredNamespaceList(
	w http.ResponseWriter,
	r *http.Request,
	next http.Handler,
	kContext *kubeconfig.Context,
	token string,
	userKey string,
) {
	// Ask for an identity-encoded body so it can be parsed directly.
	r.Header.Del("Accept-Encoding")

	buffered := newBufferedResponseWriter()
	next.ServeHTTP(buffered, r)

	if buffered.status != http.StatusOK {
		buffered.replay(w)
		return
	}

	body, err := buffered.decodedBody()
	if err == nil {
		body, err = c.namespaceFilter.FilterList(r.Context(), userKey, body, namespaceGetProbe(kContext, token))
	}

	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": kContext.Name}, err,
			"filtering namespace list")
		http.Error(w, "namespace access check failed", http.StatusBadGateway)

		return
	}

	copyHeaders(w.Header(), buffered.header, "Content-Length", "Content-Encoding")
	w.Header().Set("Content-Length", fmt.Sprint(len(body)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body) //nolint:gosec // upstream JSON document, served with its original Content-Type
}

// bufferedResponseWriter captures a downstream response in memory.
type bufferedResponseWriter struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func newBufferedResponseWriter() *bufferedResponseWriter {
	return &bufferedResponseWriter{header: make(http.Header)}
}

func (b *bufferedResponseWriter) Header() http.Header { return b.header }

func (b *bufferedResponseWriter) WriteHeader(status int) {
	if b.status == 0 {
		b.status = status
	}
}

func (b *bufferedResponseWriter) Write(p []byte) (int, error) {
	if b.status == 0 {
		b.status = http.StatusOK
	}

	return b.body.Write(p)
}

// decodedBody returns the captured body, transparently gunzipping it when the
// upstream insisted on compressing the response.
func (b *bufferedResponseWriter) decodedBody() ([]byte, error) {
	if !strings.EqualFold(b.header.Get("Content-Encoding"), "gzip") {
		return b.body.Bytes(), nil
	}

	zr, err := gzip.NewReader(bytes.NewReader(b.body.Bytes()))
	if err != nil {
		return nil, err
	}

	defer func() { _ = zr.Close() }()

	return io.ReadAll(zr)
}

// replay writes the captured response unchanged.
func (b *bufferedResponseWriter) replay(w http.ResponseWriter) {
	copyHeaders(w.Header(), b.header)

	status := b.status
	if status == 0 {
		status = http.StatusOK
	}

	w.WriteHeader(status)
	_, _ = w.Write(b.body.Bytes())
}

func copyHeaders(dst, src http.Header, skip ...string) {
	for key, values := range src {
		skipped := false

		for _, s := range skip {
			if strings.EqualFold(key, s) {
				skipped = true
				break
			}
		}

		if skipped {
			continue
		}

		dst[key] = append([]string(nil), values...)
	}
}

// relayFilteredNamespaceWatch terminates the client's WebSocket, opens the
// namespace watch upstream with the user's token and forwards only the events
// that concern namespaces the user may GET.
func (c *HeadlampConfig) relayFilteredNamespaceWatch(
	w http.ResponseWriter,
	r *http.Request,
	kContext *kubeconfig.Context,
	token string,
	userKey string,
) {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		// Plain HTTP streaming watches are not used by the frontend; refusing
		// them keeps the filter airtight.
		http.Error(w, "namespace watches must use WebSocket when require-namespace-get is enabled",
			http.StatusBadRequest)

		return
	}

	// Strip the bearer-token subprotocols; the token is already known.
	processWebSocketProtocolHeader(r)

	upstream, status, err := dialNamespaceWatch(kContext, token, r)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": kContext.Name}, err,
			"dialing upstream namespace watch")
		http.Error(w, "failed to open namespace watch", status)

		return
	}

	defer func() { _ = upstream.Close() }()

	respHeader := http.Header{}
	if sp := upstream.Subprotocol(); sp != "" {
		respHeader.Set("Sec-WebSocket-Protocol", sp)
	}

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

	client, err := upgrader.Upgrade(w, r, respHeader)
	if err != nil {
		// Upgrade already replied to the client.
		return
	}

	defer func() { _ = client.Close() }()

	base64Frames := strings.Contains(upstream.Subprotocol(), "base64")
	probe := namespaceGetProbe(kContext, token)

	done := make(chan struct{}, 2)

	go func() {
		defer func() { done <- struct{}{} }()

		c.pumpNamespaceEvents(r.Context(), upstream, client, userKey, probe, base64Frames)
	}()

	go func() {
		defer func() { done <- struct{}{} }()

		pumpFrames(client, upstream)
	}()

	<-done
}

// dialNamespaceWatch opens the namespace watch against the cluster (or the
// API proxy) with the user's token, mirroring the subprotocols requested by
// the browser. The returned status is suitable for an HTTP error reply.
func dialNamespaceWatch(kContext *kubeconfig.Context, token string, r *http.Request) (*websocket.Conn, int, error) {
	restConf, err := kContext.RESTConfig()
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	host, tlsConfig, err := clusterUpstream(kContext, restConf)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	dialer := websocket.Dialer{
		TLSClientConfig:  tlsConfig,
		HandshakeTimeout: HandshakeTimeout,
		Subprotocols:     splitProtocols(r.Header.Get("Sec-WebSocket-Protocol")),
	}

	headers := http.Header{"Authorization": {"Bearer " + token}}

	conn, resp, err := dialer.Dial(createWebSocketURL(host, namespaceListAPIPath, r.URL.RawQuery), headers)
	if err != nil {
		status := http.StatusBadGateway

		if resp != nil {
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode >= http.StatusBadRequest {
				status = resp.StatusCode
			}
		}

		return nil, status, err
	}

	return conn, http.StatusOK, nil
}

func splitProtocols(header string) []string {
	if header == "" {
		return nil
	}

	parts := strings.Split(header, ",")
	protocols := make([]string, 0, len(parts))

	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			protocols = append(protocols, p)
		}
	}

	return protocols
}

// pumpNamespaceEvents forwards upstream frames to the client, dropping events
// for namespaces the user may not GET. Any filtering error closes the watch
// (the frontend re-lists and re-watches), never leaks the event.
func (c *HeadlampConfig) pumpNamespaceEvents(
	ctx context.Context,
	upstream, client *websocket.Conn,
	userKey string,
	probe nsaccess.Probe,
	base64Frames bool,
) {
	defer closeWebSocket(client)

	for {
		messageType, frame, err := upstream.ReadMessage()
		if err != nil {
			return
		}

		event := frame

		if base64Frames {
			if event, err = base64.StdEncoding.DecodeString(string(frame)); err != nil {
				logger.Log(logger.LevelError, nil, err, "decoding namespace watch frame")
				return
			}
		}

		allowed, err := c.namespaceFilter.AllowEvent(ctx, userKey, event, probe)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "filtering namespace watch event")
			return
		}

		if !allowed {
			continue
		}

		if err := client.WriteMessage(messageType, frame); err != nil {
			return
		}
	}
}

// pumpFrames copies frames from src to dst until either side closes.
func pumpFrames(src, dst *websocket.Conn) {
	defer closeWebSocket(dst)

	for {
		messageType, frame, err := src.ReadMessage()
		if err != nil {
			return
		}

		if err := dst.WriteMessage(messageType, frame); err != nil {
			return
		}
	}
}

func closeWebSocket(conn *websocket.Conn) {
	msg := websocket.FormatCloseMessage(websocket.CloseNormalClosure, "")

	err := conn.WriteControl(websocket.CloseMessage, msg, time.Now().Add(wsCloseTimeout))
	if err != nil && !errors.Is(err, websocket.ErrCloseSent) {
		_ = conn.Close()
	}
}
