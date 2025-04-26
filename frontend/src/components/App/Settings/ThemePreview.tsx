import { Box } from '@mui/system';
import { useMemo } from 'react';
import { AppTheme } from '../../../lib/AppTheme';
import { createMuiTheme } from '../../../lib/themes';

export function ThemePreview({ theme, size = 50 }: { theme: AppTheme; size?: number }) {
  const muiTheme = useMemo(() => createMuiTheme(theme), [theme]);

  return (
    <Box
      sx={{
        position: 'relative',
        width: size + 'px',
        height: size + 'px',
        background: muiTheme.palette.background.default,
        border: '1px solid',
        borderColor: muiTheme.palette.divider,
        borderRadius: '4px',
        overflow: 'hidden',
      }}
    >
      <Box
        // Sidebar
        sx={{
          height: '100%',
          width: '40%',
          background: muiTheme.palette.sidebar.background,
          position: 'absolute',
          top: 0,
          left: 0,
          borderRight: '1px solid',
          borderColor: muiTheme.palette.divider,
        }}
      />

      <Box
        // Sidebar Selected Item
        sx={{
          position: 'absolute',
          top: '30%',
          left: '2%',
          width: '36%',
          background: muiTheme.palette.sidebar.selectedBackground,
          zIndex: 1,
          height: '5px',
          borderRadius: muiTheme.shape.borderRadius / 4 + 'px',
        }}
      />

      <Box
        // Card 1
        sx={{
          position: 'absolute',
          top: '25%',
          left: '45%',
          width: '22%',
          height: '22%',
          background: muiTheme.palette.background.muted,
          zIndex: 2,
          borderRadius: muiTheme.shape.borderRadius / 4 + 'px',
          border: '1px solid',
          borderColor: muiTheme.palette.divider,
        }}
      />

      <Box
        // Card 2
        sx={{
          position: 'absolute',
          top: '25%',
          left: '71%',
          width: '22%',
          height: '22%',
          background: muiTheme.palette.background.muted,
          zIndex: 2,
          borderRadius: muiTheme.shape.borderRadius / 4 + 'px',
          border: '1px solid',
          borderColor: muiTheme.palette.divider,
        }}
      />

      <Box
        // Sidebar Action Button
        sx={{
          position: 'absolute',
          bottom: '5%',
          left: '10%',
          width: '20%',
          height: '5%',
          background: muiTheme.palette.sidebar.actionBackground,
          zIndex: 1,
        }}
      />

      <Box
        // Navbar
        sx={{
          position: 'absolute',
          width: '100%',
          borderBottom: '1px solid',
          borderColor: muiTheme.palette.divider,
          background: muiTheme.palette.navbar.background,
          height: '20%',
        }}
      />
    </Box>
  );
}
