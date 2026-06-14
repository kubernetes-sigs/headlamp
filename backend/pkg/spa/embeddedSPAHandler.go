package spa

import (
	"bytes"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"path/filepath"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
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
	rPath := strings.TrimPrefix(r.URL.Path, h.baseURL)
	// Strip the leading "/" so path.Join keeps "static" as the root.
	// embed.FS paths are always forward-slash-separated, so use path.Join,
	// not filepath.Join (which emits OS separators on Windows).
	rPath = strings.TrimLeft(rPath, "/")

	// Reject backslashes — HTTP paths must use '/', and '\' is a Windows
	// path separator that could be used for traversal.
	if strings.ContainsRune(rPath, '\\') {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	// Normalise and reject any path that would escape the embedded root.
	// path.Join cleans ".." segments, but the cleaned result can start with
	// ".." when there are more ".." components than path components, which
	// would escape the "static/" prefix we prepend below.
	cleaned := path.Clean(rPath)
	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	rPath = cleaned

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

	// if we're serving the index.html file and have a baseURL, replace the headlampBaseUrl with the baseURL
	if h.baseURL != "" && isServingIndex {
		// Replace the __baseUrl__ assignment to use the baseURL instead of './'
		oldPattern := "__baseUrl__ = './<%= BASE_URL %>'.replace('%BASE_' + 'URL%', '').replace('<' + '%= BASE_URL %>', '');"
		newPattern := "__baseUrl__ = '" + h.baseURL + "';"
		content = bytes.ReplaceAll(content, []byte(oldPattern), []byte(newPattern))
		// Replace any remaining './' patterns in the content
		content = bytes.ReplaceAll(content, []byte("'./'"), []byte(h.baseURL+"/"))
		// Replace url( patterns for CSS
		content = bytes.ReplaceAll(content, []byte("url("), []byte("url("+h.baseURL+"/"))
	}

	// Set the correct Content-Type header. When we fell back to serving the
	// index file, use the index path's extension (always .html), not the
	// originally-requested path (which could be .css, .js, etc.).
	contentPath := fullPath
	if isServingIndex {
		contentPath = filepath.Join("static", h.indexPath)
	}

	ext := filepath.Ext(contentPath)

	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		contentType = http.DetectContentType(content)
	}

	w.Header().Set("Content-Type", contentType)

	_, err = w.Write(content) //nolint:gosec
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing content")
	}
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

	ctype := mime.TypeByExtension(filepath.Ext(fullPath))
	if ctype == "" {
		// Fall back to sniffing the *original* (unencoded) file's
		// bytes for content-type detection so we don't accidentally
		// label everything `application/octet-stream`.
		if orig, oerr := h.serveFile(fullPath); oerr == nil {
			ctype = http.DetectContentType(orig)
		}
	}

	if ctype != "" {
		w.Header().Set("Content-Type", ctype)
	}

	setEncodingHeaders(w, encoding)

	if _, werr := w.Write(data); werr != nil {
		logger.Log(logger.LevelError, nil, werr, "writing content")
	}

	return true
}

func (h embeddedSpaHandler) serveFile(path string) ([]byte, error) {
	f, err := h.staticFS.Open(path)
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
