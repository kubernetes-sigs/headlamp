import { Box } from '@mui/material';
import { DocsContent } from './content/documentation/DocsContent';

interface LumosDrawerProps {
  toggleDisplayDrawer: (currentDisplay: boolean) => void;
}

// This function is going to hold the content of the drawer
// ** to do: more content windows will be added in the future, currently starting with docs **
export function LumosDrawer({ toggleDisplayDrawer }: LumosDrawerProps) {
  return (
    <Box sx={{ padding: '0.5rem', width: '100%', height: '100%' }}>
      <DocsContent toggleDisplayDrawer={toggleDisplayDrawer} />
    </Box>
  );
}
