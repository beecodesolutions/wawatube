import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { api, errorText } from '../../api';
import { ParentBrand } from '../../components/Shared';

export function ParentLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (enteredPin: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.login(enteredPin);
      onLoggedIn();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
      setPin('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box
      sx={(theme) => ({
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        p: 2,
        background: theme.palette.artwork.parentBackground,
      })}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{
          width: 'calc(100% + 32px)',
          mt: -2,
          mx: -2,
          px: 2,
          py: 1,
          backdropFilter: 'blur(14px)',
        }}
      >
        <ParentBrand />
      </Stack>
      <Box
        sx={{ flex: 1, width: '100%', display: 'grid', placeItems: 'center' }}
      >
        <Paper sx={{ p: { xs: 3, sm: 5 }, width: 'min(100%, 430px)' }}>
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Typography variant="h1" sx={{ fontSize: '2.5rem' }}>
                {t('parent.pinTitle')}
              </Typography>
              <Typography color="text.secondary">
                {t('parent.pinHint')}
              </Typography>
            </Stack>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Box
              sx={{
                position: 'relative',
                display: 'flex',
                gap: 1.5,
                borderRadius: 2,
                '&:focus-within': {
                  outline: '3px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 4,
                },
              }}
            >
              <Box
                component="input"
                autoFocus
                aria-label={t('parent.pinLabel')}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={4}
                type="text"
                value={pin}
                readOnly={busy}
                onChange={(event) => {
                  const nextPin = event.target.value
                    .replace(/\D/g, '')
                    .slice(0, 4);
                  setPin(nextPin);
                  if (nextPin.length === 4) void submit(nextPin);
                }}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  opacity: 0,
                  zIndex: 1,
                  cursor: 'text',
                }}
              />
              {Array.from({ length: 4 }, (_, index) => (
                <Box
                  key={index}
                  aria-hidden="true"
                  sx={{
                    flex: 1,
                    height: 76,
                    display: 'grid',
                    placeItems: 'center',
                    border: 2,
                    borderColor:
                      index === pin.length ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    fontSize: '2rem',
                    fontWeight: 700,
                    bgcolor: 'background.paper',
                  }}
                >
                  {pin[index] ? '●' : ''}
                </Box>
              ))}
            </Box>
            {busy ? (
              <CircularProgress aria-label={t('common.loading')} />
            ) : null}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
