import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Pagination,
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
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { useTheme } from '@mui/material/styles';
import type { TelemetryReport } from '@wawatube/shared';
import {
  Bar,
  CartesianGrid,
  Cell,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, errorText } from '../../api';
import { EmptyState, ErrorState, LoadingState } from '../../components/Shared';
import { lastSevenDays, sessionWeek, usageDayLabel } from './telemetry-dates';

import {
  categorySegments,
  sessionCategories,
  type VideoCategory,
} from './telemetry-categories';

function formatDuration(seconds: number) {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

export function AdminTelemetry() {
  const { t, i18n } = useTranslation();
  const [telemetry, setTelemetry] = useState<TelemetryReport | null>(null);
  const [videoCategories, setVideoCategories] = useState<
    Record<string, VideoCategory>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([api.adminTelemetry(), api.adminMedia(), api.categories()])
      .then(([data, library, categories]) => {
        const orderedCategories = [...categories].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
        );
        const assignments: Record<string, VideoCategory> = {};
        for (const media of library.media) {
          const category = orderedCategories.find((item) =>
            media.categoryIds.includes(item.id),
          );
          if (category)
            assignments[media.id] = {
              id: category.id,
              name: category.name,
              icon: category.icon,
              color: category.color,
            };
        }
        if (active) {
          setTelemetry(data);
          setVideoCategories(assignments);
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
  const now = new Date();
  const sessions = telemetry?.sessions ?? [];
  const week = sessionWeek(sessions, weekOffset, now);
  const oldestStart = sessions.reduce(
    (oldest, session) =>
      Math.min(oldest, new Date(session.startedAt).getTime()),
    now.getTime(),
  );
  const oldestDay = new Date(oldestStart);
  const calendarDay = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const weekCount =
    Math.floor((calendarDay(now) - calendarDay(oldestDay)) / (7 * 86400000)) +
    1;
  const time = (value: string) =>
    new Date(value).toLocaleTimeString(i18n.resolvedLanguage, {
      hour: '2-digit',
      minute: '2-digit',
    });
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
              videoCategories={videoCategories}
              label={t('parent.telemetryTime')}
              viewsLabel={t('parent.telemetryViews')}
              legacyLabel={t('parent.telemetryLegacy')}
              uncategorizedLabel={t('parent.noCategory')}
            />
          </Stack>
          <Stack spacing={1}>
            <Typography
              variant="h2"
              sx={{ fontSize: { xs: '1.6rem', md: '2rem' } }}
            >
              {t('parent.telemetrySessions')}
            </Typography>
            {week.map((day, index) => {
              if (day.videos.length === 0) return null;
              const categories = sessionCategories(day.videos, videoCategories);
              const label =
                weekOffset === 0 && index < 2
                  ? t(
                      index === 0
                        ? 'parent.telemetryToday'
                        : 'parent.telemetryYesterday',
                    )
                  : usageDayLabel(
                      day.date,
                      weekOffset,
                      now,
                      i18n.resolvedLanguage,
                    );
              return (
                <Accordion key={day.key} disableGutters>
                  <AccordionSummary
                    expandIcon={<ExpandMoreRoundedIcon />}
                    id={`day-${day.key}`}
                    aria-controls={`day-details-${day.key}`}
                  >
                    <Stack spacing={0.5}>
                      <Typography fontWeight={700}>{label}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatDuration(day.seconds)} · {day.videos.length}{' '}
                        {t('parent.telemetrySessionVideos', {
                          count: day.videos.length,
                        })}
                      </Typography>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails id={`day-details-${day.key}`}>
                    {day.sessions.length === 0 ? (
                      <EmptyState text={t('parent.telemetryNoData')} />
                    ) : (
                      <Stack spacing={2}>
                        <Stack spacing={0.5}>
                          <Typography fontWeight={700}>
                            {t('parent.telemetrySessionCategories')}
                          </Typography>
                          {categories.map((category) => (
                            <Typography key={category.id}>
                              <Box component="span" sx={{ fontWeight: 700 }}>
                                {category.icon && (
                                  <Box component="span" aria-hidden="true">
                                    {category.icon}{' '}
                                  </Box>
                                )}
                                {category.name || t('parent.noCategory')}
                              </Box>
                              : {category.count} ·{' '}
                              {Math.round(
                                (category.count / day.videos.length) * 100,
                              )}
                              %
                            </Typography>
                          ))}
                        </Stack>
                        {day.sessions.map((session, sessionIndex) => (
                          <Stack key={session.id} spacing={1}>
                            <Stack
                              direction={{ xs: 'column', sm: 'row' }}
                              spacing={1}
                              alignItems={{ xs: 'flex-start', sm: 'baseline' }}
                            >
                              {day.sessions.length > 1 && (
                                <Typography variant="h6">
                                  {t('parent.telemetrySessionNumber', {
                                    number: sessionIndex + 1,
                                  })}
                                </Typography>
                              )}
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                {t('parent.telemetrySessionStart')}:{' '}
                                {time(session.startedAt)} ·{' '}
                                {t(
                                  session.active
                                    ? 'parent.telemetrySessionLastActivity'
                                    : 'parent.telemetrySessionEnd',
                                )}
                                : {time(session.endedAt)}
                                {session.active
                                  ? ` · ${t('parent.telemetrySessionActive')}`
                                  : ''}
                              </Typography>
                            </Stack>
                            <VideoTable videos={session.videos} />
                          </Stack>
                        ))}
                      </Stack>
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
            <Pagination
              count={weekCount}
              page={weekOffset + 1}
              onChange={(_, page) => setWeekOffset(page - 1)}
              aria-label={t('parent.telemetryWeeks')}
              sx={{ alignSelf: 'center', pt: 1 }}
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
              <VideoTable videos={viewedVideos} showViews />
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
  uncategorizedLabel,
  videoCategories,
}: {
  days: TelemetryReport['daily'];
  label: string;
  viewsLabel: string;
  legacyLabel: string;
  uncategorizedLabel: string;
  videoCategories: Record<string, VideoCategory>;
}) {
  const theme = useTheme();
  const data = days.map((day) => ({
    date: day.date,
    day: day.date.slice(5),
    minutes: day.seconds / 60,
    views: day.views,
    segments: categorySegments(day.videos ?? [], videoCategories),
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
                const day = data.find(
                  (day) => day.date === payload[0]?.payload.date,
                );
                if (!day) return null;
                return (
                  <Paper sx={{ p: 1.5, maxWidth: 280 }}>
                    <Typography fontWeight={700}>{day.date}</Typography>
                    {[
                      ...day.segments,
                      ...(day.legacy > 0
                        ? [
                            {
                              id: 'legacy',
                              name: legacyLabel,
                              color: theme.palette.text.disabled,
                              minutes: day.legacy,
                            },
                          ]
                        : []),
                    ].map((category) => (
                      <Typography
                        key={category.id}
                        variant="body2"
                        sx={{ mt: 0.5, overflowWrap: 'anywhere' }}
                      >
                        <Box
                          component="span"
                          aria-hidden="true"
                          sx={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor:
                              category.color ?? theme.palette.primary.main,
                            mr: 0.75,
                            verticalAlign: 'middle',
                          }}
                        />
                        <Box component="span" sx={{ fontWeight: 700 }}>
                          {category.name || uncategorizedLabel}
                        </Box>
                        : {formatDuration(category.minutes * 60)} ·{' '}
                        {day.minutes > 0
                          ? Math.round((category.minutes / day.minutes) * 100)
                          : 0}
                        %
                      </Typography>
                    ))}
                  </Paper>
                );
              }}
            />
            {Array.from(
              {
                length: Math.max(0, ...data.map((day) => day.segments.length)),
              },
              (_, index) => (
                <Bar
                  key={index}
                  dataKey={(day) => day.segments[index]?.minutes ?? 0}
                  stackId="time"
                  stroke={theme.palette.background.paper}
                  strokeWidth={1}
                >
                  {data.map((day) => (
                    <Cell
                      key={day.date}
                      fill={
                        day.segments[index]?.color ?? theme.palette.primary.main
                      }
                    />
                  ))}
                </Bar>
              ),
            )}
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

function VideoTable({
  videos,
  showViews = false,
}: {
  videos: (
    | TelemetryReport['videos'][number]
    | TelemetryReport['sessions'][number]['videos'][number]
  )[];
  showViews?: boolean;
}) {
  const { t } = useTranslation();
  return (
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
            {showViews && (
              <TableCell align="right" sx={{ width: { xs: 64, sm: 88 } }}>
                <VisibilityRoundedIcon
                  titleAccess={t('parent.telemetryViews')}
                  fontSize="small"
                  color="action"
                  sx={{ verticalAlign: 'middle' }}
                />
              </TableCell>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {videos.map((video) => (
            <TableRow key={'id' in video ? video.id : video.mediaId}>
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
              {showViews && (
                <TableCell align="right">
                  <Typography component="span" variant="h5">
                    {'views' in video ? video.views : ''}
                  </Typography>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
