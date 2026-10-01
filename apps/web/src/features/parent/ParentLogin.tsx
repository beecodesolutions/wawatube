import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { api, errorText } from '../../api';
import { ParentBrand } from '../../components/Shared';

export function ParentLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(pin);
      onLoggedIn();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
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
        <Paper
          component="form"
          onSubmit={submit}
          sx={{ p: { xs: 3, sm: 5 }, width: 'min(100%, 430px)' }}
        >
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
            <TextField
              autoFocus
              fullWidth
              required
              label={t('parent.pinLabel')}
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              inputProps={{ inputMode: 'numeric' }}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={busy}
            >
              {busy ? (
                <CircularProgress size={22} color="inherit" />
              ) : (
                t('parent.enter')
              )}
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
