package spa

import (
	"mime"
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
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// Reject backslashes: HTTP paths must use forward slashes only, and a
	// backslash in the URL could be used for traversal on Windows where
	// filepath treats it as a separator.
	if strings.ContainsRune(r.URL.Path, '\\') {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	// Strip the base URL prefix, then strip leading slashes so the remainder
	// is a relative path. filepath.Join silently drops its first argument when
	// the second is absolute, so leaving a leading "/" would resolve the path
	// against the filesystem root instead of absStaticPath.
	urlPath := strings.TrimPrefix(r.URL.Path, h.baseURL)
	urlPath = strings.TrimLeft(urlPath, "/")

	// A request for the bare base URL (e.g. "/headlamp" with no trailing
	// slash) produces an empty urlPath. Map it to the index directly so
	// http.ServeFile doesn't issue a 301 redirect to add the trailing slash.
	if urlPath == "" {
		urlPath = h.indexPath
	}

	// Resolve the full path inside the static root.
	// filepath.FromSlash converts URL forward slashes to the OS separator so
	// the result is correct on both Unix and Windows.
	absPath := filepath.Join(absStaticPath, filepath.FromSlash(urlPath))

	// Use filepath.Rel for containment validation instead of strings.HasPrefix.
	// HasPrefix is bypassable when the static dir and a sibling share a prefix
	// (e.g. "/static" is a prefix of "/static2/evil"), whereas Rel returns ".."
	// components for any path that escapes the base.
	//
	// Check rel == ".." OR rel starts with "../" (OS-specific separator) rather
	// than a bare HasPrefix("..", rel) to avoid false positives on directory
	// names that legitimately begin with ".." (e.g. "...").
	rel, relErr := filepath.Rel(absStaticPath, absPath)
	sep := string(filepath.Separator)

	if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+sep) {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	// check whether a file exists at the given path
	_, err = os.Stat(absPath) //nolint:gosec // path validated by filepath.Rel above
	if os.IsNotExist(err) {
		// file does not exist, serve index.html
		h.serveStatic(w, r, filepath.Join(absStaticPath, h.indexPath))
		return
	} else if err != nil {
		// if we got an error (that wasn't that the file doesn't exist) stating the
		// file, return a 500 internal server error and stop
		logger.Log(logger.LevelError, nil, err, "stating file")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// The file does exist, so we serve that.
	h.serveStatic(w, r, absPath)
}

// serveStatic serves a static file, transparently swapping in a precompressed
// `.br` sidecar when the client advertises support and the sidecar
// exists on disk. The Content-Type is always derived from the original
// filename so the encoding handshake is invisible to the client.
func (h spaHandler) serveStatic(w http.ResponseWriter, r *http.Request, path string) {
	// `Vary: Accept-Encoding` must be set on every response from this
	// handler so caches keep per-encoding entries even when we end up
	// serving the identity representation.
	setEncodingHeaders(w, "")

	if encoding := pickEncoding(r.Header.Get("Accept-Encoding")); encoding != "" {
		// Skip the precompressed sidecar for the index document. headlamp.go
		// rewrites index.html at startup for baseURL substitution, so any
		// build-time .br sidecar would contain stale unrewritten bytes.
		isIndex := filepath.Base(path) == filepath.Base(h.indexPath)
		sidecar := path + encodingExt(encoding)

		if !isIndex {
			if info, err := os.Stat(sidecar); err == nil && !info.IsDir() { //nolint:gosec
				ctype := mime.TypeByExtension(filepath.Ext(path))
				if ctype == "" {
					// Extension not in MIME tables; sniff from the uncompressed file
					// so ServeFile doesn't guess from the .br bytes.
					if orig, err := os.ReadFile(path); err == nil { //nolint:gosec
						ctype = http.DetectContentType(orig)
					}
				}

				if ctype != "" {
					w.Header().Set("Content-Type", ctype)
				}

				setEncodingHeaders(w, encoding)
				http.ServeFile(w, r, sidecar)

				return
			}
		}
	}

	http.ServeFile(w, r, path)
}

// NewHandler creates a new handler.
func NewHandler(staticPath, indexPath, baseURL string) *spaHandler {
	return &spaHandler{
		staticPath: staticPath,
		indexPath:  indexPath,
		baseURL:    baseURL,
	}
}
