import { useEffect, useRef, type ReactNode } from 'react';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
        color="inherit"
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
  const navigate = useNavigate();
  const homeClick = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (homeClick.current) clearTimeout(homeClick.current);
    },
    [],
  );
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
            onClick={() => {
              if (homeClick.current) clearTimeout(homeClick.current);
              homeClick.current = setTimeout(() => navigate('/'), 250);
            }}
            onDoubleClick={() => {
              if (homeClick.current) clearTimeout(homeClick.current);
              navigate('/parent');
            }}
            aria-label={`${t('app.name')}. ${t('nav.home')}. ${t('nav.parentDoubleClick')}`}
            color="inherit"
            sx={{ textAlign: 'left', gap: 1, px: 0 }}
          >
            <Box component="span" sx={{ fontSize: '1.6rem' }} aria-hidden>
              🌈
            </Box>
            <Stack>
              <Typography
                variant="h6"
                sx={{ fontWeight: 900, lineHeight: 1.2 }}
              >
                {t('app.name')}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {t('app.subtitle')}
              </Typography>
            </Stack>
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

export function ParentBrand() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Button
      color="inherit"
      onDoubleClick={() => navigate('/')}
      aria-label={`${t('app.name')}. ${t('parent.title')}. ${t('nav.childDoubleClick')}`}
      sx={{
        textAlign: 'left',
        gap: 1,
        px: 0,
      }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{
          fontSize: '1.6rem',
          filter: (theme) =>
            theme.palette.mode === 'dark'
              ? 'grayscale(1) brightness(1.8)'
              : 'grayscale(1) brightness(0.6)',
        }}
      >
        🌈
      </Box>
      <Stack>
        <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.2 }}>
          {t('app.name')}
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>
          {t('parent.title')}
        </Typography>
      </Stack>
    </Button>
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
  childFriendly = false,
}: {
  message: string;
  retry?: () => void;
  childFriendly?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Alert
      severity="error"
      action={
        retry ? (
          <Button
            onClick={retry}
            variant={childFriendly ? 'contained' : 'text'}
            size={childFriendly ? 'large' : 'medium'}
            sx={
              childFriendly
                ? { minHeight: 64, minWidth: 64, fontSize: '1.5rem' }
                : undefined
            }
          >
            {childFriendly && (
              <ReplayRoundedIcon sx={{ mr: 1, fontSize: 32 }} />
            )}
            {t('common.retry')}
          </Button>
        ) : undefined
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
