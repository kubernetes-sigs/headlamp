import { useParams } from 'react-router-dom';
import ValidatingWebhookConfiguration from '../../lib/k8s/validatingWebhookConfiguration';
import WebhookConfigurationDetails from './Details';

export default function ValidatingWebhookConfigurationDetails(props: {
  name?: string;
  cluster?: string;
}) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;

  return (
    <WebhookConfigurationDetails
      resourceClass={ValidatingWebhookConfiguration}
      name={name}
      cluster={cluster}
    />
  );
}
