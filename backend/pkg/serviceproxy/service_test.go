package serviceproxy_test

import (
	"context"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/serviceproxy"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestGetServiceInternal(t *testing.T) {
	// Test GetService() for internal services
	cs := fake.NewSimpleClientset()
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

	_, err := cs.CoreV1().Services("default").Create(context.TODO(), service, metav1.CreateOptions{})
	if err != nil {
		t.Errorf("Failed to create test service: %v", err)
	}

	ps, err := serviceproxy.GetService(cs, "default", "my-service")
	if err != nil {
		t.Errorf("GetService() error = %v", err)
	}

	if ps.URIPrefix != "http://my-service.default:80" {
		t.Errorf("GetService() URIPrefix = %s, wantPrefix http://my-service.default:80", ps.URIPrefix)
	}
}

func TestGetServiceExternal(t *testing.T) {
	// Test GetService() for external services
	cs := fake.NewSimpleClientset()
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

	_, err := cs.CoreV1().Services("default").Create(context.TODO(), service, metav1.CreateOptions{})
	if err != nil {
		t.Errorf("Failed to create test service: %v", err)
	}

	ps, err := serviceproxy.GetService(cs, "default", "my-service")
	if err != nil {
		t.Errorf("GetService() error = %v", err)
	}

	if ps.URIPrefix != "https://example.com:443" {
		t.Errorf("GetService() URIPrefix = %s, wantPrefix https://example.com:443", ps.URIPrefix)
	}
}

func TestGetServiceNonExistent(t *testing.T) {
	// Test GetService() for non-existent services
	cs := fake.NewSimpleClientset()

	_, err := serviceproxy.GetService(cs, "default", "non-existent-service")
	if err == nil {
		t.Errorf("GetService() error = nil, wantErr not nil")
	}
}

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

			if !tt.wantErr && port.Port != tt.wantPort {
				t.Errorf("GetPort() port = %d, wantPort %d", port.Port, tt.wantPort)
			}
		})
	}
}
