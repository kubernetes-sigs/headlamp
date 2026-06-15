package spa

import (
	"bytes"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"
)

// embeddedSpaHandler serves the static files embedded in the binary.
type embeddedSpaHandler struct {
	// staticFS is the filesystem containing the static files.
	staticFS fs.FS
	// indexPath is the path to the index.html file.
	indexPath string
	// baseURL is the base URL of the application.
	baseURL string
}

// ServeHTTP serves the static files embedded in the binary.
func (h embeddedSpaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rPath, ok := sanitizeEmbeddedPath(strings.TrimPrefix(r.URL.Path, h.baseURL))
	if !ok {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	if rPath == "" || rPath == "." {
		rPath = h.indexPath
	}

	// Prepend "static" to the path as that's the root in our embed.FS
	fullPath := path.Join("static", rPath)

	// `Vary: Accept-Encoding` must be set on every response so caches keep
	// per-encoding entries even when we end up serving identity bytes.
	setEncodingHeaders(w, "")

	// Detect whether this request would resolve to the index.html so we
	// can decide up front whether the precompressed sidecar is safe to
	// use. We must skip the sidecar for the index document because the
	// `__baseUrl__` replacement below mutates the served bytes.
	isServingIndex := rPath == h.indexPath

	// Try to serve a precompressed sidecar (`.br`) when the client
	// supports it and the file isn't the index.html (which we rewrite
	// below).
	if !isServingIndex && h.tryServePrecompressed(w, r, fullPath) {
		return
	}

	content, err := h.serveFile(fullPath)
	if err != nil {
		// If there's any error, serve the index file.
		// Use path.Join (not filepath.Join) — embed.FS paths must use forward slashes.
		content, err = h.serveFile(path.Join("static", h.indexPath))
		if err != nil {
			http.Error(w, "Unable to read index file", http.StatusInternalServerError)
			return
		}

		isServingIndex = true
	}

	content = h.rewriteIndexContent(content, isServingIndex)

	// Set the correct Content-Type header. When we fell back to serving the
	// index file, use the index path's extension (always .html), not the
	// originally-requested path (which could be .css, .js, etc.).
	// Use path.Join (not filepath.Join) — embed.FS paths must use forward
	// slashes on all platforms, including Windows.
	contentPath := fullPath
	if isServingIndex {
		contentPath = path.Join("static", h.indexPath)
	}

	ctype := detectContentType(contentPath, func() (io.ReadCloser, error) {
		return h.staticFS.Open(contentPath)
	})
	if ctype != "" {
		w.Header().Set("Content-Type", ctype)
	}

	http.ServeContent(w, r, contentPath, time.Time{}, bytes.NewReader(content))
}

func sanitizeEmbeddedPath(rPath string) (string, bool) {
	// Strip the leading "/" so path.Join keeps "static" as the root.
	// embed.FS paths are always forward-slash-separated, so use path.Join,
	// not filepath.Join (which emits OS separators on Windows).
	rPath = strings.TrimLeft(rPath, "/")

	// Reject backslashes — HTTP paths must use '/', and '\\' is a Windows
	// path separator that could be used for traversal.
	if strings.ContainsRune(rPath, '\\') {
		return "", false
	}

	// Normalise and reject any path that would escape the embedded root.
	// path.Join cleans ".." segments, but the cleaned result can start with
	// ".." when there are more ".." components than path components, which
	// would escape the "static/" prefix we prepend below.
	rPath = path.Clean(rPath)

	if rPath == ".." || strings.HasPrefix(rPath, "../") {
		return "", false
	}

	return rPath, true
}

func (h embeddedSpaHandler) rewriteIndexContent(content []byte, isServingIndex bool) []byte {
	if h.baseURL == "" || !isServingIndex {
		return content
	}

	// Replace the __baseUrl__ assignment to use the baseURL instead of './'.
	oldPattern := "__baseUrl__ = './<%= BASE_URL %>'.replace('%BASE_' + 'URL%', '').replace('<' + '%= BASE_URL %>', '');"
	newPattern := "__baseUrl__ = '" + h.baseURL + "';"
	content = bytes.ReplaceAll(content, []byte(oldPattern), []byte(newPattern))

	// Replace any remaining './' patterns in the content.
	content = bytes.ReplaceAll(content, []byte("'./'"), []byte(h.baseURL+"/"))

	// Replace url( patterns for CSS.
	return bytes.ReplaceAll(content, []byte("url("), []byte("url("+h.baseURL+"/"))
}

// tryServePrecompressed attempts to serve a precompressed sidecar (e.g.
// `.br`) for fullPath when the client advertises support for it. It
// returns true when the response has been written and the caller should
// stop, or false when the caller should fall back to identity content.
func (h embeddedSpaHandler) tryServePrecompressed(
	w http.ResponseWriter, r *http.Request, fullPath string,
) bool {
	encoding := pickEncoding(r.Header.Get("Accept-Encoding"))
	if encoding == "" {
		return false
	}

	data, err := h.serveFile(fullPath + encodingExt(encoding))
	if err != nil {
		return false
	}

	ctype := detectContentType(fullPath, func() (io.ReadCloser, error) {
		return h.staticFS.Open(fullPath)
	})

	if ctype != "" {
		w.Header().Set("Content-Type", ctype)
	}

	setEncodingHeaders(w, encoding)
	sidecarPath := fullPath + encodingExt(encoding)
	http.ServeContent(w, r, sidecarPath, time.Time{}, bytes.NewReader(data))

	return true
}

func (h embeddedSpaHandler) serveFile(filePath string) ([]byte, error) {
	f, err := h.staticFS.Open(filePath)
	if err != nil {
		return nil, err
	}

	defer func() { _ = f.Close() }()

	stat, err := f.Stat()
	if err != nil {
		return nil, err
	}

	if stat.IsDir() {
		return nil, fs.ErrNotExist
	}

	return io.ReadAll(f)
}

func NewEmbeddedHandler(staticFS fs.FS, indexPath, baseURL string) *embeddedSpaHandler {
	return &embeddedSpaHandler{
		staticFS:  staticFS,
		indexPath: indexPath,
		baseURL:   baseURL,
	}
}
