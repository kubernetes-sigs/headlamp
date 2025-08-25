//go:build !embed
// +build !embed

package main

import "embed"

// staticFiles is not used when not embedding, but we need to declare it to satisfy the compiler.
var staticFiles embed.FS

const useEmbeddedFiles = false
