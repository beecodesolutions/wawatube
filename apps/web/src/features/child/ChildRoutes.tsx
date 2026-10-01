import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Container,
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
  const [failed, setFailed] = useState(false);
  if (!category.thumbnailUrl || failed) {
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
      src={category.thumbnailUrl}
      alt={t('a11y.categoryThumbnail', { title: category.name })}
      onError={() => setFailed(true)}
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
        <MediaThumbnail media={media} />
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

function MediaThumbnail({ media }: { media: ChildMedia }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  if (!media.thumbnailUrl || failed) {
    return (
      <Box
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
        <Typography color="text.secondary">{t('child.noThumbnail')}</Typography>
      </Box>
    );
  }
  return (
    <Box
      component="img"
      src={media.thumbnailUrl}
      alt={t('a11y.thumbnail', { title: media.title })}
      onError={() => setFailed(true)}
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
  const [media, setMedia] = useState<ChildMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
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
              component="video"
              src={media.playbackUrl}
              poster={media.thumbnailUrl ?? undefined}
              controls
              playsInline
              aria-label={t('child.playerLabel')}
              onError={() => setError(t('child.playerError'))}
              sx={{
                width: '100%',
                maxHeight: '72vh',
                borderRadius: '16px',
                backgroundColor: '#17232a',
              }}
            />
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
