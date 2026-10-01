import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';

export function ChildFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #fbf7f0 0%, #eff5f5 100%)',
      }}
    >
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ backdropFilter: 'blur(14px)' }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', py: 1 }}>
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
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ display: { xs: 'none', sm: 'block' } }}
          >
            {t('app.greeting')}
          </Typography>
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
        backgroundColor: 'rgba(255,255,255,.62)',
      }}
    >
      <Typography color="text.secondary">{text}</Typography>
    </Paper>
  );
}
