package kubeconfig_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/hpack"
)

type replayTransportFunc func(*http.Request) (*http.Response, error)

func (f replayTransportFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestProxyRequestBodyReplay(t *testing.T) {
	for _, tc := range []struct {
		name          string
		body          string
		contentLength int64
		replayable    bool
	}{
		{"authorization review", `{"spec":{"namespace":"default"}}`, 32, true},
		{"large upload", strings.Repeat("a", 1<<20+1), 1<<20 + 1, false},
		{"unknown length", "streamed request", -1, false},
		{"underreported length", strings.Repeat("a", 1<<20+2), 1, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, "https://cluster/api", nil)
			require.NoError(t, err)

			req.Body = io.NopCloser(strings.NewReader(tc.body))
			req.ContentLength = tc.contentLength
			req.Header.Set("Authorization", "Bearer test-token")

			transport := &kubeconfig.UserAgentRoundTripper{
				Base: replayTransportFunc(func(forwarded *http.Request) (*http.Response, error) {
					body, err := io.ReadAll(forwarded.Body)
					require.NoError(t, err)
					require.NoError(t, forwarded.Body.Close())
					assert.Equal(t, tc.body, string(body))
					assert.Equal(t, req.Header.Get("Authorization"), forwarded.Header.Get("Authorization"))

					if tc.replayable {
						require.NotNil(t, forwarded.GetBody)

						for range 2 {
							replay, err := forwarded.GetBody()
							require.NoError(t, err)
							body, err := io.ReadAll(replay)
							require.NoError(t, err)
							require.NoError(t, replay.Close())
							assert.Equal(t, tc.body, string(body))
						}
					} else {
						assert.Nil(t, forwarded.GetBody)
					}

					return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody}, nil
				}),
				UserAgent: "headlamp-test",
			}
			response, err := transport.RoundTrip(req)
			require.NoError(t, err)
			require.NoError(t, response.Body.Close())
			assert.Equal(t, http.StatusOK, response.StatusCode)
			assert.Nil(t, req.GetBody)
		})
	}
}

type failedRequestBody struct {
	closed bool
}

func (b *failedRequestBody) Read([]byte) (int, error) {
	return 0, io.ErrUnexpectedEOF
}

func (b *failedRequestBody) Close() error {
	b.closed = true
	return nil
}

func TestProxyRequestBodyReadFailure(t *testing.T) {
	body := &failedRequestBody{}
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, "https://cluster/api", nil)
	require.NoError(t, err)

	req.Body = body
	req.ContentLength = 1
	transport := &kubeconfig.UserAgentRoundTripper{
		Base: replayTransportFunc(func(*http.Request) (*http.Response, error) {
			t.Error("failed body must not reach the upstream transport")
			return nil, errors.New("unexpected upstream request")
		}),
	}

	response, err := transport.RoundTrip(req)
	if response != nil {
		require.NoError(t, response.Body.Close())
	}

	require.ErrorIs(t, err, io.ErrUnexpectedEOF)
	assert.True(t, body.closed)
}

func TestProxyRetriesHTTP2GoAway(t *testing.T) {
	listener, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	require.NoError(t, err)

	defer func() { _ = listener.Close() }()

	results := make(chan error, 2)

	go func() {
		for attempt := range 2 {
			conn, err := listener.Accept()
			if err != nil {
				results <- err
				return
			}

			results <- serveReplayAttempt(conn, attempt == 0)
		}
	}()

	base := &http.Transport{Protocols: new(http.Protocols)}

	base.Protocols.SetUnencryptedHTTP2(true)
	defer base.CloseIdleConnections()

	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	body := `{"spec":{"namespace":"default"}}`
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+listener.Addr().String(), nil)
	require.NoError(t, err)

	req.Body = io.NopCloser(strings.NewReader(body))
	req.ContentLength = int64(len(body))
	transport := &kubeconfig.UserAgentRoundTripper{Base: base, UserAgent: "headlamp-test"}
	response, err := transport.RoundTrip(req)
	require.NoError(t, err)

	defer func() { _ = response.Body.Close() }()

	got, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, response.StatusCode)
	assert.Equal(t, body, string(got))
	require.NoError(t, <-results)
	require.NoError(t, <-results)
}

func serveReplayAttempt(conn net.Conn, reject bool) error {
	defer func() { _ = conn.Close() }()

	if err := conn.SetDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return err
	}

	if _, err := io.ReadFull(conn, make([]byte, len(http2.ClientPreface))); err != nil {
		return err
	}

	framer := http2.NewFramer(conn, conn)
	if err := framer.WriteSettings(); err != nil {
		return err
	}

	var body []byte

	for {
		frame, err := framer.ReadFrame()
		if err != nil {
			return err
		}

		data, ok := frame.(*http2.DataFrame)
		if !ok {
			continue
		}

		body = append(body, data.Data()...)
		if !data.StreamEnded() {
			continue
		}

		if reject {
			return framer.WriteGoAway(0, http2.ErrCodeNo, nil)
		}

		var header bytes.Buffer
		if err := hpack.NewEncoder(&header).WriteField(hpack.HeaderField{Name: ":status", Value: "200"}); err != nil {
			return err
		}

		if err := framer.WriteHeaders(http2.HeadersFrameParam{
			StreamID: data.StreamID, BlockFragment: header.Bytes(), EndHeaders: true,
		}); err != nil {
			return err
		}

		return framer.WriteData(data.StreamID, true, body)
	}
}
