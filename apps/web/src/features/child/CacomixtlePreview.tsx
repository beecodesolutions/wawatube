import { useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Container,
  Divider,
  FormControlLabel,
  Link,
  Stack,
  Switch,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { CacomixtleLayer } from './CacomixtleLayer';
import { sendCacomixtleEvent } from './cacomixtle-events';
import type { MascotEvent, MascotState } from './cacomixtle-controller';

const previewStates: readonly { state: MascotState; label: string }[] = [
  { state: 'hidden', label: 'Oculto' },
  { state: 'idle', label: 'Quieto' },
  { state: 'runningRight', label: 'Corre a la derecha' },
  { state: 'runningLeft', label: 'Corre a la izquierda' },
  { state: 'peeking', label: 'Se asoma' },
  { state: 'waving', label: 'Saluda' },
  { state: 'enteringCave', label: 'Entra a la cueva' },
  { state: 'cave', label: 'Cueva' },
];

const previewEvents: readonly { event: MascotEvent; label: string }[] = [
  { event: 'videoStarted', label: 'Iniciar video' },
  { event: 'videoEnded', label: 'Terminar video' },
  { event: 'sessionEnded', label: 'Terminar sesión' },
  { event: 'userIdle', label: 'Usuario inactivo' },
  { event: 'sessionStarted', label: 'Iniciar sesión' },
];

export default function CacomixtlePreview() {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [enabled, setEnabled] = useState(true);
  const [motionDisabled, setMotionDisabled] = useState(false);
  const [previewState, setPreviewState] = useState<MascotState | undefined>(
    'hidden',
  );
  const [replay, setReplay] = useState(0);
  const [clickCount, setClickCount] = useState(0);

  const handleAutomatic = () => {
    setPreviewState(undefined);
    setReplay((current) => current + 1);
  };

  const handlePreviewState = (state: MascotState) => {
    setPreviewState(state);
    setReplay((current) => current + 1);
  };

  return (
    <>
      <CacomixtleLayer
        enabled={enabled}
        motionDisabled={motionDisabled}
        previewState={previewState}
        key={replay}
      />
      <Container maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
        <Stack spacing={3}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            gap={2}
          >
            <Box>
              <Typography component="h1" variant="h4">
                Vista previa del cacomixtle
              </Typography>
              <Typography color="text.secondary">
                Ruta de desarrollo para revisar sus animaciones.
              </Typography>
            </Box>
            <Link component={RouterLink} to="/" underline="hover">
              Inicio
            </Link>
          </Stack>

          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
            }
            label={enabled ? 'Mascota activa' : 'Mascota desactivada'}
          />
          <FormControlLabel
            control={
              <Switch
                checked={motionDisabled}
                onChange={(event) => setMotionDisabled(event.target.checked)}
              />
            }
            label="Simular movimiento reducido"
          />

          <Typography color="text.secondary" role="status">
            Movimiento reducido:{' '}
            {reducedMotion || motionDisabled ? 'activado' : 'desactivado'}
          </Typography>

          <Stack direction="row" alignItems="center" spacing={2}>
            <Button
              variant="outlined"
              onClick={() => setClickCount((count) => count + 1)}
            >
              Probar click
            </Button>
            <Typography color="text.secondary" role="status">
              Clicks: {clickCount}
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <Typography component="h2" variant="h6">
              Estados manuales
            </Typography>
            <Stack
              aria-label="Estados manuales del cacomixtle"
              direction="row"
              spacing={1}
              sx={{ flexWrap: 'wrap' }}
              useFlexGap
            >
              {previewStates.map(({ state, label }) => (
                <Button
                  key={state}
                  onClick={() => handlePreviewState(state)}
                  variant="outlined"
                >
                  {label}
                </Button>
              ))}
            </Stack>
            <Button variant="contained" onClick={handleAutomatic}>
              Modo automático
            </Button>
          </Stack>

          <Stack spacing={1.5}>
            <Typography component="h2" variant="h6">
              Eventos de sesión
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Activa el modo automático para probar estos eventos.
            </Typography>
            <ButtonGroup
              aria-label="Eventos de sesión del cacomixtle"
              disabled={previewState !== undefined}
              orientation="vertical"
              variant="outlined"
            >
              {previewEvents.map(({ event, label }) => (
                <Button key={event} onClick={() => sendCacomixtleEvent(event)}>
                  {label}
                </Button>
              ))}
            </ButtonGroup>
          </Stack>
        </Stack>
      </Container>
    </>
  );
}
