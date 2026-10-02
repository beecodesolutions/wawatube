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
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, errorText } from '../../api';
import { EmptyState, ErrorState, LoadingState } from '../../components/Shared';

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

function lastSevenDays(daily: TelemetryReport['daily']) {
  const today = new Date();
  const byDate = new Map(daily.map((day) => [day.date, day]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - 6 + index,
      ),
    );
    return (
      byDate.get(dayKey(date)) ?? { date: dayKey(date), seconds: 0, views: 0 }
    );
  });
}

function formatDuration(seconds: number) {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

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

  const days = telemetry ? lastSevenDays(telemetry.daily) : [];

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
            {days
              .slice(-2)
              .reverse()
              .map((day, index) => (
                <Paper key={day.date} sx={{ p: 2 }}>
                  <Typography variant="h6">
                    {index === 0
                      ? t('parent.telemetryToday')
                      : t('parent.telemetryYesterday')}
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>
                    {formatDuration(day.seconds)}
                  </Typography>
                  <Typography color="text.secondary">
                    {t('parent.telemetryTime')}
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 1 }}>
                    {day.views}
                  </Typography>
                  <Typography color="text.secondary">
                    {t('parent.telemetryViews')}
                  </Typography>
                </Paper>
              ))}
          </Box>
          <Stack spacing={1}>
            <Typography
              variant="h2"
              sx={{ fontSize: { xs: '1.6rem', md: '2rem' } }}
            >
              {t('parent.telemetryDaily')}
            </Typography>
            <DailyChart days={days} label={t('parent.telemetryTime')} />
          </Stack>
          <Stack spacing={1}>
            <Typography
              variant="h2"
              sx={{ fontSize: { xs: '1.6rem', md: '2rem' } }}
            >
              {t('parent.telemetryVideos')}
            </Typography>
            {telemetry.videos.length === 0 ? (
              <EmptyState text={t('parent.telemetryNoData')} />
            ) : (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('parent.mediaTitle')}</TableCell>
                      <TableCell align="right">
                        {t('parent.telemetryViews')}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {telemetry.videos.map((video) => (
                      <TableRow key={video.mediaId}>
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1.5}
                            alignItems="center"
                          >
                            {video.thumbnailUrl && (
                              <Box
                                component="img"
                                src={video.thumbnailUrl}
                                alt=""
                                sx={{
                                  width: 88,
                                  height: 50,
                                  objectFit: 'cover',
                                  borderRadius: 1,
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            <span>{video.title}</span>
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{video.views}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        </>
      )}
    </Stack>
  );
}

function DailyChart({
  days,
  label,
}: {
  days: TelemetryReport['daily'];
  label: string;
}) {
  const data = days.map((day) => ({
    date: day.date,
    day: day.date.slice(5),
    minutes: Math.round(day.seconds / 60),
  }));
  return (
    <Paper sx={{ p: 2, height: 300 }}>
      <Box
        role="img"
        aria-label={`${label}: ${data.map((day) => `${day.date} ${day.minutes} min`).join(', ')}`}
        sx={{ width: '100%', height: '100%' }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" />
            <YAxis allowDecimals={false} unit=" min" width={65} />
            <Tooltip
              formatter={(value) => `${value} min`}
              labelFormatter={(_, payload) => payload[0]?.payload.date ?? ''}
            />
            <Bar
              dataKey="minutes"
              name={label}
              fill="#8e78d5"
              radius={[4, 4, 0, 0]}
            />
            <Line
              dataKey="minutes"
              name={label}
              stroke="#49338e"
              strokeWidth={3}
              dot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}
