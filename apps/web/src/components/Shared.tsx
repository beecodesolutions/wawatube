import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { useColorScheme } from '@mui/material/styles';

export function ThemeToggle() {
  const { t } = useTranslation();
  const { mode, systemMode, setMode } = useColorScheme();
  const effectiveMode = mode === 'system' ? systemMode : mode;
  if (!effectiveMode) return null;
  const dark = effectiveMode === 'dark';
  const label = t(dark ? 'theme.useLight' : 'theme.useDark');
  return (
    <Tooltip title={label}>
      <IconButton
        onClick={() => setMode(dark ? 'light' : 'dark')}
        aria-label={label}
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        <Box component="span" aria-hidden sx={{ fontSize: '1.25rem' }}>
          {dark ? '☀️' : '🌙'}
        </Box>
      </IconButton>
    </Tooltip>
  );
}

export function ChildFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: (theme) => theme.palette.artwork.childBackground,
      }}
    >
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ backdropFilter: 'blur(14px)' }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', py: 1, gap: 2 }}>
          <Button
            component={Link}
            to="/"
            color="inherit"
            sx={{ fontSize: '1.2rem', px: 0 }}
          >
            <Box
              component="span"
              sx={{ mr: 1, fontSize: '1.6rem' }}
              aria-hidden
            >
              🌈
            </Box>
            {t('app.name')}
          </Button>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' } }}
            >
              {t('app.greeting')}
            </Typography>
            <ThemeToggle />
          </Stack>
        </Toolbar>
      </AppBar>
      {children}
    </Box>
  );
}

export function LoadingState({ label = 'common.loading' }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={2}
      sx={{ py: 10 }}
    >
      <CircularProgress aria-label={t(label)} />
      <Typography color="text.secondary">{t(label)}</Typography>
    </Stack>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Alert
      severity="error"
      action={
        retry ? <Button onClick={retry}>{t('common.retry')}</Button> : undefined
      }
      sx={{ my: 3 }}
    >
      {message}
    </Alert>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <Paper
      sx={{
        p: 5,
        textAlign: 'center',
        backgroundColor: 'background.paper',
      }}
    >
      <Typography color="text.secondary">{text}</Typography>
    </Paper>
  );
}
