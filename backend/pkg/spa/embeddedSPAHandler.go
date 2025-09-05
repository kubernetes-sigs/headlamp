package spa

import (
	"bytes"
	"io"
	"io/fs"
	"mime"
	"net/http"
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
	path := strings.TrimPrefix(r.URL.Path, h.baseURL)

	if path == "" || path == "/" {
		path = h.indexPath
	}

	// Prepend "static" to the path as that's the root in our embed.FS
	fullPath := filepath.Join("static", path)

	content, err := h.serveFile(fullPath)
	if err != nil {
		// If there's any error, serve the index file
		content, err = h.serveFile(filepath.Join("static", h.indexPath))
		if err != nil {
			http.Error(w, "Unable to read index file", http.StatusInternalServerError)
			return
		}
	}

	// if request is for / or index.html replace the headlampBaseUrl with the baseURL in the index.html file
	if (path == h.indexPath || path == "/"+h.indexPath || path == "/"+h.indexPath+"/") && h.baseURL != "" {
		content = bytes.ReplaceAll(content, []byte("headlampBaseUrl = './"), []byte("headlampBaseUrl = '"+h.baseURL+""))
		content = bytes.ReplaceAll(content, []byte("'./'"), []byte(h.baseURL+"/"))
		content = bytes.ReplaceAll(content, []byte("url("), []byte("url("+h.baseURL+"/"))
	}

	// Set the correct Content-Type header
	ext := filepath.Ext(fullPath)

	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		contentType = http.DetectContentType(content)
	}

	w.Header().Set("Content-Type", contentType)

	_, err = w.Write(content)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing content")
	}
}

func (h embeddedSpaHandler) serveFile(path string) ([]byte, error) {
	f, err := h.staticFS.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

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
