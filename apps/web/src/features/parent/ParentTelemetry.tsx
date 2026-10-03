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
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { useTheme } from '@mui/material/styles';
import type { TelemetryReport } from '@wawatube/shared';
import {
  Bar,
  CartesianGrid,
  BarChart,
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
  const [videoColors, setVideoColors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([api.adminTelemetry(), api.adminMedia(), api.categories()])
      .then(([data, library, categories]) => {
        const orderedCategories = [...categories].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
        );
        const colors: Record<string, string> = {};
        for (const media of library.media) {
          const category = orderedCategories.find((item) =>
            media.categoryIds.includes(item.id),
          );
          const color = category?.color;
          if (color) colors[media.id] = color;
        }
        if (active) {
          setTelemetry(data);
          setVideoColors(colors);
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
  const viewedVideos =
    telemetry?.videos.filter((video) => video.views > 0) ?? [];

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
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="baseline"
                    sx={{ mt: 1 }}
                  >
                    <Typography variant="h5">{day.views}</Typography>
                    <Typography color="text.secondary">
                      {t('parent.telemetryViews')}
                    </Typography>
                  </Stack>
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
            <DailyChart
              days={days}
              videoColors={videoColors}
              label={t('parent.telemetryTime')}
              viewsLabel={t('parent.telemetryViews')}
              legacyLabel={t('parent.telemetryLegacy')}
            />
          </Stack>
          <Stack spacing={1}>
            <Typography
              variant="h2"
              sx={{ fontSize: { xs: '1.6rem', md: '2rem' } }}
            >
              {t('parent.telemetryVideos')}
            </Typography>
            {viewedVideos.length === 0 ? (
              <EmptyState text={t('parent.telemetryNoData')} />
            ) : (
              <TableContainer component={Paper}>
                <Table
                  sx={{
                    tableLayout: 'fixed',
                    '& .MuiTableCell-root': { px: { xs: 1, sm: 2 } },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('parent.mediaTitle')}</TableCell>
                      <TableCell
                        align="right"
                        sx={{ width: { xs: 64, sm: 88 } }}
                      >
                        <VisibilityRoundedIcon
                          titleAccess={t('parent.telemetryViews')}
                          fontSize="small"
                          color="action"
                          sx={{ verticalAlign: 'middle' }}
                        />
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {viewedVideos.map((video) => (
                      <TableRow key={video.mediaId}>
                        <TableCell>
                          <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={{ xs: 1, sm: 1.5 }}
                            sx={{
                              alignItems: { xs: 'flex-start', sm: 'center' },
                            }}
                          >
                            {video.thumbnailUrl && (
                              <Box
                                component="img"
                                src={video.thumbnailUrl}
                                alt=""
                                sx={{
                                  width: { xs: 96, sm: 88 },
                                  height: { xs: 54, sm: 50 },
                                  objectFit: 'cover',
                                  borderRadius: 1,
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            <Typography
                              component="span"
                              variant="body2"
                              title={video.title}
                              sx={{
                                minWidth: 0,
                                overflowWrap: 'anywhere',
                                display: { xs: '-webkit-box', sm: 'block' },
                                WebkitLineClamp: { xs: 2, sm: 'unset' },
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {video.title}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          <Typography component="span" variant="h5">
                            {video.views}
                          </Typography>
                        </TableCell>
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
  viewsLabel,
  legacyLabel,
  videoColors,
}: {
  days: TelemetryReport['daily'];
  label: string;
  viewsLabel: string;
  legacyLabel: string;
  videoColors: Record<string, string>;
}) {
  const theme = useTheme();
  const videos = [
    ...new Map(
      days
        .flatMap((day) => day.videos ?? [])
        .map((video) => [video.mediaId, video]),
    ).values(),
  ];
  const data = days.map((day) => ({
    date: day.date,
    day: day.date.slice(5),
    minutes: day.seconds / 60,
    views: day.views,
    segments: Object.fromEntries(
      (day.videos ?? []).map((video) => [video.mediaId, video.seconds / 60]),
    ),
    legacy:
      Math.max(
        0,
        day.seconds -
          (day.videos ?? []).reduce((sum, video) => sum + video.seconds, 0),
      ) / 60,
  }));
  return (
    <Paper sx={{ p: { xs: 1, sm: 2 }, height: 300 }}>
      <Box
        role="img"
        aria-label={`${label}: ${data.map((day) => `${day.date} ${formatDuration(day.minutes * 60)}, ${day.views} ${viewsLabel}`).join(', ')}`}
        sx={{ width: '100%', height: '100%' }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" />
            <YAxis allowDecimals={false} unit=" min" width={60} />
            <Tooltip
              filterNull
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const day = days.find(
                  (day) => day.date === payload[0]?.payload.date,
                );
                if (!day) return null;
                return (
                  <Paper sx={{ p: 1.5, maxWidth: 280 }}>
                    <Typography fontWeight={700}>{day.date}</Typography>
                    <Typography>
                      {formatDuration(day.seconds)} · {day.views} {viewsLabel}
                    </Typography>
                    {(day.videos ?? []).map((video) => (
                      <Typography
                        key={video.mediaId}
                        variant="body2"
                        sx={{ mt: 0.5, overflowWrap: 'anywhere' }}
                      >
                        {video.title}: {formatDuration(video.seconds)} ·{' '}
                        {video.views} {viewsLabel}
                      </Typography>
                    ))}
                    {data.find((item) => item.date === day.date)?.legacy ? (
                      <Typography variant="body2">{legacyLabel}</Typography>
                    ) : null}
                  </Paper>
                );
              }}
            />
            {videos.map((video) => (
              <Bar
                key={video.mediaId}
                dataKey={(day) => day.segments[video.mediaId] ?? 0}
                stackId="time"
                name={video.title}
                fill={videoColors[video.mediaId] ?? theme.palette.primary.main}
                stroke={theme.palette.background.paper}
                strokeWidth={1}
              />
            ))}
            <Bar
              dataKey="legacy"
              stackId="time"
              name={legacyLabel}
              fill={theme.palette.text.disabled}
            />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}
