//go:build embed
// +build embed

package spa

import "embed"

//go:embed static
var StaticFilesEmbed embed.FS

const UseEmbeddedFiles = true
