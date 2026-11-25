/*
Copyright 2025 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

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
