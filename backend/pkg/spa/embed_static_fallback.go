//go:build !embed
// +build !embed

package spa

import "embed"

// StaticFilesEmbed is not used when not embedding, but we need to declare it to satisfy the compiler.
var StaticFilesEmbed embed.FS

const UseEmbeddedFiles = false
