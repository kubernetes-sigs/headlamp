import { useParams } from 'react-router-dom';
import MutatingWebhookConfiguration from '../../lib/k8s/mutatingWebhookConfiguration';
import WebhookConfigurationDetails from './Details';

export default function MutatingWebhookConfigList(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;

  return (
    <WebhookConfigurationDetails
      resourceClass={MutatingWebhookConfiguration}
      name={name}
      cluster={cluster}
    />
  );
}
