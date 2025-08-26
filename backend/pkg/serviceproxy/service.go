package serviceproxy

import (
	"context"
	"fmt"

	"github.com/headlamp-k8s/headlamp/backend/pkg/logger"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const (
	HTTPScheme  = "http"
	HTTPSScheme = "https"
)

type proxyService struct {
	IsExternal bool   `yaml:"is_external"`
	Port       int32  `yaml:"port"`
	Name       string `yaml:"name"`
	Namespace  string `yaml:"namespace"`
	Scheme     string `yaml:"scheme"`
	URIPrefix  string `yaml:"URIPrefix"`
}

// getService returns the requested service.
func getService(cs kubernetes.Interface, namespace string, name string) (*proxyService, error) {
	service, err := cs.CoreV1().Services(namespace).Get(context.TODO(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	ps := &proxyService{
		Name:       service.Name,
		Namespace:  service.Namespace,
		IsExternal: len(service.Spec.ExternalName) > 0,
	}

	port, err := getPort(service.Spec.Ports)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "service port not found")

		return nil, err
	}

	ps.Port = port.Port

	// Determine scheme - always use https for external
	if port.Name == HTTPScheme {
		ps.Scheme = HTTPScheme
	} else {
		ps.Scheme = HTTPSScheme
	}

	ps.URIPrefix = getServiceURLPrefix(ps, service)

	return ps, nil
}

// getPort - return the first port named "http" or "https".
// TODO - what if both exist?
func getPort(ports []corev1.ServicePort) (*corev1.ServicePort, error) {
	for i, port := range ports {
		if port.Name == HTTPSScheme || port.Name == HTTPScheme {
			return &ports[i], nil
		}
	}

	return nil, fmt.Errorf("no port found with the name http or https")
}

// getServiceURLPrefix returns the prefix for the service URL.
func getServiceURLPrefix(ps *proxyService, service *corev1.Service) string {
	if ps.IsExternal {
		return fmt.Sprintf("%s://%s:%d", ps.Scheme, service.Spec.ExternalName, ps.Port)
	}

	return fmt.Sprintf("%s://%s.%s:%d", ps.Scheme, ps.Name, ps.Namespace, ps.Port)
}
