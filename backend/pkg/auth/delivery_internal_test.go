package auth

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

func TestCookieDeliveryStateExpiresOnlyAfterIdle(t *testing.T) {
	const (
		chain       = "idle-expiry-chain"
		destination = "cluster\x00base"
	)

	key := cookieDeliveryKey(chain, destination)
	latestCookieDelivery.Delete(key)
	t.Cleanup(func() { latestCookieDelivery.Delete(key) })

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}

	delivery, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected delivery claim")
	}

	const idleTTL = 20 * time.Millisecond

	scheduleCookieDeliveryCleanupAfter(key, delivery.state, idleTTL)
	time.Sleep(3 * idleTTL)

	if _, ok := latestCookieDelivery.Load(key); !ok {
		t.Fatal("active delivery state expired before its reference was released")
	}

	delivery.finish(false)
	requireEventually(t, 500*time.Millisecond, func() bool {
		_, ok := latestCookieDelivery.Load(key)

		return !ok
	})
}

//nolint:funlen // The deterministic upgrade test coordinates hijacking, flushing, and cookie commit.
func TestRefreshResponseWriterHijackCommitsAfterUpgradeWrite(t *testing.T) {
	chain := "hijack-commit-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}

	delivery, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected delivery claim")
	}

	rawServerConn, clientConn := net.Pipe()
	serverConn := &deadlineRecordingConn{Conn: rawServerConn}

	t.Cleanup(func() {
		_ = serverConn.Close()
		_ = clientConn.Close()
	})

	upgrade := make(chan string, 1)

	go func() {
		payload, _ := io.ReadAll(clientConn)
		upgrade <- string(payload)
	}()

	underlying := &hijackResponseWriter{
		ResponseRecorder: httptest.NewRecorder(),
		hijack: func() (net.Conn, *bufio.ReadWriter, error) {
			return serverConn, bufio.NewReadWriter(
				bufio.NewReader(serverConn),
				bufio.NewWriter(serverConn),
			), nil
		},
	}
	delivery.stage = func() error {
		underlying.Header().Add("Set-Cookie", "headlamp-auth-cluster.0=new")

		delivery.setCookies = []string{"headlamp-auth-cluster.0=new"}

		return nil
	}
	writer := &refreshResponseWriter{
		ResponseWriter: underlying,
		delivery:       delivery,
		ctx:            context.Background(),
	}

	_, rw, err := writer.Hijack()
	if err != nil {
		t.Fatalf("Hijack failed: %v", err)
	}

	if delivery.finished.Load() {
		t.Fatal("delivery committed before upgrade headers were written")
	}

	if serverConn.writeDeadline.IsZero() {
		t.Fatal("hijacked connection did not receive a write deadline")
	}

	_, err = rw.WriteString("HTTP/1.1 101 Switching Protocols\r\n")
	require.NoError(t, err)

	if delivery.finished.Load() {
		t.Fatal("delivery committed while the complete response remained buffered")
	}

	_, err = rw.WriteString(
		"X-Large: " + strings.Repeat("x", 16*1024) + "\r\n",
	)
	require.NoError(t, err)

	if delivery.finished.Load() {
		t.Fatal("delivery committed before the complete upgrade header block")
	}

	_, err = io.WriteString(
		rw,
		"Set-Cookie: "+underlying.Header().Get("Set-Cookie")+"\r\n\r\n",
	)
	if err != nil {
		t.Fatalf("writing buffered upgrade response failed: %v", err)
	}

	if delivery.finished.Load() {
		t.Fatal("delivery committed before the outer buffered writer was flushed")
	}

	if err := rw.Flush(); err != nil {
		t.Fatalf("flushing upgrade response failed: %v", err)
	}

	if !delivery.finished.Load() {
		t.Fatal("delivery was not committed after upgrade headers were flushed")
	}

	if !serverConn.writeDeadline.IsZero() {
		t.Fatal("hijacked connection retained its write deadline after commit")
	}

	_ = serverConn.Close()

	payload := <-upgrade
	if !strings.Contains(payload, "101 Switching Protocols") ||
		!strings.Contains(payload, "Set-Cookie: headlamp-auth-cluster.0=new") {
		t.Fatalf("upgrade response missing expected headers: %q", payload)
	}
}

func TestRefreshResponseWriterHijackCommitsBufferedSwitchingProtocols(t *testing.T) {
	chain := "buffered-101-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}
	delivery, claimed := result.claimCookieWrite(context.Background(), destination)
	require.True(t, claimed)

	rawServerConn, clientConn := net.Pipe()
	serverConn := &deadlineRecordingConn{Conn: rawServerConn}

	t.Cleanup(func() {
		_ = serverConn.Close()
		_ = clientConn.Close()
	})

	underlying := &hijackResponseWriter{
		ResponseRecorder: httptest.NewRecorder(),
		hijack: func() (net.Conn, *bufio.ReadWriter, error) {
			return serverConn, bufio.NewReadWriter(
				bufio.NewReader(serverConn),
				bufio.NewWriter(serverConn),
			), nil
		},
	}
	writer := &refreshResponseWriter{
		ResponseWriter: underlying,
		delivery:       delivery,
		ctx:            context.Background(),
	}
	writer.WriteHeader(http.StatusSwitchingProtocols)
	require.NoError(t, writer.FlushError())

	conn, readWriter, err := writer.Hijack()
	require.NoError(t, err)
	assert.True(t, delivery.finished.Load())
	assert.Equal(t, http.StatusSwitchingProtocols, underlying.Code)
	assert.Same(t, serverConn, conn)
	assert.True(t, serverConn.writeDeadline.IsZero())

	received := make(chan string, 1)
	go func() {
		payload := make([]byte, len("websocket-frame"))

		_, readErr := io.ReadFull(clientConn, payload)
		if readErr == nil {
			received <- string(payload)
		}
	}()

	_, err = readWriter.WriteString("websocket-frame")
	require.NoError(t, err)
	require.NoError(t, readWriter.Flush())
	assert.Equal(t, "websocket-frame", <-received)
}

func TestRefreshResponseWriterStagesCookieAgainstCommittedHeaderSnapshot(t *testing.T) {
	const (
		chain       = "post-status-auth-cookie-chain"
		cluster     = "post-status"
		destination = cluster + "\x00"
	)

	key := cookieDeliveryKey(chain, destination)
	latestCookieDelivery.Delete(key)
	t.Cleanup(func() { latestCookieDelivery.Delete(key) })

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "NEW"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}
	delivery, claimed := result.claimCookieWrite(context.Background(), destination)
	require.True(t, claimed)

	underlying := httptest.NewRecorder()
	writer := &refreshResponseWriter{
		ResponseWriter: underlying,
		delivery:       delivery,
		ctx:            context.Background(),
	}
	request := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodGet,
		"/clusters/"+cluster,
		nil,
	)
	params := RefreshAndSetTokenParams{
		Writer:           underlying,
		Request:          request,
		Cluster:          cluster,
		TelemetryHandler: &telemetry.RequestHandler{},
		SessionTTL:       3600,
	}
	delivery.stage = stageRefreshCookies(params, result.token, "NEW", delivery)

	writer.WriteHeader(http.StatusAccepted)
	writer.Header().Add("Set-Cookie", "headlamp-auth-"+cluster+".0=downstream")

	_, err := writer.Write([]byte("ok"))
	require.NoError(t, err)

	response := underlying.Result()

	t.Cleanup(func() { _ = response.Body.Close() })

	authCookies := response.Cookies()
	require.NotEmpty(t, authCookies)
	assert.NotEqual(t, "downstream", authCookies[0].Value)
	assert.True(t, delivery.finished.Load())
}

func TestRefreshResponseWriterHijackFailureReleasesClaim(t *testing.T) {
	chain := "hijack-failure-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}

	delivery, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected delivery claim")
	}

	underlying := &hijackResponseWriter{
		ResponseRecorder: httptest.NewRecorder(),
		hijack: func() (net.Conn, *bufio.ReadWriter, error) {
			return nil, nil, errors.New("upgrade failed")
		},
	}
	writer := &refreshResponseWriter{
		ResponseWriter: underlying,
		delivery:       delivery,
		ctx:            context.Background(),
	}

	if _, _, err := writer.Hijack(); err == nil {
		t.Fatal("expected hijack failure")
	}

	assert.Empty(t, underlying.Header().Values("Set-Cookie"))

	retry, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("failed hijack did not release the cookie claim")
	}

	retryWriter := &refreshResponseWriter{
		ResponseWriter: httptest.NewRecorder(),
		delivery:       retry,
		ctx:            context.Background(),
	}
	if !retryWriter.prepareCookies() {
		t.Fatal("follower could not acquire the released cookie claim")
	}

	retry.finish(true)
}

//nolint:funlen // Coordinates hijack, injected transport failure, and follow-up claim.
func TestRefreshResponseWriterHijackFlushFailureReleasesClaim(t *testing.T) {
	chain := "hijack-flush-failure-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}

	delivery, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected delivery claim")
	}

	failingConn := &failingWriteConn{
		Conn: &discardConn{},
	}
	underlying := &hijackResponseWriter{
		ResponseRecorder: httptest.NewRecorder(),
		hijack: func() (net.Conn, *bufio.ReadWriter, error) {
			return failingConn, bufio.NewReadWriter(
				bufio.NewReader(failingConn),
				bufio.NewWriterSize(failingConn, 8),
			), nil
		},
	}
	delivery.stage = func() error {
		underlying.Header().Add("Set-Cookie", "headlamp-auth-cluster.0=new")

		delivery.setCookies = []string{"headlamp-auth-cluster.0=new"}

		return nil
	}
	writer := &refreshResponseWriter{
		ResponseWriter: underlying,
		delivery:       delivery,
		ctx:            context.Background(),
	}

	_, rw, err := writer.Hijack()
	require.NoError(t, err)

	_, err = rw.WriteString("HTTP/1.1 101 Switching Protocols\r\n")
	require.NoError(t, err)

	_, err = rw.WriteString("Set-Cookie: refreshed\r\n\r\n")
	require.NoError(t, err)
	require.Error(t, rw.Flush())
	assert.True(t, delivery.finished.Load())

	follower, claimed := result.claimCookieWrite(context.Background(), destination)
	require.True(t, claimed, "failed upgrade flush must release the cookie claim")

	followerWriter := &refreshResponseWriter{
		ResponseWriter: httptest.NewRecorder(),
		delivery:       follower,
		ctx:            context.Background(),
	}
	require.True(t, followerWriter.prepareCookies())
	follower.finish(true)
}

func TestRefreshResponseWriterFlushFailureReleasesClaim(t *testing.T) {
	chain := "flush-failure-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}

	delivery, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected delivery claim")
	}

	underlying := &flushErrorResponseWriter{
		ResponseRecorder: httptest.NewRecorder(),
	}
	writer := &refreshResponseWriter{
		ResponseWriter: underlying,
		delivery:       delivery,
		ctx:            context.Background(),
	}

	writer.WriteHeader(200)
	require.Error(t, writer.FlushError())

	if !delivery.finished.Load() {
		t.Fatal("failed flush did not finish delivery")
	}

	retry, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("failed flush did not release the cookie claim")
	}

	retryWriter := &refreshResponseWriter{
		ResponseWriter: httptest.NewRecorder(),
		delivery:       retry,
		ctx:            context.Background(),
	}
	if !retryWriter.prepareCookies() {
		t.Fatal("follower could not acquire the claim after a flush failure")
	}

	retry.finish(true)
}

func TestRefreshResponseWriterExplicitFlushStagesCookieAndCommits(t *testing.T) {
	chain := "explicit-flush-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}

	delivery, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected delivery claim")
	}

	underlying := &flushTrackingResponseWriter{
		ResponseRecorder: httptest.NewRecorder(),
	}
	delivery.stage = func() error {
		underlying.Header().Add("Set-Cookie", "headlamp-auth-cluster.0=new")

		delivery.setCookies = []string{"headlamp-auth-cluster.0=new"}

		return nil
	}
	writer := &refreshResponseWriter{
		ResponseWriter: underlying,
		delivery:       delivery,
		ctx:            context.Background(),
	}

	if err := writer.FlushError(); err != nil {
		t.Fatalf("flush failed: %v", err)
	}

	assertCookieHeader(t, underlying.Header().Values("Set-Cookie"), "headlamp-auth-cluster.0=new")

	if !underlying.flushed {
		t.Fatal("underlying response was not flushed")
	}

	if !delivery.finished.Load() {
		t.Fatal("explicit flush did not commit the cookie delivery")
	}
}

func TestRefreshResponseWriterDoesNotFlushAfterLostClaim(t *testing.T) {
	chain := "lost-claim-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}

	winner, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected winner claim")
	}

	winningWriter := &refreshResponseWriter{
		ResponseWriter: httptest.NewRecorder(),
		delivery:       winner,
		ctx:            context.Background(),
	}
	requirePrepareCookies(t, winningWriter)
	winner.finish(true)

	follower, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected follower delivery")
	}

	underlying := &flushTrackingResponseWriter{
		ResponseRecorder: httptest.NewRecorder(),
	}
	writer := &refreshResponseWriter{
		ResponseWriter: underlying,
		delivery:       follower,
		ctx:            context.Background(),
	}

	if _, err := writer.Write([]byte("body")); err != nil {
		t.Fatalf("writing follower response failed: %v", err)
	}

	if underlying.flushed {
		t.Fatal("a response that lost the cookie claim forced a network flush")
	}
}

func TestRefreshResponseWriterLostClaimCommitsPendingStatusBeforeBody(t *testing.T) {
	chain := "lost-claim-status-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}
	winner, claimed := result.claimCookieWrite(context.Background(), destination)
	require.True(t, claimed)

	winnerWriter := &refreshResponseWriter{
		ResponseWriter: httptest.NewRecorder(),
		delivery:       winner,
		ctx:            context.Background(),
	}
	require.True(t, winnerWriter.prepareCookies())
	winner.finish(true)

	follower, claimed := result.claimCookieWrite(context.Background(), destination)
	require.True(t, claimed)

	recorder := httptest.NewRecorder()
	followerWriter := &refreshResponseWriter{
		ResponseWriter: recorder,
		delivery:       follower,
		ctx:            context.Background(),
	}

	followerWriter.WriteHeader(http.StatusForbidden)
	_, err := followerWriter.Write([]byte("forbidden"))
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, recorder.Code)
}

func TestRefreshResponseWriterTreatsUnsupportedFlushAsOptional(t *testing.T) {
	chain := "unsupported-flush-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}

	delivery, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected delivery claim")
	}

	underlying := &unsupportedFlushResponseWriter{header: make(http.Header)}
	delivery.stage = func() error {
		underlying.Header().Add("Set-Cookie", "headlamp-auth-cluster.0=new")

		delivery.setCookies = []string{"headlamp-auth-cluster.0=new"}

		return nil
	}
	writer := &refreshResponseWriter{
		ResponseWriter: underlying,
		delivery:       delivery,
		ctx:            context.Background(),
	}

	written, err := writer.Write([]byte("payload"))
	require.NoError(t, err)
	assert.Equal(t, len("payload"), written)
	assert.Equal(t, http.StatusOK, underlying.status)
	assert.True(t, underlying.deadline.IsZero(), "cookie deadline must be cleared before body write")
	assert.True(t, delivery.finished.Load())
	assertCookieHeader(t, underlying.Header().Values("Set-Cookie"), "headlamp-auth-cluster.0=new")
}

func TestRefreshResponseWriterDefersHeaderFlushForContentTypeDetection(t *testing.T) {
	chain := "content-type-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}
	delivery, claimed := result.claimCookieWrite(context.Background(), destination)
	require.True(t, claimed)

	underlying := &unsupportedFlushResponseWriter{header: make(http.Header)}
	writer := &refreshResponseWriter{
		ResponseWriter: underlying,
		delivery:       delivery,
		ctx:            context.Background(),
	}

	writer.WriteHeader(http.StatusOK)
	assert.Zero(t, underlying.status, "header must remain uncommitted until content is inspected")

	_, err := writer.Write([]byte("<html>ok</html>"))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, underlying.status)
	assert.Equal(t, "text/html; charset=utf-8", underlying.Header().Get("Content-Type"))
}

func TestRefreshResponseWriterDetectsContentTypeWithoutExplicitStatus(t *testing.T) {
	writer := newTestRefreshResponseWriter(make(http.Header))
	underlying := writer.ResponseWriter.(*recordingHeaderResponseWriter)

	_, err := writer.Write([]byte("<html>implicit</html>"))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, underlying.Code)
	assert.Equal(t, "text/html; charset=utf-8", underlying.Header().Get("Content-Type"))
}

func TestRefreshResponseWriterRespectsContentTypeAndEncodingSuppression(t *testing.T) {
	for _, test := range []struct {
		name   string
		header http.Header
	}{
		{
			name:   "explicitly absent content type",
			header: http.Header{"Content-Type": nil},
		},
		{
			name:   "gzip content",
			header: http.Header{"Content-Encoding": []string{"gzip"}},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			writer := newTestRefreshResponseWriter(test.header)

			_, err := writer.Write([]byte("payload"))

			require.NoError(t, err)
			assert.NotEqual(t, http.DetectContentType([]byte("payload")), test.header.Get("Content-Type"))
		})
	}
}

func TestRefreshResponseWriterWritesHeadersOnceAcrossChunksAndFlushes(t *testing.T) {
	writer := newTestRefreshResponseWriter(make(http.Header))
	underlying := writer.ResponseWriter.(*recordingHeaderResponseWriter)

	writer.WriteHeader(http.StatusAccepted)
	_, err := writer.Write([]byte("first"))
	require.NoError(t, err)
	_, err = writer.Write([]byte("second"))
	require.NoError(t, err)
	require.NoError(t, writer.FlushError())

	assert.Equal(t, 1, underlying.writeHeaderCalls)
	assert.Equal(t, http.StatusAccepted, underlying.Code)
}

func TestRefreshResponseWriterSnapshotsHeadersAtFirstFinalStatus(t *testing.T) {
	header := make(http.Header)
	header.Set("X-Before", "kept")
	writer := newTestRefreshResponseWriter(header)
	underlying := writer.ResponseWriter.(*recordingHeaderResponseWriter)

	writer.WriteHeader(http.StatusCreated)
	underlying.Header().Set("X-After", "ignored")

	_, err := writer.Write([]byte("payload"))
	require.NoError(t, err)

	assert.Equal(t, http.StatusCreated, underlying.Code)
	assert.Equal(t, "kept", underlying.Header().Get("X-Before"))
	assert.Empty(t, underlying.Header().Get("X-After"))
}

func TestRefreshResponseWriterPreservesDynamicTrailers(t *testing.T) {
	writer := newTestRefreshResponseWriter(make(http.Header))
	underlying := writer.ResponseWriter.(*recordingHeaderResponseWriter)

	writer.WriteHeader(http.StatusOK)
	underlying.Header().Set(http.TrailerPrefix+"X-Result", "complete")

	_, err := writer.Write([]byte("payload"))
	require.NoError(t, err)

	assert.Equal(t, "complete", underlying.Header().Get(http.TrailerPrefix+"X-Result"))
}

func newTestRefreshResponseWriter(header http.Header) *refreshResponseWriter {
	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      "response-header-chain",
		generation:   refreshGeneration.Add(1),
	}
	delivery, _ := result.claimCookieWrite(context.Background(), "cluster\x00base")

	return &refreshResponseWriter{
		ResponseWriter: &recordingHeaderResponseWriter{
			ResponseRecorder: httptest.NewRecorder(),
			customHeader:     header,
		},
		delivery: delivery,
		ctx:      context.Background(),
	}
}

func TestRefreshResponseWriterWriteHeaderDoesNotHoldDeliveryGate(t *testing.T) {
	chain := "header-stall-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}
	first, claimed := result.claimCookieWrite(context.Background(), destination)
	require.True(t, claimed)

	firstWriter := &refreshResponseWriter{
		ResponseWriter: httptest.NewRecorder(),
		delivery:       first,
		ctx:            context.Background(),
	}
	firstWriter.WriteHeader(http.StatusAccepted)
	assert.False(t, first.locked, "WriteHeader must not acquire the cookie-delivery gate")

	follower, claimed := result.claimCookieWrite(context.Background(), destination)
	require.True(t, claimed)

	followerWriter := &refreshResponseWriter{
		ResponseWriter: httptest.NewRecorder(),
		delivery:       follower,
		ctx:            context.Background(),
	}
	acquired := make(chan bool, 1)

	go func() {
		acquired <- followerWriter.prepareCookies()
	}()

	select {
	case ok := <-acquired:
		require.True(t, ok)
	case <-time.After(time.Second):
		t.Fatal("follower blocked behind WriteHeader")
	}

	follower.finish(true)

	_ = firstWriter.FlushError()
}

func TestRefreshResponseWriterCancellationAfterWriteHeaderReleasesClaim(t *testing.T) {
	chain := "header-cancellation-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}
	ctx, cancel := context.WithCancel(context.Background())
	canceled, claimed := result.claimCookieWrite(ctx, destination)
	require.True(t, claimed)

	writer := &refreshResponseWriter{
		ResponseWriter: httptest.NewRecorder(),
		delivery:       canceled,
		ctx:            ctx,
	}
	writer.WriteHeader(http.StatusCreated)
	cancel()
	require.NoError(t, writer.FlushError())
	assert.Equal(t, http.StatusCreated, writer.ResponseWriter.(*httptest.ResponseRecorder).Code)

	follower, claimed := result.claimCookieWrite(context.Background(), destination)
	require.True(t, claimed, "canceled delivery did not release its uncommitted claim")
	follower.finish(true)
}

//nolint:funlen // Coordinates a blocked flush with a follower attempting the same cookie claim.
func TestRefreshResponseWriterBoundsSlowCookieFlush(t *testing.T) {
	oldTimeout := cookieDeliveryWriteTimeout
	cookieDeliveryWriteTimeout = 20 * time.Millisecond

	t.Cleanup(func() { cookieDeliveryWriteTimeout = oldTimeout })

	chain := "bounded-flush-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}

	winner, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected winner claim")
	}

	underlying := &blockedFlushResponseWriter{
		ResponseRecorder: httptest.NewRecorder(),
		started:          make(chan struct{}),
	}
	writer := &refreshResponseWriter{
		ResponseWriter: underlying,
		delivery:       winner,
		ctx:            context.Background(),
	}

	firstDone := make(chan struct{})

	go func() {
		writer.WriteHeader(http.StatusOK)
		_ = writer.FlushError()

		close(firstDone)
	}()

	<-underlying.started

	follower, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected follower delivery")
	}

	followerDone := make(chan bool, 1)

	go func() {
		followerWriter := &refreshResponseWriter{
			ResponseWriter: httptest.NewRecorder(),
			delivery:       follower,
			ctx:            context.Background(),
		}
		followerDone <- followerWriter.prepareCookies()
	}()

	select {
	case acquired := <-followerDone:
		if !acquired {
			t.Fatal("follower did not acquire cookie delivery after the bounded write")
		}

		follower.finish(true)
	case <-time.After(time.Second):
		t.Fatal("slow response write blocked the follower indefinitely")
	}

	<-firstDone
}

//nolint:funlen // The live-server test holds a request body open until the response is delivered.
func TestRefreshResponseWriterEnablesFullDuplexForWithheldBody(t *testing.T) {
	chain := "withheld-body-chain"
	destination := "cluster\x00base"
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))

	result := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "token"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
	}

	delivery, claimed := result.claimCookieWrite(context.Background(), destination)
	if !claimed {
		t.Fatal("expected delivery claim")
	}

	handled := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writer := &refreshResponseWriter{
			ResponseWriter: w,
			delivery:       delivery,
			ctx:            context.Background(),
		}
		writer.WriteHeader(http.StatusOK)
		_ = writer.FlushError()

		close(handled)
	}))
	t.Cleanup(server.Close)

	dialer := &net.Dialer{}

	conn, err := dialer.DialContext(
		context.Background(),
		"tcp",
		strings.TrimPrefix(server.URL, "http://"),
	)
	if err != nil {
		t.Fatalf("dialing test server failed: %v", err)
	}

	t.Cleanup(func() { _ = conn.Close() })

	_, err = io.WriteString(
		conn,
		"POST / HTTP/1.1\r\nHost: headlamp.test\r\nContent-Length: 10\r\n\r\n",
	)
	if err != nil {
		t.Fatalf("writing request headers failed: %v", err)
	}

	_ = conn.SetReadDeadline(time.Now().Add(time.Second))

	response, err := http.ReadResponse(bufio.NewReader(conn), &http.Request{Method: http.MethodPost})
	if err != nil {
		t.Fatalf("reading response while request body was withheld failed: %v", err)
	}

	_ = response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("response status = %d, want %d", response.StatusCode, http.StatusOK)
	}

	select {
	case <-handled:
	case <-time.After(time.Second):
		t.Fatal("handler did not finish after flushing the response")
	}
}

//nolint:funlen // Coordinates an old token flight, successor follower, cancellation, and blocked endpoint.
func TestRefreshSuccessorUsesNewFlightContext(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})

	var releaseOnce sync.Once

	releaseEndpoint := func() {
		releaseOnce.Do(func() { close(release) })
	}

	var calls atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		close(entered)
		<-release

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":  "ACCESS_NEW",
			"token_type":    "Bearer",
			"expires_in":    3600,
			"refresh_token": "REFRESH_NEW",
		})
	}))

	t.Cleanup(func() {
		releaseEndpoint()
		server.Close()
	})

	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { _ = tokenCache.Close() })

	expired := &oauth2.Token{
		AccessToken: "ACCESS_EXPIRED",
		Expiry:      time.Now().Add(-time.Minute),
	}
	require.NoError(t, tokenCache.Set(
		context.Background(),
		"oidc-refreshed-token-OLD",
		expired,
	))
	require.NoError(t, tokenCache.Set(
		context.Background(),
		"oidc-token-ACCESS_EXPIRED",
		"REFRESH_SUCCESSOR",
	))

	oldCtx, cancelOld := context.WithCancel(context.Background())
	oldDone := make(chan error, 1)

	go func() {
		_, err := refreshTokenFromIDP(
			oldCtx,
			"cid",
			"secret",
			tokenCache,
			"access_token",
			"OLD",
			server.URL,
			time.Hour,
			"OLD",
		)
		oldDone <- err
	}()

	<-entered

	followerDone := make(chan error, 1)

	go func() {
		_, err := getNewToken(
			"cid",
			"secret",
			tokenCache,
			"access_token",
			"ACCESS_EXPIRED",
			server.URL,
			context.Background(),
			time.Hour,
		)
		followerDone <- err
	}()

	time.Sleep(20 * time.Millisecond)
	cancelOld()

	select {
	case err := <-oldDone:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(time.Second):
		t.Fatal("canceled old-token caller did not return while the successor exchange was blocked")
	}

	releaseEndpoint()
	require.NoError(t, <-followerDone)
	assert.Equal(t, int32(1), calls.Load())
}

func TestLatestRefreshPublicationWinsAgainstCleanup(t *testing.T) {
	const chain = "cleanup-publication-chain"

	stateKey := refreshStateKey{chainID: chain}
	latestRefreshByChain.Delete(stateKey)
	t.Cleanup(func() { latestRefreshByChain.Delete(stateKey) })

	oldResult := &tokenRefreshResult{chainID: chain, generation: 1}
	state := &latestRefreshState{
		gate:   make(chan struct{}, 1),
		result: oldResult,
	}
	state.lastActivity.Store(time.Now().Add(-time.Hour).UnixNano())
	latestRefreshByChain.Store(stateKey, state)

	state.gate <- struct{}{}

	cleanupDone := make(chan struct{})

	go func() {
		runLatestRefreshCleanup(stateKey, state, 300*time.Millisecond)
		close(cleanupDone)
	}()

	newResult := &tokenRefreshResult{chainID: chain, generation: 2}
	publishDone := make(chan struct{})

	go func() {
		recordLatestRefreshResult(chain, newResult)
		close(publishDone)
	}()

	<-state.gate
	<-cleanupDone
	<-publishDone

	require.Same(t, newResult, latestRefreshResult(chain))
}

func TestLatestRefreshCleanupUsesRemainingIdleInterval(t *testing.T) {
	const chain = "cleanup-remaining-chain"

	stateKey := refreshStateKey{chainID: chain}
	latestRefreshByChain.Delete(stateKey)
	t.Cleanup(func() { latestRefreshByChain.Delete(stateKey) })

	const idleTTL = 300 * time.Millisecond

	state := &latestRefreshState{
		gate:   make(chan struct{}, 1),
		result: &tokenRefreshResult{chainID: chain, generation: 1},
	}
	state.lastActivity.Store(time.Now().Add(-idleTTL / 2).UnixNano())
	latestRefreshByChain.Store(stateKey, state)

	runLatestRefreshCleanup(stateKey, state, idleTTL)
	time.Sleep(2 * idleTTL)

	if _, ok := latestRefreshByChain.Load(stateKey); ok {
		t.Fatal("latest refresh state was retained beyond the remaining idle interval")
	}
}

func TestRecoveryRetirementIsFixedPerAlias(t *testing.T) {
	result := &tokenRefreshResult{sourceToken: "TOKEN_B"}
	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { _ = tokenCache.Close() })
	require.NoError(t, tokenCache.Set(
		context.Background(),
		recoveryTokenKeyPrefix+"TOKEN_A",
		"result",
	))
	require.NoError(t, tokenCache.Set(
		context.Background(),
		recoveryTokenKeyPrefix+"TOKEN_B",
		"result",
	))

	result.retireRecovery(tokenCache, recoveryTokenKeyPrefix+"TOKEN_A")
	result.retireRecovery(tokenCache, recoveryTokenKeyPrefix+"TOKEN_A")

	_, retiredA := result.recoveryRetirementKeys().Load(recoveryTokenKeyPrefix + "TOKEN_A")
	_, retiredB := result.recoveryRetirementKeys().Load(recoveryTokenKeyPrefix + "TOKEN_B")

	assert.True(t, retiredA)
	assert.True(t, retiredB)
}

func TestPendingCookieDestinationsSurviveRefreshGenerations(t *testing.T) {
	const (
		chain       = "shared-pending-generation-chain"
		destination = "cluster\x00base"
	)

	latestRefreshByChain.Delete(refreshStateKey{chainID: chain})
	t.Cleanup(func() { latestRefreshByChain.Delete(refreshStateKey{chainID: chain}) })

	first := &tokenRefreshResult{
		chainID:     chain,
		generation:  refreshGeneration.Add(1),
		sourceToken: "A",
	}
	recordPendingCookieDelivery(chain, destination, "A")
	recordLatestRefreshResult(chain, first)
	assert.True(t, first.hasPendingCookieDelivery())

	latest := &tokenRefreshResult{
		chainID:     chain,
		generation:  refreshGeneration.Add(1),
		sourceToken: "B",
	}
	recordLatestRefreshResult(chain, latest)

	assert.True(t, latest.hasPendingCookieDelivery())
	latest.markPendingCookieDelivery(destination)

	committed := &cookieDeliveryState{}
	committed.committedGeneration.Store(first.generation)
	latestCookieDelivery.Store(cookieDeliveryKey(chain, destination), committed)
	assert.True(t, first.hasPendingCookieDelivery())

	latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination))
	latest.completeCookieDelivery(destination)

	_, pending := first.pendingCookieDestinations().Load(
		pendingCookieIntentKey{destination: destination, ownerToken: "A"},
	)
	assert.False(t, pending)
	assert.False(t, first.hasPendingCookieDelivery())
	assert.False(t, latest.hasPendingCookieDelivery())
}

//nolint:funlen // Coordinates a blocked header-only leader with a canceled browser follower.
func TestCanceledBrowserFollowerRegistersCookieIntentBeforeSharedRefreshCompletes(t *testing.T) {
	const (
		token       = "CANCELED_BROWSER_FOLLOWER"
		cluster     = "canceled-browser-follower"
		destination = cluster + "\x00"
	)

	entered := make(chan struct{})
	release := make(chan struct{})

	var enterOnce sync.Once

	var server *httptest.Server

	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
				"issuer":                 server.URL,
				"authorization_endpoint": server.URL + "/authorize",
				"token_endpoint":         server.URL + "/token",
				"jwks_uri":               server.URL + "/keys",
			}))

			return
		}

		enterOnce.Do(func() { close(entered) })
		<-release
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
			"access_token":  "NEW_ACCESS",
			"token_type":    "Bearer",
			"expires_in":    3600,
			"refresh_token": "NEW_REFRESH",
		}))
	}))
	t.Cleanup(server.Close)

	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, tokenCache.Close()) })

	stateKey := refreshStateKey{chainID: token, cacheScope: cacheScopeOf(tokenCache)}
	latestRefreshByChain.Delete(stateKey)
	t.Cleanup(func() { latestRefreshByChain.Delete(stateKey) })
	require.NoError(t, tokenCache.Set(
		context.Background(),
		oidcKeyPrefix+token,
		"REFRESH_OLD",
	))
	require.NoError(t, tokenCache.Set(
		context.Background(),
		oidcIDTokenKeyPrefix+token,
		"OLD_ID_TOKEN",
	))

	newParams := func(ctx context.Context, browser bool) RefreshAndSetTokenParams {
		request := httptest.NewRequestWithContext(ctx, http.MethodGet, "/clusters/"+cluster, nil)
		if !browser {
			request.Header.Set("Authorization", "Bearer "+token)
		}

		return RefreshAndSetTokenParams{
			Ctx:                ctx,
			OIDCAuthConfig:     &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"},
			Cache:              tokenCache,
			Token:              token,
			Cluster:            cluster,
			Writer:             httptest.NewRecorder(),
			Request:            request,
			TelemetryHandler:   &telemetry.RequestHandler{},
			OIDCUseAccessToken: true,
			OIDCIdpIssuerURL:   server.URL,
			SessionTTL:         3600,
		}
	}

	leaderDone := make(chan struct{})

	go func() {
		_ = refreshAndSetToken(newParams(context.Background(), false), true)

		close(leaderDone)
	}()

	<-entered

	followerCtx, cancelFollower := context.WithCancel(context.Background())
	cancelFollower()

	followerStarted := make(chan struct{})
	followerDone := make(chan struct{})

	go func() {
		close(followerStarted)

		_ = refreshAndSetToken(newParams(followerCtx, true), true)

		close(followerDone)
	}()

	<-followerStarted
	<-followerDone

	close(release)
	<-leaderDone

	result := latestRefreshResult(token, cacheScopeOf(tokenCache))
	require.NotNil(t, result)
	_, pending := result.pendingCookieDestinations().Load(
		pendingCookieIntentKey{destination: destination, ownerToken: token},
	)
	assert.True(t, pending)
	assert.True(t, result.hasPendingCookieDelivery())
}

func TestDeliveredCookieDestinationCannotReopenPendingRecovery(t *testing.T) {
	const (
		chain       = "late-follower-delivery-chain"
		delivered   = "cluster-a\x00base"
		undelivered = "cluster-b\x00base"
	)

	latestRefreshByChain.Delete(refreshStateKey{chainID: chain})
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, delivered))
	latestCookieDelivery.Delete(cookieDeliveryKey(chain, undelivered))

	t.Cleanup(func() {
		latestRefreshByChain.Delete(refreshStateKey{chainID: chain})
		latestCookieDelivery.Delete(cookieDeliveryKey(chain, delivered))
		latestCookieDelivery.Delete(cookieDeliveryKey(chain, undelivered))
	})

	result := &tokenRefreshResult{
		chainID:     chain,
		generation:  refreshGeneration.Add(1),
		sourceToken: "A",
	}
	recordLatestRefreshResult(chain, result)
	recordPendingCookieDelivery(chain, delivered, "A")
	recordPendingCookieDelivery(chain, undelivered, "A")

	deliveredState := &cookieDeliveryState{}
	deliveredState.committedGeneration.Store(result.generation)
	latestCookieDelivery.Store(cookieDeliveryKey(chain, delivered), deliveredState)

	// A late follower for the completed destination must not make it pending again.
	result.markPendingCookieDelivery(delivered)
	assert.True(t, result.hasPendingCookieDelivery())

	result.markPendingCookieDelivery(undelivered)

	undeliveredState := &cookieDeliveryState{}
	undeliveredState.committedGeneration.Store(result.generation)
	latestCookieDelivery.Store(cookieDeliveryKey(chain, undelivered), undeliveredState)
	assert.False(t, result.hasPendingCookieDelivery())
}

func TestBrowserIntentRemainsUnboundUntilOwningRefreshPublishes(t *testing.T) {
	const (
		chain       = "successor-browser-intent-chain"
		destination = "cluster\x00base"
	)

	latestRefreshByChain.Delete(refreshStateKey{chainID: chain})
	t.Cleanup(func() { latestRefreshByChain.Delete(refreshStateKey{chainID: chain}) })

	completed := &tokenRefreshResult{
		chainID:     chain,
		generation:  refreshGeneration.Add(1),
		sourceToken: "A",
	}
	recordLatestRefreshResult(chain, completed)

	committed := &cookieDeliveryState{}
	committed.committedGeneration.Store(completed.generation)
	latestCookieDelivery.Store(cookieDeliveryKey(chain, destination), committed)
	t.Cleanup(func() { latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination)) })

	recordPendingCookieDelivery(chain, destination, "B")
	key := pendingCookieIntentKey{destination: destination, ownerToken: "B"}
	value, pending := completed.pendingCookieDestinations().Load(key)
	require.True(t, pending)
	assert.Zero(t, value.(pendingCookieIntent).generation)
	completed.completeCookieDelivery(destination)
	_, pending = completed.pendingCookieDestinations().Load(key)
	require.True(t, pending)

	successor := &tokenRefreshResult{
		chainID:     chain,
		generation:  refreshGeneration.Add(1),
		sourceToken: "B",
	}
	recordLatestRefreshResult(chain, successor)

	value, pending = completed.pendingCookieDestinations().Load(key)
	require.True(t, pending)
	assert.Equal(t, successor.generation, value.(pendingCookieIntent).generation)
	assert.True(t, successor.hasPendingCookieDelivery())
}

func TestCanceledStaleBrowserIntentIsRemoved(t *testing.T) {
	const (
		chain       = "stale-canceled-browser-intent-chain"
		destination = "cluster\x00base"
	)

	latestRefreshByChain.Delete(refreshStateKey{chainID: chain})
	t.Cleanup(func() {
		latestRefreshByChain.Delete(refreshStateKey{chainID: chain})
	})

	current := &tokenRefreshResult{
		chainID:     chain,
		generation:  refreshGeneration.Add(1),
		sourceToken: "B",
	}
	recordLatestRefreshResult(chain, current)
	recordPendingCookieDelivery(chain, destination, "A")

	abandonPendingCookieIntent(chain, destination, "A", nil)

	_, pending := current.pendingCookieDestinations().Load(
		pendingCookieIntentKey{destination: destination, ownerToken: "A"},
	)
	assert.False(t, pending)
	assert.False(t, current.hasPendingCookieDelivery())
}

func TestRefreshFlightKeyScopesCacheAndOIDCConfiguration(t *testing.T) {
	firstCache := cache.New[interface{}]()
	secondCache := cache.New[interface{}]()

	t.Cleanup(func() {
		require.NoError(t, firstCache.Close())
		require.NoError(t, secondCache.Close())
	})

	base := refreshFlightKey(firstCache, "client", "secret", "id_token", "OLD", "issuer-a")
	assert.Equal(
		t,
		base,
		refreshFlightKey(firstCache, "client", "secret", "id_token", "OLD", "issuer-a"),
	)
	assert.NotEqual(
		t,
		base,
		refreshFlightKey(secondCache, "client", "secret", "id_token", "OLD", "issuer-a"),
	)
	assert.NotEqual(
		t,
		base,
		refreshFlightKey(firstCache, "client-b", "secret", "id_token", "OLD", "issuer-a"),
	)
	assert.NotEqual(
		t,
		base,
		refreshFlightKey(firstCache, "client", "secret", "id_token", "OLD", "issuer-b"),
	)
}

func TestLatestRefreshAndCookieClaimsAreScopedByCache(t *testing.T) {
	const (
		chain       = "shared-chain-two-caches"
		destination = "cluster\x00base"
	)

	firstCache := cache.New[interface{}]()
	secondCache := cache.New[interface{}]()

	t.Cleanup(func() {
		_ = firstCache.Close()
		_ = secondCache.Close()
	})

	first := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "first"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
		cacheScope:   cacheScopeOf(firstCache),
	}
	second := &tokenRefreshResult{
		token:        &oauth2.Token{AccessToken: "second"},
		cookieClaims: &sync.Map{},
		chainID:      chain,
		generation:   refreshGeneration.Add(1),
		cacheScope:   cacheScopeOf(secondCache),
	}
	recordLatestRefreshResult(chain, first)
	recordLatestRefreshResult(chain, second)
	t.Cleanup(func() {
		latestRefreshByChain.Delete(refreshStateKey{chainID: chain, cacheScope: first.cacheScope})
		latestRefreshByChain.Delete(refreshStateKey{chainID: chain, cacheScope: second.cacheScope})
		latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination, first.cacheScope))
		latestCookieDelivery.Delete(cookieDeliveryKey(chain, destination, second.cacheScope))
	})

	assert.Same(t, first, latestRefreshResult(chain, first.cacheScope))
	assert.Same(t, second, latestRefreshResult(chain, second.cacheScope))

	firstDelivery, firstClaimed := first.claimCookieWrite(context.Background(), destination)
	secondDelivery, secondClaimed := second.claimCookieWrite(context.Background(), destination)

	require.True(t, firstClaimed)
	require.True(t, secondClaimed)
	assert.NotSame(t, firstDelivery.state, secondDelivery.state)
}

func TestRecoveryRetirementSpansIntermediateRotations(t *testing.T) {
	const (
		chain       = "multi-rotation-recovery-chain"
		destination = "cluster\x00base"
	)

	latestRefreshByChain.Delete(refreshStateKey{chainID: chain})
	t.Cleanup(func() { latestRefreshByChain.Delete(refreshStateKey{chainID: chain}) })

	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, tokenCache.Close()) })

	recordPendingCookieDelivery(chain, destination, "A")

	for _, token := range []string{"A", "B", "C"} {
		result := &tokenRefreshResult{
			token:       &oauth2.Token{AccessToken: "ACCESS_" + token},
			chainID:     chain,
			generation:  refreshGeneration.Add(1),
			sourceToken: token,
		}
		recordLatestRefreshResult(chain, result)
		cacheRecoveryOutcome(context.Background(), tokenCache, token, result, time.Hour)
	}

	latest := latestRefreshResult(chain)
	require.NotNil(t, latest)
	latest.completeCookieDelivery(destination)
	latest.retireRecovery(tokenCache, recoveryTokenKeyPrefix+"A")

	for _, token := range []string{"A", "B", "C"} {
		key := recoveryTokenKeyPrefix + token
		_, retired := latest.recoveryRetirementKeys().Load(key)
		assert.Truef(t, retired, "recovery alias %s was not retired", key)
	}
}

func TestHeaderOnlyRecoveryIsRetiredInsideSharedOperation(t *testing.T) {
	const (
		chain    = "header-only-shared-retirement-chain"
		oldValue = "HEADER_ONLY_SHARED"
	)

	latestRefreshByChain.Delete(refreshStateKey{chainID: chain})
	t.Cleanup(func() { latestRefreshByChain.Delete(refreshStateKey{chainID: chain}) })

	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, tokenCache.Close()) })

	result := &tokenRefreshResult{
		token:       &oauth2.Token{AccessToken: "access"},
		chainID:     chain,
		generation:  refreshGeneration.Add(1),
		sourceToken: oldValue,
	}
	recordLatestRefreshResult(chain, result)
	cacheRecoveryOutcome(context.Background(), tokenCache, oldValue, result, time.Hour)

	_, retired := result.recoveryRetirementKeys().Load(recoveryTokenKeyPrefix + oldValue)
	assert.True(t, retired)
	assert.False(t, result.hasPendingCookieDelivery())
}

//nolint:funlen // Coordinates retirement, restoration, and cache assertions.
func TestRecoveryRestoreSerializesWithRetirement(t *testing.T) {
	const (
		chain       = "recovery-retirement-serialization-chain"
		source      = "SERIALIZED_RECOVERY"
		destination = "cluster\x00base"
	)

	latestRefreshByChain.Delete(refreshStateKey{chainID: chain})
	t.Cleanup(func() { latestRefreshByChain.Delete(refreshStateKey{chainID: chain}) })

	baseCache := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, baseCache.Close()) })

	key := recoveryTokenKeyPrefix + source
	require.NoError(t, baseCache.Set(context.Background(), key, "initial"))

	blockedCache := &blockingUpdateTTLCache{
		Cache:   baseCache,
		entered: make(chan struct{}),
		release: make(chan struct{}),
	}
	result := &tokenRefreshResult{
		chainID:     chain,
		generation:  refreshGeneration.Add(1),
		sourceToken: source,
	}
	recordLatestRefreshResult(chain, result)
	result.sharedRecoveryAliasKeys().Store(key, struct{}{})

	retired := make(chan struct{})

	go func() {
		result.retireRecovery(blockedCache, key)
		close(retired)
	}()

	<-blockedCache.entered

	restored := make(chan struct{})

	go func() {
		recordPendingCookieDelivery(
			chain,
			destination,
			source,
			cacheScopeOf(blockedCache),
		)
		restorePendingCookieRecovery(
			RefreshAndSetTokenParams{
				Ctx:        context.Background(),
				Cache:      blockedCache,
				SessionTTL: int(time.Hour.Seconds()),
			},
			result,
			key,
			destination,
		)
		close(restored)
	}()

	close(blockedCache.release)
	<-retired
	<-restored

	cached, err := baseCache.Get(context.Background(), key)
	require.NoError(t, err)
	assert.Same(t, result, cached)
	_, stillRetired := result.recoveryRetirementKeys().Load(key)
	assert.False(t, stillRetired)
	assert.True(t, result.hasPendingCookieDelivery())
}

func TestRetiringMissingAliasDoesNotScheduleTracking(t *testing.T) {
	const chain = "missing-recovery-alias-chain"

	result := &tokenRefreshResult{
		chainID:     chain,
		generation:  refreshGeneration.Add(1),
		sourceToken: "MISSING_RECOVERY",
	}
	recordLatestRefreshResult(chain, result)
	t.Cleanup(func() { latestRefreshByChain.Delete(refreshStateKey{chainID: chain}) })

	key := recoveryTokenKeyPrefix + result.sourceToken
	result.sharedRecoveryAliasKeys().Store(key, struct{}{})

	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, tokenCache.Close()) })
	result.retireRecovery(tokenCache, key)

	_, tracked := result.recoveryRetirementKeys().Load(key)
	_, retained := result.sharedRecoveryAliasKeys().Load(key)

	assert.False(t, tracked)
	assert.False(t, retained)
}

func TestFailedUntrackedRefreshLeavesNoProcessState(t *testing.T) {
	const chain = "FAILED_UNTRACKED_REFRESH"

	latestRefreshByChain.Delete(refreshStateKey{chainID: chain})
	recordPendingCookieDelivery(chain, "cluster\x00base", chain)
	stateValue, loaded := latestRefreshByChain.Load(refreshStateKey{chainID: chain})
	require.True(t, loaded)
	require.NotNil(t, stateValue.(*latestRefreshState).cleanupTimer.Load())

	abandonFailedPendingCookieDelivery(chain, nil)

	_, loaded = latestRefreshByChain.Load(refreshStateKey{chainID: chain})
	assert.False(t, loaded)
	assert.Nil(t, stateValue.(*latestRefreshState).cleanupTimer.Load())

	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, tokenCache.Close()) })

	resolvedChain, trusted := pendingCookieRefreshChain(
		context.Background(),
		tokenCache,
		"id_token",
		chain,
	)
	assert.Equal(t, chain, resolvedChain)
	assert.False(t, trusted)
}

func TestRefreshAndCacheNewTokenRecoversLatestUndeliveredOutcome(t *testing.T) {
	const oldToken = "OLD_RECOVERY"

	validIDToken := makeJWTWithPayloadForInternalTest(t, time.Now().Add(time.Hour))
	refreshed := (&oauth2.Token{
		AccessToken:  "ACCESS_RECOVERED",
		RefreshToken: "REFRESH_RECOVERED",
		Expiry:       time.Now().Add(time.Hour),
	}).WithExtra(map[string]interface{}{"id_token": validIDToken})
	result := &tokenRefreshResult{
		token:        refreshed,
		cookieClaims: &sync.Map{},
		chainID:      oldToken,
		generation:   refreshGeneration.Add(1),
	}

	discoveryCalled := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		discoveryCalled = true

		http.Error(w, "discovery should not run", http.StatusInternalServerError)
	}))
	t.Cleanup(server.Close)

	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { _ = tokenCache.Close() })
	require.NoError(t, tokenCache.SetWithTTL(
		context.Background(),
		recoveryTokenKeyPrefix+oldToken,
		result,
		time.Hour,
	))

	recovered, err := refreshAndCacheNewToken(
		context.Background(),
		&kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"},
		tokenCache,
		"id_token",
		oldToken,
		server.URL,
		"",
		time.Hour,
	)
	require.NoError(t, err)
	assert.Same(t, result, recovered)
	assert.False(t, discoveryCalled)
}

//nolint:funlen // Covers cache-scoped expired recovery and discovery bypass.
func TestRefreshAndCacheNewTokenUsesNewerChainResultForExpiredRecovery(t *testing.T) {
	const oldToken = "OLD_RECOVERY_NEWER"

	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { _ = tokenCache.Close() })

	expired := (&oauth2.Token{
		AccessToken: "ACCESS_EXPIRED",
		Expiry:      time.Now().Add(-time.Minute),
	}).WithExtra(map[string]interface{}{"id_token": "ID_EXPIRED"})
	recovery := &tokenRefreshResult{
		token:        expired,
		cookieClaims: &sync.Map{},
		chainID:      oldToken,
		generation:   refreshGeneration.Add(1),
		cacheScope:   cacheScopeOf(tokenCache),
	}
	latest := &tokenRefreshResult{
		token: &oauth2.Token{
			AccessToken: "ACCESS_CURRENT",
			Expiry:      time.Now().Add(time.Hour),
		},
		cookieClaims: &sync.Map{},
		chainID:      oldToken,
		generation:   refreshGeneration.Add(1),
		cacheScope:   cacheScopeOf(tokenCache),
	}
	recordLatestRefreshResult(oldToken, latest)
	t.Cleanup(func() {
		latestRefreshByChain.Delete(refreshStateKey{
			chainID:    oldToken,
			cacheScope: cacheScopeOf(tokenCache),
		})
	})
	require.NoError(t, tokenCache.SetWithTTL(
		context.Background(),
		recoveryTokenKeyPrefix+oldToken,
		recovery,
		time.Hour,
	))

	discoveryCalled := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		discoveryCalled = true

		http.Error(w, "discovery should not run", http.StatusInternalServerError)
	}))
	t.Cleanup(server.Close)

	recovered, err := refreshAndCacheNewToken(
		context.Background(),
		&kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"},
		tokenCache,
		"access_token",
		oldToken,
		server.URL,
		"",
		time.Hour,
	)
	require.NoError(t, err)
	assert.Same(t, latest, recovered)
	assert.False(t, discoveryCalled)
}

func makeJWTWithPayloadForInternalTest(t *testing.T, expiry time.Time) string {
	t.Helper()

	payload := base64.RawURLEncoding.EncodeToString(
		[]byte(fmt.Sprintf(`{"exp":%d}`, expiry.Unix())),
	)

	return "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0." + payload + "."
}

func requirePrepareCookies(t *testing.T, writer *refreshResponseWriter) {
	t.Helper()

	if !writer.prepareCookies() {
		t.Fatal("could not acquire cookie claim")
	}
}

func assertCookieHeader(t *testing.T, values []string, expected string) {
	t.Helper()

	for _, value := range values {
		if strings.HasPrefix(value, expected) {
			return
		}
	}

	t.Fatalf("cookie %q missing from %q", expected, values)
}

type hijackResponseWriter struct {
	*httptest.ResponseRecorder
	hijack func() (net.Conn, *bufio.ReadWriter, error)
}

func (w *hijackResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return w.hijack()
}

type failingWriteConn struct {
	net.Conn
}

func (c *failingWriteConn) Write(_ []byte) (int, error) {
	return 0, errors.New("injected hijack flush failure")
}

type discardConn struct{}

func (*discardConn) Read([]byte) (int, error)          { return 0, io.EOF }
func (*discardConn) Write(payload []byte) (int, error) { return len(payload), nil }
func (*discardConn) Close() error                      { return nil }
func (*discardConn) LocalAddr() net.Addr               { return nil }
func (*discardConn) RemoteAddr() net.Addr              { return nil }
func (*discardConn) SetDeadline(time.Time) error       { return nil }
func (*discardConn) SetReadDeadline(time.Time) error   { return nil }
func (*discardConn) SetWriteDeadline(time.Time) error  { return nil }

type deadlineRecordingConn struct {
	net.Conn
	writeDeadline time.Time
}

type blockingUpdateTTLCache struct {
	cache.Cache[interface{}]
	entered chan struct{}
	release chan struct{}
	once    sync.Once
}

func (c *blockingUpdateTTLCache) UpdateTTL(ctx context.Context, key string, ttl time.Duration) error {
	c.once.Do(func() { close(c.entered) })
	<-c.release

	return c.Cache.UpdateTTL(ctx, key, ttl)
}

func (c *deadlineRecordingConn) SetWriteDeadline(deadline time.Time) error {
	c.writeDeadline = deadline

	return c.Conn.SetWriteDeadline(deadline)
}

type flushErrorResponseWriter struct {
	*httptest.ResponseRecorder
}

func (w *flushErrorResponseWriter) FlushError() error {
	return errors.New("flush failed")
}

type flushTrackingResponseWriter struct {
	*httptest.ResponseRecorder
	flushed bool
}

func (w *flushTrackingResponseWriter) FlushError() error {
	w.flushed = true

	return nil
}

type blockedFlushResponseWriter struct {
	*httptest.ResponseRecorder
	deadlineMu sync.Mutex
	deadline   time.Time
	started    chan struct{}
	once       sync.Once
}

type unsupportedFlushResponseWriter struct {
	header   http.Header
	status   int
	body     bytes.Buffer
	deadline time.Time
}

type recordingHeaderResponseWriter struct {
	*httptest.ResponseRecorder
	customHeader     http.Header
	writeHeaderCalls int
}

func (w *recordingHeaderResponseWriter) Header() http.Header {
	if w.customHeader != nil {
		return w.customHeader
	}

	return w.ResponseRecorder.Header()
}

func (w *recordingHeaderResponseWriter) WriteHeader(statusCode int) {
	w.writeHeaderCalls++
	w.ResponseRecorder.WriteHeader(statusCode)
}

func (w *unsupportedFlushResponseWriter) Header() http.Header {
	return w.header
}

func (w *unsupportedFlushResponseWriter) WriteHeader(statusCode int) {
	w.status = statusCode
}

func (w *unsupportedFlushResponseWriter) Write(payload []byte) (int, error) {
	if !w.deadline.IsZero() {
		return 0, errors.New("cookie deadline remained set during body write")
	}

	return w.body.Write(payload)
}

func (w *unsupportedFlushResponseWriter) SetWriteDeadline(deadline time.Time) error {
	w.deadline = deadline

	return nil
}

func (w *blockedFlushResponseWriter) SetWriteDeadline(deadline time.Time) error {
	w.deadlineMu.Lock()
	w.deadline = deadline
	w.deadlineMu.Unlock()

	return nil
}

func (w *blockedFlushResponseWriter) FlushError() error {
	w.once.Do(func() {
		close(w.started)
	})

	for {
		w.deadlineMu.Lock()
		deadline := w.deadline
		w.deadlineMu.Unlock()

		if !deadline.IsZero() && time.Now().After(deadline) {
			return errors.New("write deadline exceeded")
		}

		time.Sleep(time.Millisecond)
	}
}

func requireEventually(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}

		time.Sleep(time.Millisecond)
	}

	t.Fatal("condition was not met before timeout")
}
