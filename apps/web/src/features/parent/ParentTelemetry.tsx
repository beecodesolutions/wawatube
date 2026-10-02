import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { TelemetryReport } from '@wawatube/shared';
import { api, errorText } from '../../api';
import { EmptyState, ErrorState, LoadingState } from '../../components/Shared';

export function AdminTelemetry() {
  const { t } = useTranslation();
  const [telemetry, setTelemetry] = useState<TelemetryReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void api
      .adminTelemetry()
      .then((data) => {
        if (active) {
          setTelemetry(data);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason, t));
      });
    return () => {
      active = false;
    };
  }, [reload, t]);

  const totalSeconds =
    telemetry?.daily.reduce((sum, day) => sum + day.seconds, 0) ?? 0;
  const totalViews =
    telemetry?.videos.reduce((sum, video) => sum + video.views, 0) ?? 0;

  return (
    <Stack spacing={4}>
      <Stack spacing={1}>
        <Typography
          variant="h1"
          sx={{ fontSize: { xs: '2.4rem', md: '3.6rem' } }}
        >
          {t('parent.telemetryTitle')}
        </Typography>
        <Typography color="text.secondary">
          {t('parent.telemetryHint')}
        </Typography>
      </Stack>
      {error ? (
        <ErrorState
          message={error}
          retry={() => setReload((value) => value + 1)}
        />
      ) : telemetry === null ? (
        <LoadingState />
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 1.5,
            }}
          >
            <Summary
              value={formatDuration(totalSeconds)}
              label={t('parent.telemetryTime')}
            />
            <Summary
              value={String(totalViews)}
              label={t('parent.telemetryViews')}
            />
          </Box>
          <TelemetryTable
            title={t('parent.telemetryDaily')}
            headers={[t('parent.telemetryDate'), t('parent.telemetryTime')]}
            noData={t('parent.telemetryNoData')}
            rows={telemetry.daily.map((day) => [
              day.date,
              formatDuration(day.seconds),
            ])}
          />
          <TelemetryTable
            title={t('parent.telemetryVideos')}
            headers={[t('parent.mediaTitle'), t('parent.telemetryViews')]}
            noData={t('parent.telemetryNoData')}
            rows={telemetry.videos.map((video) => [
              video.title,
              String(video.views),
            ])}
          />
        </>
      )}
    </Stack>
  );
}

function Summary({ value, label }: { value: string; label: string }) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h4" sx={{ fontWeight: 900 }}>
        {value}
      </Typography>
      <Typography color="text.secondary">{label}</Typography>
    </Paper>
  );
}

function TelemetryTable({
  title,
  headers,
  noData,
  rows,
}: {
  title: string;
  headers: [string, string];
  noData: string;
  rows: Array<[string, string]>;
}) {
  return (
    <Stack spacing={1}>
      <Typography variant="h2" sx={{ fontSize: { xs: '1.6rem', md: '2rem' } }}>
        {title}
      </Typography>
      {rows.length === 0 ? (
        <EmptyState text={noData} />
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                {headers.map((header) => (
                  <TableCell key={header}>{header}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(([first, second], index) => (
                <TableRow key={`${first}-${second}-${index}`}>
                  <TableCell>{first}</TableCell>
                  <TableCell>{second}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remaining = totalSeconds % 60;
  return hours > 0
    ? `${hours} h ${minutes} min`
    : `${minutes} min ${String(remaining).padStart(2, '0')} s`;
}
