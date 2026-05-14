package spa

import (
	"net/http"
	"os"
	"path"
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

	// Clean the path to prevent directory traversal
	rPath := strings.TrimPrefix(r.URL.Path, h.baseURL)
	rPath = strings.TrimPrefix(rPath, "/")
	rPath = path.Clean(rPath)

	// Reject direct traversal hacks explicitly
	if rPath == ".." || strings.HasPrefix(rPath, "../") {
		http.Error(w, "Invalid file name", http.StatusBadRequest)
		return
	}

	if rPath == "" || rPath == "." {
		rPath = h.indexPath
	}

	// prepend the path with the path to the static directory
	fullPath := filepath.Join(absStaticPath, rPath)

	// This is defensive, for preventing using files outside of the staticPath
	// if in the future we touch the code.
	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		http.Error(w, "Invalid file name", http.StatusBadRequest)
		return
	}

	relPath, err := filepath.Rel(absStaticPath, absPath)
	if err != nil ||
		filepath.IsAbs(relPath) ||
		relPath == ".." ||
		strings.HasPrefix(relPath, ".."+string(os.PathSeparator)) {
		http.Error(w, "Invalid file name (file to serve is outside of the static dir!)", http.StatusBadRequest)
		return
	}

	// check whether a file exists at the given path
	_, err = os.Stat(fullPath)
	if os.IsNotExist(err) {
		// file does not exist, serve index.html
		http.ServeFile(w, r, filepath.Join(absStaticPath, h.indexPath))
		return
	} else if err != nil {
		// if we got an error (that wasn't that the file doesn't exist) stating the
		// file, return a 500 internal server error and stop
		logger.Log(logger.LevelError, nil, err, "stating file")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// The file does exist, so we serve that.
	http.ServeFile(w, r, fullPath)
}

// NewHandler creates a new handler.
func NewHandler(staticPath, indexPath, baseURL string) *spaHandler {
	return &spaHandler{
		staticPath: staticPath,
		indexPath:  indexPath,
		baseURL:    baseURL,
	}
}
