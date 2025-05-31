import { ConfigStore } from '@kinvolk/headlamp-plugin/lib';
import { Typography } from '@mui/material';

export interface MessageProps {
  /** String to display. */
  msg: string;
  /** True if there's an error. */
  error: boolean;
}

/**
 * For showing our action item message.
 *
 * This is a pure presentational component to make it
 * easier to use in storybook.
 *
 * See https://storybook.js.org/docs/web-components/writing-stories/build-pages-with-storybook
 *
 */
export default function Message({ msg, error }: MessageProps) {
  const config = new ConfigStore<{ errorMessage?: string }>('@kinvolk/headlamp-pod-counter');
  const useConf = config.useConfig();
  const conf = useConf();

  return (
    <Typography color="textPrimary" sx={{ fontStyle: 'italic' }}>
      {!error ? `# Pods: ${msg}` : conf?.errorMessage ? conf?.errorMessage : 'Custom Platform'}
    </Typography>
  );
}
