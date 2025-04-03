package utils_test

import (
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/utils"
)

func TestConatins(t *testing.T) {
	t.Parallel()

	if !utils.Contains([]string{"a", "b", "c"}, "b") {
		t.Error("Expected true")
	}

	if utils.Contains([]int{1, 2, 3}, 4) {
		t.Error("Expected false")
	}
}
