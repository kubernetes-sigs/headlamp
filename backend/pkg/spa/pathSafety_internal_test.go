package spa

import "testing"

func TestURLToRelRejectsUnsafePaths(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{name: "parent escape", path: "/../outside.txt"},
		{name: "backslash separator", path: `/headlamp\\..\\..\\etc\\passwd`},
		{name: "windows volume path", path: "/C:/Windows/system32"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if rel, ok := urlToRel(tc.path); ok {
				t.Fatalf("expected path %q to be rejected, got rel=%q", tc.path, rel)
			}
		})
	}
}

func TestURLToRelAcceptsSafeRelativePath(t *testing.T) {
	rel, ok := urlToRel("/headlamp/assets/main.js")
	if !ok {
		t.Fatalf("expected safe path to be accepted")
	}

	if rel != "headlamp/assets/main.js" {
		t.Fatalf("unexpected relative path: got %q", rel)
	}
}
