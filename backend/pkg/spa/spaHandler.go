package spa

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

type spaHandler struct {
	// staticPath is the path to the static files.
	staticPath string
	// indexPath is the path to the index.html file.
	indexPath string
	// baseURL is the base URL of the application.
	baseURL string
}

func (h spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	absStaticPath, err := filepath.Abs(h.staticPath)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting absolute static path")
		http.Error(w, "Internal server error", http.StatusInternalServerError)

		return
	}

	// Strip the base URL prefix before converting to a safe relative path.
	urlPath := strings.TrimPrefix(r.URL.Path, h.baseURL)

	rel, ok := urlToRel(urlPath)
	if !ok {
		// urlToRel rejects backslashes: HTTP paths must use forward slashes
		// only, and a backslash could be used for traversal on Windows.
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	// A request for the bare base URL (e.g. "/headlamp" with no trailing
	// slash) produces an empty or "." rel after cleaning. Map it to the index
	// directly so http.ServeContent doesn't try to serve the root directory.
	indexRel := filepath.FromSlash(h.indexPath)
	if rel == "" || rel == "." {
		rel = indexRel
	}

	// Open a root-scoped handle for the static directory. All file access goes
	// through this root so the OS enforces the containment boundary.
	root, err := os.OpenRoot(absStaticPath)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "opening static root")
		http.Error(w, "Internal server error", http.StatusInternalServerError)

		return
	}
	defer func() { _ = root.Close() }()

	// Check whether the requested file exists inside the root.
	_, statErr := root.Stat(rel)
	if os.IsNotExist(statErr) {
		// File does not exist — serve index.html as the SPA entry point.
		h.serveStatic(w, r, root, indexRel)
		return
	} else if statErr != nil {
		if strings.Contains(statErr.Error(), "escapes from parent") {
			http.Error(w, "Invalid file path", http.StatusBadRequest)
			return
		}

		logger.Log(logger.LevelError, nil, statErr, "stating file")
		http.Error(w, "Internal server error", http.StatusInternalServerError)

		return
	}

	h.serveStatic(w, r, root, rel)
}

// serveStatic serves a static file through root, transparently swapping in a
// precompressed `.br` sidecar when the client advertises support and the
// sidecar exists. The Content-Type is always derived from the original
// filename so the encoding handshake is invisible to the client.
func (h spaHandler) serveStatic(w http.ResponseWriter, r *http.Request, root *os.Root, rel string) {
	// `Vary: Accept-Encoding` must be set on every response so caches keep
	// per-encoding entries even when we end up serving the identity bytes.
	setEncodingHeaders(w, "")

	if h.tryServeSidecar(w, r, root, rel) {
		return
	}

	// Identity fallback: serve the file directly from the root.
	file, err := root.Open(rel)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	defer func() { _ = file.Close() }()

	fi, err := file.Stat()
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if fi.IsDir() {
		h.serveStatic(w, r, root, filepath.FromSlash(h.indexPath))
		return
	}

	http.ServeContent(w, r, rel, fi.ModTime(), file)
}

func (h spaHandler) tryServeSidecar(w http.ResponseWriter, r *http.Request, root *os.Root, rel string) bool {
	encoding := pickEncoding(r.Header.Get("Accept-Encoding"))
	if encoding == "" {
		return false
	}

	// Skip the precompressed sidecar for the index document. headlamp.go
	// rewrites index.html at startup for baseURL substitution, so any
	// build-time .br sidecar would contain stale unrewritten bytes.
	isIndex := filepath.Base(rel) == filepath.Base(filepath.FromSlash(h.indexPath))
	if isIndex {
		return false
	}

	sidecarRel := rel + encodingExt(encoding)

	info, err := root.Stat(sidecarRel)
	if err != nil || info.IsDir() {
		return false
	}

	origInfo, err := root.Stat(rel)
	if err != nil || origInfo.IsDir() {
		return false
	}

	ctype := detectContentType(rel, func() (io.ReadCloser, error) {
		return root.Open(rel)
	})

	file, err := root.Open(sidecarRel)
	if err != nil {
		return false
	}
	defer func() { _ = file.Close() }()

	fi, err := file.Stat()
	if err != nil {
		return false
	}

	if ctype != "" {
		w.Header().Set("Content-Type", ctype)
	}

	setEncodingHeaders(w, encoding)
	http.ServeContent(w, r, sidecarRel, fi.ModTime(), file)

	return true
}

// NewHandler creates a new handler.
func NewHandler(staticPath, indexPath, baseURL string) *spaHandler {
	return &spaHandler{
		staticPath: staticPath,
		indexPath:  indexPath,
		baseURL:    baseURL,
	}
}
