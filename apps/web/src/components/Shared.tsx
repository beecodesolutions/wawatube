import { useEffect, useRef, type ReactNode } from 'react';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { clearTelemetrySession } from '../features/child/telemetry';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

export function ChildFrame({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: (theme) => theme.palette.artwork.childBackground,
      }}
    >
      <Box
        component="main"
        sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}
      >
        {children}
      </Box>
    </Box>
  );
}

export function ChildBrand() {
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
    <Button
      onClick={() => {
        clearTelemetrySession();
        if (homeClick.current) clearTimeout(homeClick.current);
        homeClick.current = setTimeout(() => navigate('/'), 250);
      }}
      onDoubleClick={() => {
        clearTelemetrySession();
        if (homeClick.current) clearTimeout(homeClick.current);
        navigate('/parent');
      }}
      aria-label={`${t('app.name')}. ${t('nav.home')}. ${t('nav.parentDoubleClick')}`}
      color="inherit"
      sx={{ minWidth: 104, minHeight: 80, p: 0, borderRadius: 3 }}
    >
      <Box
        component="img"
        src="/logo-child.webp"
        alt=""
        aria-hidden
        sx={{ width: 104, height: 74, objectFit: 'contain' }}
      />
    </Button>
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
        component="img"
        src="/logo-parent.webp"
        alt=""
        aria-hidden
        sx={{ width: 72, height: 50, objectFit: 'contain' }}
      />
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
