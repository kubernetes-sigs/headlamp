/*
Copyright 2026 The Kubernetes Authors.

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

package terminal

import (
	"context"
	"errors"
	"io"
	"time"

	authv1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const (
	// DefaultIdleTimeout is the inactivity duration after which a terminal session is closed.
	DefaultIdleTimeout = 15 * time.Minute
	// DefaultMaxDuration is the maximum lifetime of a terminal session.
	DefaultMaxDuration = 1 * time.Hour
	verifyUserTimeout  = 10 * time.Second
)

// ErrUnsupportedPlatform is returned when local PTY sessions are not supported on the host OS.
var ErrUnsupportedPlatform = errors.New("local PTY terminal sessions are not supported on this platform")

// ErrUnauthorizedUser is returned when SelfSubjectReview yields an empty or anonymous user.
var ErrUnauthorizedUser = errors.New("user is not authorized to perform this operation")

// VerifyUserWithClient validates the caller's token via SelfSubjectReview and returns the username.
func VerifyUserWithClient(ctx context.Context, cs kubernetes.Interface) (string, error) {
	reviewCtx, cancel := context.WithTimeout(ctx, verifyUserTimeout)
	defer cancel()

	review, err := cs.AuthenticationV1().SelfSubjectReviews().Create(reviewCtx,
		&authv1.SelfSubjectReview{}, metav1.CreateOptions{})
	if err != nil {
		return "", err
	}

	user := review.Status.UserInfo.Username
	if user == "" || user == "system:anonymous" {
		return "", ErrUnauthorizedUser
	}

	return user, nil
}

// Session represents an interactive terminal byte stream with resize and lifecycle controls.
type Session interface {
	io.ReadWriteCloser
	Resize(cols, rows uint16) error
	Done() <-chan struct{}
}
