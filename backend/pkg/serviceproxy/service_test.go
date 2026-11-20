package serviceproxy_test

import (
	"context"
	"errors"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/serviceproxy"
	corev1 "k8s.io/api/core/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes/fake"
)

func TestGetServiceInternal(t *testing.T) {
	// Test GetService() for internal services
	cs := fake.NewClientset()
	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-service",
			Namespace: "default",
		},
		Spec: corev1.ServiceSpec{
			Ports: []corev1.ServicePort{
				{
					Name: "http",
					Port: 80,
				},
			},
		},
	}

	_, err := cs.CoreV1().Services("default").Create(context.Background(), service, metav1.CreateOptions{})
	if err != nil {
		t.Errorf("Failed to create test service: %v", err)
	}

	ps, err := serviceproxy.GetService(context.Background(), cs, "default", "my-service")
	if err != nil {
		t.Errorf("GetService() error = %v", err)
	}

	if ps.URIPrefix != "http://my-service.default:80" {
		t.Errorf("GetService() URIPrefix = %s, wantPrefix http://my-service.default:80", ps.URIPrefix)
	}
}

func TestGetServiceExternal(t *testing.T) {
	// Test GetService() for external services
	cs := fake.NewClientset()
	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-service",
			Namespace: "default",
		},
		Spec: corev1.ServiceSpec{
			ExternalName: "example.com",
			Ports: []corev1.ServicePort{
				{
					Name: "https",
					Port: 443,
				},
			},
		},
	}

	_, err := cs.CoreV1().Services("default").Create(context.Background(), service, metav1.CreateOptions{})
	if err != nil {
		t.Errorf("Failed to create test service: %v", err)
	}

	ps, err := serviceproxy.GetService(context.Background(), cs, "default", "my-service")
	if err != nil {
		t.Errorf("GetService() error = %v", err)
	}

	if ps.URIPrefix != "https://example.com:443" {
		t.Errorf("GetService() URIPrefix = %s, wantPrefix https://example.com:443", ps.URIPrefix)
	}
}

func TestGetServiceNonExistent(t *testing.T) {
	// Test GetService() for non-existent services
	cs := fake.NewClientset()

	_, err := serviceproxy.GetService(context.Background(), cs, "default", "non-existent-service")
	if err == nil {
		t.Errorf("GetService() error = nil, wantErr not nil")
	}
}

//nolint:funlen // Table-driven cases are clearer inline than split up.
func TestGetPort(t *testing.T) {
	tests := []struct {
		name     string
		ports    []corev1.ServicePort
		wantPort int32
		wantErr  bool
	}{
		{
			name: "https port exists",
			ports: []corev1.ServicePort{
				{Name: "https", Port: 443},
				{Name: "http", Port: 80},
			},
			wantPort: 443,
			wantErr:  false,
		},
		{
			name: "http port exists, https port does not exist",
			ports: []corev1.ServicePort{
				{Name: "http", Port: 80},
			},
			wantPort: 80,
			wantErr:  false,
		},
		{
			name: "neither http nor https port exists",
			ports: []corev1.ServicePort{
				{Name: "other", Port: 8080},
			},
			wantPort: 0,
			wantErr:  true,
		},
		{
			name: "unnamed port only",
			ports: []corev1.ServicePort{
				{Port: 8080},
			},
			wantPort: 0,
			wantErr:  true,
		},
		{
			name:     "empty ports list",
			ports:    []corev1.ServicePort{},
			wantPort: 0,
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			port, err := serviceproxy.GetPort(tt.ports)
			if (err != nil) != tt.wantErr {
				t.Errorf("GetPort() error = %v, wantErr %v", err, tt.wantErr)
			}

			if tt.wantErr && !errors.Is(err, serviceproxy.ErrPortNotFound) {
				t.Errorf("GetPort() error = %v, want it to wrap ErrPortNotFound", err)
			}

			if !tt.wantErr && port.Port != tt.wantPort {
				t.Errorf("GetPort() port = %d, wantPort %d", port.Port, tt.wantPort)
			}
		})
	}
}

// TestGetServiceWithPort covers resolving a Service port by name and number, as
// well as the scheme chosen for the resolved port.
//
//nolint:funlen // Table-driven cases are clearer inline than split up.
func TestGetServiceWithPort(t *testing.T) {
	tests := []struct {
		name          string
		ports         []corev1.ServicePort
		externalName  string
		selector      string
		wantURIPrefix string
		wantErr       bool
	}{
		{
			name: "default prefers https",
			ports: []corev1.ServicePort{
				{Name: "http", Port: 80},
				{Name: "https", Port: 443},
			},
			wantURIPrefix: "https://my-service.default:443",
		},
		{
			name:          "default selects http",
			ports:         []corev1.ServicePort{{Name: "http", Port: 80}},
			wantURIPrefix: "http://my-service.default:80",
		},
		{
			name:    "default fails without http or https",
			ports:   []corev1.ServicePort{{Name: "web", Port: 8080}},
			wantErr: true,
		},
		{
			name: "select by name",
			ports: []corev1.ServicePort{
				{Name: "http", Port: 80},
				{Name: "metrics", Port: 9090},
			},
			selector:      "metrics",
			wantURIPrefix: "http://my-service.default:9090",
		},
		{
			name: "select by number",
			ports: []corev1.ServicePort{
				{Name: "http", Port: 80},
				{Name: "metrics", Port: 9090},
			},
			selector:      "9090",
			wantURIPrefix: "http://my-service.default:9090",
		},
		{
			name:          "select unnamed port by number",
			ports:         []corev1.ServicePort{{Port: 8080}},
			selector:      "8080",
			wantURIPrefix: "http://my-service.default:8080",
		},
		{
			name: "numeric selector does not match targetPort",
			ports: []corev1.ServicePort{
				{Name: "http", Port: 80, TargetPort: intstr.FromInt32(8080)},
			},
			selector: "8080",
			wantErr:  true,
		},
		{
			name:          "selected https port uses https",
			ports:         []corev1.ServicePort{{Name: "https", Port: 9443}},
			selector:      "https",
			wantURIPrefix: "https://my-service.default:9443",
		},
		{
			name:          "unnamed port numbered 443 uses https",
			ports:         []corev1.ServicePort{{Port: 443}},
			selector:      "443",
			wantURIPrefix: "https://my-service.default:443",
		},
		{
			name:          "other ports use http",
			ports:         []corev1.ServicePort{{Name: "web", Port: 8443}},
			selector:      "web",
			wantURIPrefix: "http://my-service.default:8443",
		},
		{
			name:          "http port stays http on 443",
			ports:         []corev1.ServicePort{{Name: "http", Port: 443}},
			selector:      "http",
			wantURIPrefix: "http://my-service.default:443",
		},
		{
			name:     "unknown name",
			ports:    []corev1.ServicePort{{Name: "metrics", Port: 9090}},
			selector: "missing",
			wantErr:  true,
		},
		{
			name:     "unknown number",
			ports:    []corev1.ServicePort{{Name: "metrics", Port: 9090}},
			selector: "9999",
			wantErr:  true,
		},
		{
			name:     "selector is never used as a path",
			ports:    []corev1.ServicePort{{Name: "metrics", Port: 9090}},
			selector: "metrics/../../80",
			wantErr:  true,
		},
		{
			name:     "selector is matched exactly",
			ports:    []corev1.ServicePort{{Name: "metrics", Port: 9090}},
			selector: "  metrics  ",
			wantErr:  true,
		},
		{
			name:     "whitespace-only selector is not the default",
			ports:    []corev1.ServicePort{{Name: "http", Port: 80}},
			selector: "  ",
			wantErr:  true,
		},
		{
			name:     "empty ports",
			ports:    []corev1.ServicePort{},
			selector: "8080",
			wantErr:  true,
		},
		{
			name:          "external name with explicit port",
			externalName:  "example.com",
			ports:         []corev1.ServicePort{{Name: "web", Port: 8443}},
			selector:      "web",
			wantURIPrefix: "http://example.com:8443",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cs := fake.NewClientset(&corev1.Service{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "my-service",
					Namespace: "default",
				},
				Spec: corev1.ServiceSpec{
					ExternalName: tt.externalName,
					Ports:        tt.ports,
				},
			})

			ps, err := serviceproxy.GetServiceWithPort(
				context.Background(), cs, "default", "my-service", tt.selector,
			)
			if (err != nil) != tt.wantErr {
				t.Fatalf("GetServiceWithPort() error = %v, wantErr %v", err, tt.wantErr)
			}

			if tt.wantErr {
				if !errors.Is(err, serviceproxy.ErrPortNotFound) {
					t.Errorf("GetServiceWithPort() error = %v, want it to wrap ErrPortNotFound", err)
				}

				return
			}

			if ps.URIPrefix != tt.wantURIPrefix {
				t.Errorf("GetServiceWithPort() URIPrefix = %s, want %s", ps.URIPrefix, tt.wantURIPrefix)
			}
		})
	}
}

// TestGetServiceWithPortPreservesKubernetesErrors ensures a failing Service
// lookup is still reported as a Kubernetes error rather than a missing port.
func TestGetServiceWithPortPreservesKubernetesErrors(t *testing.T) {
	cs := fake.NewClientset()

	_, err := serviceproxy.GetServiceWithPort(
		context.Background(), cs, "default", "non-existent-service", "metrics",
	)
	if !k8serrors.IsNotFound(err) {
		t.Errorf("GetServiceWithPort() error = %v, want a NotFound error", err)
	}

	if errors.Is(err, serviceproxy.ErrPortNotFound) {
		t.Errorf("GetServiceWithPort() error = %v, should not wrap ErrPortNotFound", err)
	}
}
