import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
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
  ChildFrame,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/Shared';

export const THUMBNAIL_RETRY_DELAYS_MS = [1000, 3000, 10000] as const;

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
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        <Stack spacing={1} sx={{ mb: { xs: 4, md: 6 }, maxWidth: 680 }}>
          <Typography
            variant="h1"
            sx={{ fontSize: { xs: '2.5rem', md: '4.4rem' }, lineHeight: 1 }}
          >
            {t('app.greeting')}
          </Typography>
          <Typography
            variant="h5"
            color="text.secondary"
            sx={{ fontWeight: 600 }}
          >
            {t('app.subtitle')}
          </Typography>
        </Stack>
        {error ? (
          <ErrorState message={error} retry={load} />
        ) : categories === null ? (
          <LoadingState />
        ) : null}
        {categories?.length === 0 ? (
          <EmptyState text={t('child.emptyCategories')} />
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(min(100%, 230px), 1fr))',
              gap: 2.5,
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
  const colors =
    theme.palette.mode === 'dark'
      ? ['#3b3033', '#29403f', '#293d4b', '#4a3e2d']
      : ['#f8d8c4', '#dcebdc', '#d9e6f3', '#f1e2ba'];
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
            background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.8))',
          }}
        >
          <Typography
            variant="h4"
            sx={{ color: '#fff', fontWeight: 800, overflowWrap: 'anywhere' }}
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
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
        <Button component={Link} to="/" color="inherit" sx={{ mb: 4 }}>
          ← {t('nav.back')}
        </Button>
        {error ? (
          <ErrorState message={error} retry={load} />
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
                    'repeat(auto-fill, minmax(min(100%, 270px), 1fr))',
                  gap: 2.5,
                }}
              >
                {result.media.map((media) => (
                  <MediaCard key={media.id} media={media} />
                ))}
              </Box>
            )}
          </>
        ) : null}
      </Container>
    </ChildFrame>
  );
}

function MediaCard({ media }: { media: ChildMedia }) {
  return (
    <Card>
      <CardActionArea component={Link} to={`/watch/${media.id}`}>
        <MediaThumbnail
          key={media.thumbnailUrl ?? 'fallback'}
          media={media}
        />
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
          background:
            theme.palette.mode === 'dark'
              ? 'linear-gradient(135deg, #23333e, #4b3940)'
              : 'linear-gradient(135deg, #d9e6f3, #f8d8c4)',
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
  const { mediaId } = useParams();
  const playerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [media, setMedia] = useState<ChildMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState<'watching' | 'choice' | 'goodbye'>(
    'watching',
  );
  useEffect(() => {
    const syncFullscreen = () =>
      setExpanded(
        playerRef.current !== null &&
          document.fullscreenElement === playerRef.current,
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
      if (document.fullscreenElement === playerRef.current) {
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
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
        <Button component={Link} to="/" color="inherit" sx={{ mb: 4 }}>
          ← {t('nav.back')}
        </Button>
        {error ? (
          <ErrorState message={error} retry={load} />
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
                backgroundColor: '#17232a',
                borderRadius: expanded ? 0 : '16px',
                overflow: 'hidden',
              }}
            >
              <Box
                component="video"
                src={media.playbackUrl}
                poster={media.thumbnailUrl ?? undefined}
                controls
                controlsList="nofullscreen"
                playsInline
                onEnded={() => setEnding('choice')}
                aria-label={t('child.playerLabel')}
                onError={() => setError(t('child.playerError'))}
                sx={{
                  display: 'block',
                  width: '100%',
                  height: expanded ? '100%' : 'auto',
                  maxHeight: expanded ? 'none' : '72vh',
                  '&::-webkit-media-controls-fullscreen-button': {
                    display: 'none',
                  },
                }}
              />
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
                    width: 56,
                    height: 56,
                    backgroundColor: 'rgba(0, 0, 0, 0.65)',
                    color: '#fff',
                    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.85)' },
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
                        aria-label={t('common.yes')}
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: 112,
                          backgroundColor: '#2e7d32',
                          color: '#fff',
                          '&:hover': { backgroundColor: '#1b5e20' },
                        }}
                      >
                        <SvgIcon aria-hidden sx={{ fontSize: 72 }}>
                          <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </SvgIcon>
                      </Button>
                      <Button
                        variant="contained"
                        aria-label={t('common.no')}
                        onClick={() => setEnding('goodbye')}
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: 112,
                          backgroundColor: '#c62828',
                          color: '#fff',
                          '&:hover': { backgroundColor: '#b71c1c' },
                        }}
                      >
                        <SvgIcon aria-hidden sx={{ fontSize: 72 }}>
                          <path d="m18.3 5.71-1.41-1.42L12 9.17 7.11 4.29 5.7 5.71 10.59 10.6 5.7 15.49l1.41 1.42L12 12.01l4.89 4.9 1.41-1.42-4.89-4.89z" />
                        </SvgIcon>
                      </Button>
                    </Stack>
                  ) : (
                    <Typography
                      component="p"
                      tabIndex={-1}
                      ref={(node: HTMLParagraphElement | null) => node?.focus()}
                      aria-label={t('child.goodbye')}
                      sx={{ fontSize: '5rem', outline: 'none' }}
                    >
                      <span aria-hidden>👋</span>
                    </Typography>
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
