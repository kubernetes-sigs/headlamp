/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Package externalproxy implements Headlamp's /externalproxy HTTP endpoint.
//
// # How to use
//
// Configure allowlisted upstream URL patterns with the server ProxyURLs flag
// (comma-separated globs). The frontend (or any client) then calls:
//
//	GET /externalproxy
//	proxy-to: https://allowed.example.com/path
//
// The Forward-to header is still accepted as a legacy alias for proxy-to.
//
// # Security behavior
//
// Credential and hop-by-hop headers are stripped before the request is
// forwarded. Redirects are followed only when the new URL still matches the
// ProxyURLs allowlist. Client-facing error bodies are generic so upstream
// URLs are not leaked.
//
// # Compatibility
//
// The public route remains /externalproxy. Existing clients that set proxy-to
// or Forward-to continue to work. Responses no longer forward Authorization,
// Cookie, or Headlamp-internal headers to upstream services.
package externalproxy
