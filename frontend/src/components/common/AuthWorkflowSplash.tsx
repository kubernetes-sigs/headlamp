import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { getThemeName } from '../../lib/themes';
import LogoWithTextDark from '../../resources/logo-dark.svg?react';
import LogoWithTextLight from '../../resources/logo-light.svg?react';

export interface AuthWorkflowSplashProps {
  title: string;
  subtitle?: string;
  branding?: boolean;
  titleId?: string;
}

export function AuthWorkflowSplash({
  title,
  subtitle,
  branding = true,
  titleId,
}: AuthWorkflowSplashProps) {
  const theme = useTheme();
  const themeName = getThemeName();
  const Logo = themeName === 'dark' ? LogoWithTextLight : LogoWithTextDark;

  const inner = (
    <>
      {branding && (
        <Box sx={{ height: 40, display: 'flex', alignItems: 'center' }}>
          <Logo style={{ width: 'auto', height: 36 }} aria-hidden />
        </Box>
      )}
      <CircularProgress size={44} thickness={4} sx={{ color: 'primary.main' }} aria-hidden />
      <Box sx={{ textAlign: 'center', maxWidth: 420 }}>
        <Typography
          variant="h6"
          component="h1"
          id={titleId}
          color="text.primary"
          gutterBottom
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
    </>
  );

  if (!branding) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          gap: 2.5,
          px: 1,
          py: 2,
        }}
      >
        {inner}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: { xs: '50vh', sm: '55vh' },
        width: '100%',
        gap: 3,
        px: 2,
        py: 4,
        borderRadius: 2,
        background: alpha(theme.palette.primary.main, 0.04),
        border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
      }}
    >
      {inner}
    </Box>
  );
}
