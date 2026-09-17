package spa

import (
	"bytes"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestDetectContentTypeUsesExtensionWithoutOpening(t *testing.T) {
	tests := []struct {
		name       string
		path       string
		wantSubstr string
	}{
		{name: "html", path: "index.html", wantSubstr: "html"},
		{name: "css", path: "styles/app.css", wantSubstr: "css"},
		{name: "js", path: "assets/main.js", wantSubstr: "javascript"},
		{name: "png", path: "logo.png", wantSubstr: "image/png"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			open := func() (io.ReadCloser, error) {
				t.Fatal("open should not be called when the extension is recognized")

				return nil, nil
			}

			got := detectContentType(tc.path, open)
			if !strings.Contains(got, tc.wantSubstr) {
				t.Fatalf("detectContentType(%q) = %q, want it to contain %q", tc.path, got, tc.wantSubstr)
			}
		})
	}
}

func TestDetectContentTypeSniffsWhenExtensionIsUnknown(t *testing.T) {
	// PNG magic bytes, so http.DetectContentType recognizes it without
	// relying on the (unrecognized) file extension.
	pngSignature := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}

	open := func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(pngSignature)), nil
	}

	got := detectContentType("no-extension-asset", open)
	if !strings.Contains(got, "image/png") {
		t.Fatalf("detectContentType() = %q, want it to contain %q", got, "image/png")
	}
}

func TestDetectContentTypeReturnsEmptyWhenOpenFails(t *testing.T) {
	open := func() (io.ReadCloser, error) {
		return nil, errors.New("boom")
	}

	got := detectContentType("no-extension-asset", open)
	if got != "" {
		t.Fatalf("detectContentType() = %q, want empty string on open failure", got)
	}
}

func TestDetectContentTypeSniffsEmptyFile(t *testing.T) {
	open := func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(nil)), nil
	}

	// http.DetectContentType always returns a valid MIME type, even for no
	// data, so we assert the value it falls back to rather than treating an
	// empty file as an error.
	got := detectContentType("no-extension-asset", open)
	if !strings.Contains(got, "text/plain") {
		t.Fatalf("detectContentType() = %q, want it to contain %q", got, "text/plain")
	}
}
