package spa

import (
	"io"
	"mime"
	"net/http"
	"path/filepath"
)

// detectContentType returns the content type for a file path, preferring
// extension-based lookup and falling back to sniffing up to 512 bytes.
func detectContentType(path string, open func() (io.ReadCloser, error)) string {
	ctype := mime.TypeByExtension(filepath.Ext(path))
	if ctype != "" {
		return ctype
	}

	f, err := open()
	if err != nil {
		return ""
	}
	defer func() { _ = f.Close() }()

	buf := make([]byte, 512)
	n, _ := f.Read(buf)

	return http.DetectContentType(buf[:n])
}
