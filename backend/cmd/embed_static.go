//go:build embed
// +build embed

package main

import "embed"

//go:embed static
var staticFiles embed.FS

const useEmbeddedFiles = true
