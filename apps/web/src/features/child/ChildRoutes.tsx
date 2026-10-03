import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import WavingHandRoundedIcon from '@mui/icons-material/WavingHandRounded';
import {
  MediaControlBar,
  MediaController,
  MediaTimeRange,
} from 'media-chrome/react';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  SvgIcon,
  Stack,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { Category, ChildMedia } from '@wawatube/shared';
import { api, errorText } from '../../api';
import {
  ChildBrand,
  ChildFrame,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/Shared';
import { SmartDisplay } from '@mui/icons-material';
import {
  clearTelemetrySession,
  createTelemetryId,
  getTelemetrySessionId,
  touchTelemetrySession,
} from './telemetry';

export const THUMBNAIL_RETRY_DELAYS_MS = [1000, 3000, 10000] as const;

function BackButton({
  to = '/',
  onExit,
}: {
  to?: string;
  onExit?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      component={Link}
      to={to}
      onClick={() => {
        onExit?.();
      }}
      variant="contained"
      size="large"
      startIcon={<ArrowBackRoundedIcon sx={{ fontSize: '2rem' }} />}
      sx={{ mb: 4, minHeight: 64, px: 3, fontSize: '1.25rem', borderRadius: 3 }}
    >
      {t('nav.back')}
    </Button>
  );
}

export function thumbnailRetryUrl(url: string, retry: number): string {
  if (url.startsWith('data:')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}thumbnail=v2${
    retry > 0 ? `&thumbnail-retry=${retry}` : ''
  }`;
}

function useThumbnailRetry(url: string | null) {
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(!url);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, []);

  const handleError = () => {
    const delay = THUMBNAIL_RETRY_DELAYS_MS[retry];
    if (delay === undefined) {
      setFailed(true);
      return;
    }
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setRetry((current) => current + 1);
    }, delay);
  };

  return {
    failed,
    onError: handleError,
    src: url ? thumbnailRetryUrl(url, retry) : null,
  };
}

export function ChildHome() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setError(null);
    void api
      .childCategories()
      .then(setCategories)
      .catch((reason: unknown) => setError(errorText(reason, t)));
  };
  useEffect(() => {
    let active = true;
    void api
      .childCategories()
      .then((data) => {
        if (active) {
          setCategories(data);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason, t));
      });
    return () => {
      active = false;
    };
  }, [t]);

  return (
    <ChildFrame>
      <Container
        maxWidth="xl"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          py: { xs: 3, md: 5 },
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          sx={{
            width: '100%',
            maxWidth: 1200,
            mx: 'auto',
            mb: { xs: 4, md: 6 },
          }}
        >
          <ChildBrand />
          <Typography
            variant="h1"
            sx={{ fontSize: { xs: '2.5rem', md: '4.4rem' }, lineHeight: 1 }}
          >
            {t('app.greeting')}
          </Typography>
        </Stack>
        {error ? (
          <ErrorState message={error} retry={load} childFriendly />
        ) : categories === null ? (
          <LoadingState />
        ) : null}
        {categories?.length === 0 ? (
          <EmptyState text={t('child.emptyCategories')} />
        ) : (
          <Box
            sx={{
              display: 'grid',
              width: '100%',
              maxWidth: 1200,
              mx: 'auto',
              gridTemplateColumns:
                'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
              gap: 3,
            }}
          >
            {categories?.map((category, index) => (
              <CategoryCard
                category={category}
                index={index}
                key={category.id}
              />
            ))}
          </Box>
        )}
      </Container>
    </ChildFrame>
  );
}

export function ChildCategoryRoute() {
  const { categoryId } = useParams();
  return <ChildCategory key={categoryId ?? 'missing'} />;
}

function CategoryCard({
  category,
  index,
}: {
  category: Category;
  index: number;
}) {
  const theme = useTheme();
  const colors = theme.palette.artwork.category;
  return (
    <Card sx={{ backgroundColor: colors[index % colors.length] }}>
      <CardActionArea
        component={Link}
        to={`/category/${category.id}`}
        sx={{ position: 'relative', aspectRatio: '16 / 9', minHeight: 190 }}
      >
        <CategoryThumbnail
          category={category}
          key={category.thumbnailUrl ?? 'emoji'}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 'auto 0 0',
            pt: 5,
            px: 2.5,
            pb: 2,
            background: (theme) => theme.palette.artwork.categoryOverlay,
          }}
        >
          <Typography
            variant="h4"
            sx={{
              color: (theme) => theme.palette.artwork.onOverlay,
              fontWeight: 800,
              overflowWrap: 'anywhere',
            }}
          >
            {category.name}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}

function CategoryThumbnail({ category }: { category: Category }) {
  const { t } = useTranslation();
  const thumbnail = useThumbnailRetry(category.thumbnailUrl);
  if (thumbnail.failed) {
    return (
      <Typography
        component="span"
        aria-label={t('a11y.categoryIcon')}
        sx={{
          fontSize: '3.4rem',
          display: 'block',
          textAlign: 'center',
          pb: 5,
        }}
      >
        {category.icon || '✨'}
      </Typography>
    );
  }
  return (
    <Box
      component="img"
      src={thumbnail.src ?? undefined}
      alt={t('a11y.categoryThumbnail', { title: category.name })}
      onError={thumbnail.onError}
      sx={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      }}
    />
  );
}

export function ChildCategory() {
  const { t } = useTranslation();
  const { categoryId } = useParams();
  const [result, setResult] = useState<{
    category: Category;
    media: ChildMedia[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    if (!categoryId) return;
    setError(null);
    void api
      .childCategoryMedia(categoryId)
      .then(setResult)
      .catch((reason: unknown) => setError(errorText(reason, t)));
  };
  useEffect(() => {
    if (!categoryId) return undefined;
    let active = true;
    void api
      .childCategoryMedia(categoryId)
      .then((data) => {
        if (active) {
          setResult(data);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason, t));
      });
    return () => {
      active = false;
    };
  }, [categoryId, t]);

  return (
    <ChildFrame>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <BackButton />
        {error ? (
          <ErrorState message={error} retry={load} childFriendly />
        ) : result === null ? (
          <LoadingState />
        ) : null}
        {result ? (
          <>
            <Stack spacing={1} sx={{ mb: 4 }}>
              <Typography
                variant="h1"
                sx={{ fontSize: { xs: '2.5rem', md: '4rem' } }}
              >
                {result.category.icon} {result.category.name}
              </Typography>
            </Stack>
            {result.media.length === 0 ? (
              <EmptyState text={t('child.emptyMedia')} />
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
                  gap: 3,
                }}
              >
                {result.media.map((media) => (
                  <MediaCard
                    key={media.id}
                    media={media}
                    categoryId={result.category.id}
                  />
                ))}
              </Box>
            )}
          </>
        ) : null}
      </Container>
    </ChildFrame>
  );
}

function MediaCard({
  media,
  categoryId,
}: {
  media: ChildMedia;
  categoryId: string;
}) {
  return (
    <Card>
      <CardActionArea
        component={Link}
        to={`/watch/${media.id}`}
        state={{ categoryId, autoFullscreen: true }}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          void document.documentElement.requestFullscreen?.().catch(() => {});
        }}
      >
        <MediaThumbnail key={media.thumbnailUrl ?? 'fallback'} media={media} />
        <CardContent>
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}
          >
            {media.title}
          </Typography>
          {media.durationSeconds !== null ? (
            <Typography variant="body2" color="text.secondary">
              {formatDuration(media.durationSeconds)}
            </Typography>
          ) : null}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export function MediaThumbnail({ media }: { media: ChildMedia }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const thumbnail = useThumbnailRetry(media.thumbnailUrl);
  if (thumbnail.failed) {
    return (
      <Box
        role="img"
        aria-label={t('child.noThumbnail')}
        sx={{
          display: 'grid',
          placeItems: 'center',
          width: '100%',
          aspectRatio: '16 / 9',
          background: theme.palette.artwork.thumbnail,
        }}
      >
        <SvgIcon aria-hidden sx={{ fontSize: 64 }}>
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5 11 16.51 14.5 12l4.5 6H5l3.5-4.5zM8 8.5A1.5 1.5 0 1 0 8 11.5 1.5 1.5 0 0 0 8 8.5z" />
        </SvgIcon>
      </Box>
    );
  }
  return (
    <Box
      component="img"
      src={thumbnail.src ?? undefined}
      alt={t('a11y.thumbnail', { title: media.title })}
      onError={thumbnail.onError}
      sx={{
        display: 'block',
        width: '100%',
        aspectRatio: '16 / 9',
        objectFit: 'cover',
      }}
    />
  );
}

export function ChildPlayer() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { mediaId } = useParams();
  const location = useLocation();
  const playerState = location.state as {
    categoryId?: unknown;
    autoFullscreen?: unknown;
  } | null;
  const categoryId = playerState?.categoryId;
  const backTo =
    typeof categoryId === 'string' ? `/category/${categoryId}` : '/';
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTap = useRef<{ at: number; side: 'left' | 'right' } | null>(null);
  const [expanded, setExpanded] = useState(
    playerState?.autoFullscreen === true,
  );
  const [playing, setPlaying] = useState(false);
  const [media, setMedia] = useState<ChildMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState<'watching' | 'choice' | 'goodbye'>(
    'watching',
  );
  const viewedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const viewIdRef = useRef<string | null>(null);
  const watchedSecondsRef = useRef(0);
  const endedRef = useRef(false);
  const playingSinceRef = useRef<number | null>(null);
  const pendingSecondsRef = useRef(0);

  if (sessionIdRef.current === null)
    sessionIdRef.current = getTelemetrySessionId();
  if (viewIdRef.current === null) viewIdRef.current = createTelemetryId();

  const recordTelemetry = useCallback(
    (
      views: 0 | 1,
      seconds: number,
      { completed = false, ended = false } = {},
    ) => {
      const sessionId = sessionIdRef.current;
      const viewId = viewIdRef.current;
      if (!mediaId || !sessionId || !viewId) return;
      if (views === 0 && seconds <= 0 && !completed && !ended) return;
      if ((completed || ended) && !viewedRef.current) return;
      if (!ended) touchTelemetrySession(sessionId);
      void api
        .childTelemetry(mediaId, {
          views,
          seconds: Math.min(30, Math.max(0, Math.floor(seconds))),
          sessionId,
          viewId,
          watchedSeconds: watchedSecondsRef.current,
          completed,
          ended,
        })
        .catch(() => {});
    },
    [mediaId],
  );

  const flushTelemetry = useCallback(
    ({
      stop = true,
      completed = false,
      ended = false,
    }: { stop?: boolean; completed?: boolean; ended?: boolean } = {}) => {
      const since = playingSinceRef.current;
      if (since !== null) {
        const now = Date.now();
        pendingSecondsRef.current += Math.max(0, (now - since) / 1000);
        playingSinceRef.current = stop ? null : now;
      }
      let seconds = Math.floor(pendingSecondsRef.current);
      pendingSecondsRef.current -= seconds;
      if (seconds === 0 && (completed || ended))
        recordTelemetry(0, 0, { completed, ended });
      while (seconds > 0) {
        const batch = Math.min(30, seconds);
        watchedSecondsRef.current += batch;
        seconds -= batch;
        recordTelemetry(0, batch, {
          completed: completed && seconds === 0,
          ended: ended && seconds === 0,
        });
      }
    },
    [recordTelemetry],
  );

  const endCurrentView = () => {
    const sessionId = sessionIdRef.current;
    const viewId = viewIdRef.current;
    if (!mediaId || !sessionId || !viewId || !viewedRef.current) return;
    void api
      .childTelemetry(mediaId, {
        views: 0,
        seconds: 0,
        sessionId,
        viewId,
        watchedSeconds: watchedSecondsRef.current,
        completed: false,
        ended: true,
      })
      .catch(() => {});
  };

  const refreshTelemetrySession = () => {
    const sessionId = getTelemetrySessionId();
    if (sessionId === sessionIdRef.current) return;
    endCurrentView();
    sessionIdRef.current = sessionId;
    viewIdRef.current = createTelemetryId();
    watchedSecondsRef.current = 0;
    pendingSecondsRef.current = 0;
    viewedRef.current = false;
    endedRef.current = false;
  };

  const beginPlayback = () => {
    refreshTelemetrySession();
    if (!endedRef.current) return;
    viewIdRef.current = createTelemetryId();
    watchedSecondsRef.current = 0;
    pendingSecondsRef.current = 0;
    viewedRef.current = false;
    endedRef.current = false;
  };

  const handlePlay = () => {
    beginPlayback();
    setPlaying(true);
  };

  const handlePlaying = () => {
    beginPlayback();
    if (!viewedRef.current) {
      viewedRef.current = true;
      recordTelemetry(1, 0);
    }
    playingSinceRef.current ??= Date.now();
    setPlaying(true);
  };

  useEffect(() => {
    viewedRef.current = false;
    watchedSecondsRef.current = 0;
    endedRef.current = false;
    playingSinceRef.current = null;
    pendingSecondsRef.current = 0;
  }, [mediaId]);
  useEffect(() => {
    if (!playing) return undefined;
    const interval = window.setInterval(
      () => flushTelemetry({ stop: false }),
      10_000,
    );
    return () => window.clearInterval(interval);
  }, [flushTelemetry, playing]);
  useEffect(() => {
    const flush = () => flushTelemetry({ ended: true });
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flushTelemetry({ ended: true });
    };
  }, [flushTelemetry]);
  useEffect(() => {
    const syncFullscreen = () =>
      setExpanded(
        document.fullscreenElement === document.documentElement ||
          (playerRef.current !== null &&
            document.fullscreenElement === playerRef.current),
      );
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () =>
      document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  useEffect(() => {
    if (!expanded && ending === 'watching') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const exitWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) {
        setExpanded(false);
      }
    };
    document.addEventListener('keydown', exitWithEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', exitWithEscape);
    };
  }, [expanded, ending]);

  const toggleFullscreen = async () => {
    if (expanded) {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      } else {
        setExpanded(false);
      }
      return;
    }
    setExpanded(true);
    // Keep video and overlay in one fullscreen element; ending must not exit it.
    // Browsers without element fullscreen keep the same layout within the window.
    await playerRef.current?.requestFullscreen?.().catch(() => {});
  };
  const load = () => {
    if (!mediaId) return;
    setError(null);
    void api
      .childMedia(mediaId)
      .then(setMedia)
      .catch((reason: unknown) => setError(errorText(reason, t)));
  };
  useEffect(() => {
    if (!mediaId) return undefined;
    let active = true;
    void api
      .childMedia(mediaId)
      .then((data) => {
        if (active) {
          setMedia(data);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason, t));
      });
    return () => {
      active = false;
    };
  }, [mediaId, t]);

  return (
    <ChildFrame>
      <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
        <BackButton
          to={backTo}
          onExit={() => flushTelemetry({ ended: true })}
        />
        {error ? (
          <ErrorState message={error} retry={load} childFriendly />
        ) : media === null ? (
          <LoadingState />
        ) : null}
        {media ? (
          <Stack spacing={2}>
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '2.1rem', md: '3.5rem' },
                overflowWrap: 'anywhere',
              }}
            >
              {media.title}
            </Typography>
            <Box
              ref={playerRef}
              sx={{
                position: expanded ? 'fixed' : 'relative',
                ...(expanded && {
                  inset: 0,
                  '&&': { margin: 0 },
                  zIndex: (theme) => theme.zIndex.modal + 1,
                  height: '100dvh',
                }),
                backgroundColor: (theme) => theme.palette.artwork.player,
                borderRadius: expanded ? 0 : '16px',
                overflow: 'hidden',
              }}
            >
              <MediaController
                style={{
                  display: 'block',
                  width: '100%',
                  height: expanded ? '100%' : undefined,
                }}
              >
                <Box
                  component="video"
                  ref={videoRef}
                  slot="media"
                  src={media.playbackUrl}
                  poster={media.thumbnailUrl ?? undefined}
                  autoPlay
                  playsInline
                  onPlay={handlePlay}
                  onPlaying={handlePlaying}
                  onPause={() => {
                    flushTelemetry();
                    setPlaying(false);
                  }}
                  onWaiting={() => {
                    flushTelemetry();
                    setPlaying(false);
                  }}
                  onStalled={() => {
                    flushTelemetry();
                    setPlaying(false);
                  }}
                  onEnded={() => {
                    endedRef.current = true;
                    flushTelemetry({ ended: true, completed: true });
                    setEnding('choice');
                    setPlaying(false);
                  }}
                  aria-label={t('child.playerLabel')}
                  onError={() => setError(t('child.playerError'))}
                  onPointerUp={(event) => {
                    const video = videoRef.current;
                    if (!video) return;
                    const bounds = video.getBoundingClientRect();
                    const side =
                      event.clientX < bounds.left + bounds.width / 2
                        ? 'left'
                        : 'right';
                    const now = Date.now();
                    if (
                      lastTap.current?.side === side &&
                      now - lastTap.current.at < 350
                    ) {
                      video.currentTime =
                        side === 'left'
                          ? Math.max(0, video.currentTime - 10)
                          : Math.min(
                              Number.isFinite(video.duration)
                                ? video.duration
                                : video.currentTime + 10,
                              video.currentTime + 10,
                            );
                      lastTap.current = null;
                    } else lastTap.current = { at: now, side };
                  }}
                  sx={{
                    display: 'block',
                    width: '100%',
                    height: expanded ? '100%' : 'auto',
                    maxHeight: expanded
                      ? 'none'
                      : 'min(72vh, max(240px, calc(100dvh - 350px)))',
                    touchAction: 'manipulation',
                  }}
                />
                {ending === 'watching' && (
                  <MediaControlBar
                    style={{
                      padding: '8px 16px',
                      background: theme.palette.artwork.fullscreenOverlay,
                    }}
                  >
                    <MediaTimeRange
                      aria-label={t('child.seek')}
                      style={
                        {
                          width: '100%',
                          height: 48,
                          '--media-range-track-height': '10px',
                          '--media-range-thumb-width': '24px',
                          '--media-range-thumb-height': '24px',
                        } as CSSProperties
                      }
                    />
                  </MediaControlBar>
                )}
                {ending === 'watching' && (
                  <IconButton
                    onClick={() => {
                      const video = videoRef.current;
                      if (!video) return;
                      if (video.paused)
                        void video
                          .play()
                          .catch(() => setError(t('child.playerError')));
                      else video.pause();
                    }}
                    aria-label={t(playing ? 'child.pause' : 'child.play')}
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 112,
                      height: 112,
                      bgcolor: playing ? 'secondary.main' : 'primary.main',
                      color: playing
                        ? 'secondary.contrastText'
                        : 'primary.contrastText',
                      '&:hover': {
                        bgcolor: playing ? 'secondary.dark' : 'primary.dark',
                      },
                    }}
                  >
                    <SvgIcon aria-hidden sx={{ fontSize: 72 }}>
                      <path
                        d={
                          playing
                            ? 'M6 4h4v16H6zm8 0h4v16h-4z'
                            : 'M8 5v14l11-7z'
                        }
                      />
                    </SvgIcon>
                  </IconButton>
                )}
                {ending === 'watching' && (
                  <IconButton
                    onClick={() => void toggleFullscreen()}
                    aria-label={t(
                      expanded ? 'child.exitFullscreen' : 'child.fullscreen',
                    )}
                    sx={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      width: 64,
                      height: 64,
                      backgroundColor: (theme) =>
                        theme.palette.artwork.fullscreenOverlay,
                      color: (theme) => theme.palette.artwork.onOverlay,
                      '&:hover': {
                        backgroundColor: (theme) =>
                          theme.palette.artwork.fullscreenOverlayHover,
                      },
                    }}
                  >
                    <SvgIcon aria-hidden sx={{ fontSize: 32 }}>
                      <path
                        d={
                          expanded
                            ? 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z'
                            : 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z'
                        }
                      />
                    </SvgIcon>
                  </IconButton>
                )}
              </MediaController>
              <Dialog
                open={ending !== 'watching'}
                fullScreen
                container={() => playerRef.current}
                disableEscapeKeyDown
                aria-labelledby="video-ending-title"
                slotProps={{
                  paper: {
                    sx: {
                      justifyContent: 'center',
                      alignItems: 'center',
                      textAlign: 'center',
                      p: 3,
                    },
                  },
                }}
              >
                <DialogTitle
                  id="video-ending-title"
                  sx={{
                    fontSize: { xs: '2rem', sm: '3.5rem' },
                    fontWeight: 800,
                  }}
                >
                  {t(
                    ending === 'goodbye'
                      ? 'child.goodbye'
                      : 'child.watchAnother',
                  )}
                </DialogTitle>
                <DialogContent
                  sx={{ flex: '0 0 auto', width: '100%', maxWidth: 600 }}
                >
                  {ending === 'choice' ? (
                    <Stack direction="row" spacing={3}>
                      <Button
                        autoFocus
                        component={Link}
                        to="/"
                        replace
                        variant="contained"
                        aria-label={t('child.watchAnotherShort')}
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: 144,
                          backgroundColor: 'success.main',
                          color: (theme) => theme.palette.artwork.onOverlay,
                          '&:hover': { backgroundColor: 'success.dark' },
                        }}
                      >
                        <Stack alignItems="center" spacing={1}>
                          <Box
                            aria-hidden
                            sx={{
                              height: 80,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <SmartDisplay sx={{ fontSize: 72 }} />
                          </Box>
                          <Typography sx={{ fontWeight: 800 }}>
                            {t('child.watchAnotherShort')}
                          </Typography>
                        </Stack>
                      </Button>
                      <Button
                        variant="contained"
                        aria-label={t('child.finish')}
                        onClick={() => {
                          clearTelemetrySession();
                          setEnding('goodbye');
                        }}
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: 144,
                          backgroundColor: 'error.main',
                          color: (theme) => theme.palette.artwork.onOverlay,
                          '&:hover': { backgroundColor: 'error.dark' },
                        }}
                      >
                        <Stack alignItems="center" spacing={1}>
                          <Box
                            aria-hidden
                            sx={{
                              height: 80,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <WavingHandRoundedIcon sx={{ fontSize: 72 }} />
                          </Box>
                          <Typography sx={{ fontWeight: 800 }}>
                            {t('child.finish')}
                          </Typography>
                        </Stack>
                      </Button>
                    </Stack>
                  ) : (
                    <Box
                      role="img"
                      aria-label={t('child.goodbye')}
                      sx={{ position: 'relative', display: 'inline-block' }}
                    >
                      <Box
                        component="img"
                        src="/logo-child.webp"
                        alt=""
                        sx={{
                          width: { xs: 200, sm: 280 },
                          maxWidth: '100%',
                          animation: 'mascotBob 2.4s ease-in-out infinite',
                          '@keyframes mascotBob': {
                            '0%, 100%': { transform: 'translateY(0)' },
                            '50%': { transform: 'translateY(-7px)' },
                          },
                          '@media (prefers-reduced-motion: reduce)': {
                            animation: 'none',
                          },
                        }}
                      />
                      <WavingHandRoundedIcon
                        aria-hidden="true"
                        sx={{
                          position: 'absolute',
                          right: { xs: -15, sm: -22 },
                          top: { xs: 32, sm: 44 },
                          fontSize: { xs: 64, sm: 86 },
                          color: '#ffc627',
                          filter: 'drop-shadow(0 3px 0 #075678)',
                          transformOrigin: '25% 90%',
                          animation: 'mascotWave 2.4s ease-in-out infinite',
                          '@keyframes mascotWave': {
                            '0%, 45%, 100%': { transform: 'rotate(0deg)' },
                            '55%, 75%': { transform: 'rotate(-22deg)' },
                            '65%, 85%': { transform: 'rotate(12deg)' },
                          },
                          '@media (prefers-reduced-motion: reduce)': {
                            animation: 'none',
                          },
                        }}
                      />
                    </Box>
                  )}
                </DialogContent>
              </Dialog>
            </Box>
          </Stack>
        ) : null}
      </Container>
    </ChildFrame>
  );
}

export function ChildPlayerRoute() {
  const { mediaId } = useParams();
  return <ChildPlayer key={mediaId ?? 'missing'} />;
}

function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remaining = totalSeconds % 60;
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}
