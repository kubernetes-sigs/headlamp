package spa

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// pickEncoding returns the best precompressed encoding to serve for a request
// based on its Accept-Encoding header. It returns "br" or "".
//
// Only brotli is supported: every browser Headlamp targets ships with brotli,
// the build pipeline only emits `.br` sidecars, and serving gzip would
// require a parallel set of files for no real-world benefit. Encodings whose
// quality value (`q=`) is explicitly 0 are never selected, including when
// the wildcard `*` appears later in the same header (RFC 7231 §5.3.4: an
// explicit q=0 for a coding overrides the wildcard). The function does
// not parse the full RFC 7231 grammar; it implements just enough to recognise
// the common cases produced by browsers and well-behaved HTTP clients.
func pickEncoding(acceptEncoding string) string {
	if acceptEncoding == "" {
		return ""
	}

	// First pass: collect which encodings (and the wildcard) have been
	// explicitly disabled with q=0, so that a later "*" cannot re-enable
	// them. We deliberately make a second pass below to honour the
	// preference order of the entries that *are* enabled.
	disabled := map[string]bool{}

	for _, raw := range strings.Split(acceptEncoding, ",") {
		token := strings.TrimSpace(raw)
		if token == "" {
			continue
		}

		name, params := splitEncoding(token)
		if hasZeroQ(params) {
			disabled[strings.ToLower(name)] = true
		}
	}

	for _, raw := range strings.Split(acceptEncoding, ",") {
		token := strings.TrimSpace(raw)
		if token == "" {
			continue
		}

		name, params := splitEncoding(token)
		// q=0 disables this encoding even if it would otherwise match.
		if hasZeroQ(params) {
			continue
		}

		switch strings.ToLower(name) {
		case "br":
			return "br"
		case "*":
			// Wildcard matches br only if br wasn't explicitly disabled
			// elsewhere in this same header.
			if !disabled["br"] {
				return "br"
			}
		}
	}

	return ""
}

// splitEncoding splits an Accept-Encoding token like "br;q=0.5" into its
// coding name and parameter list (without the leading ";").
func splitEncoding(token string) (string, string) {
	if i := strings.Index(token, ";"); i >= 0 {
		return strings.TrimSpace(token[:i]), token[i+1:]
	}

	return token, ""
}

// hasZeroQ reports whether an Accept-Encoding parameter list contains q=0
// (or any case/whitespace variant such as "Q = 0", "q=0.0", "q=0.000").
func hasZeroQ(params string) bool {
	for _, p := range strings.Split(params, ";") {
		p = strings.TrimSpace(p)

		eq := strings.IndexByte(p, '=')
		if eq < 0 {
			continue
		}

		key := strings.ToLower(strings.TrimSpace(p[:eq]))
		val := strings.TrimSpace(p[eq+1:])

		if key != "q" {
			continue
		}

		// "0", "0.", "0.0", "0.000" all mean disabled. Anything with a
		// non-zero digit anywhere means a positive (or malformed) weight.
		if val == "" {
			continue
		}

		isZero := true

		for _, r := range val {
			if r >= '1' && r <= '9' {
				isZero = false
				break
			}
		}

		if isZero {
			return true
		}
	}

	return false
}

// encodingExt returns the filename suffix (".br") for a given negotiated
// encoding, or "" if no precompressed sidecar should be served.
func encodingExt(encoding string) string {
	if encoding == "br" {
		return ".br"
	}

	return ""
}

// setEncodingHeaders writes the response headers required when serving a
// precompressed sidecar. The original Content-Type (derived from the
// non-compressed filename) must already be set on w.
//
// It is safe to call multiple times per request: Accept-Encoding is added to
// Vary only when not already present (avoiding duplicate entries), and
// Content-Encoding is deleted when encoding is empty so identity responses
// never carry a stale marker from a previous call.
func setEncodingHeaders(w http.ResponseWriter, encoding string) {
	h := w.Header()

	// Add Accept-Encoding to Vary only when not already present.
	// Parse the Vary header as a comma-separated token list and compare
	// case-insensitively so we handle "Vary: Accept-Encoding",
	// "Vary: Origin, Accept-Encoding", and "Vary: *" correctly, without
	// false-positives from tokens like "X-Accept-Encoding".
	hasAcceptEncoding := false

	for _, field := range h["Vary"] {
		for _, token := range strings.Split(field, ",") {
			t := strings.ToLower(strings.TrimSpace(token))
			if t == "accept-encoding" || t == "*" {
				hasAcceptEncoding = true
				break
			}
		}

		if hasAcceptEncoding {
			break
		}
	}

	if !hasAcceptEncoding {
		h.Add("Vary", "Accept-Encoding")
	}

	if encoding != "" {
		h.Set("Content-Encoding", encoding)
	} else {
		// Remove any Content-Encoding set by an earlier call so identity
		// responses never carry a stale encoding marker.
		h.Del("Content-Encoding")
	}
}

// BrotliSidecars returns an http.Handler that transparently serves precompressed
// .br sidecars when the client advertises brotli support and a matching sidecar
// exists alongside the requested file in dir. It falls back to next for all
// other cases, so it is safe to wrap any existing file-serving handler.
//
// dir must be the same root directory that next serves from (e.g. the value
// passed to http.Dir) so the middleware can resolve file paths correctly.
//
// Reuses the same pickEncoding / encodingExt / setEncodingHeaders helpers as
// the SPA handlers, giving plugins identical brotli negotiation behaviour.
func BrotliSidecars(dir string, next http.Handler) http.Handler {
	absDir, err := filepath.Abs(dir)
	if err != nil {
		// Cannot resolve dir — brotli is best-effort, fall through unchanged.
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		setEncodingHeaders(w, "")

		if served := tryBrotliSidecar(w, r, absDir); served {
			return
		}

		next.ServeHTTP(w, r)
	})
}

// tryBrotliSidecar attempts to serve a precompressed .br sidecar for the
// requested path. It returns true when a sidecar was found and served.
func tryBrotliSidecar(w http.ResponseWriter, r *http.Request, absDir string) bool {
	// Convert the URL path to a safe OS-relative path. urlToRel rejects
	// backslashes; os.Root then enforces the containment boundary.
	rel, ok := urlToRel(r.URL.Path)
	if !ok {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return true
	}

	encoding := pickEncoding(r.Header.Get("Accept-Encoding"))
	if encoding == "" {
		return false
	}

	root, err := os.OpenRoot(absDir)
	if err != nil {
		return false
	}
	defer func() { _ = root.Close() }()

	sidecarRel := rel + encodingExt(encoding)

	info, err := root.Stat(sidecarRel)
	if err != nil || info.IsDir() {
		return false
	}

	origInfo, origErr := root.Stat(rel)
	if origErr != nil || origInfo.IsDir() {
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

	fileInfo, err := file.Stat()
	if err != nil {
		return false
	}

	if ctype != "" {
		w.Header().Set("Content-Type", ctype)
	}

	setEncodingHeaders(w, encoding)

	http.ServeContent(w, r, sidecarRel, fileInfo.ModTime(), file)

	return true
}
