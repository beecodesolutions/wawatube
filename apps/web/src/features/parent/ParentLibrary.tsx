import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { AdminMedia, Category, LibraryResponse } from '@wawatube/shared';
import { api, errorText } from '../../api';
import { EmptyState, ErrorState, LoadingState } from '../../components/Shared';
import {
  CategorySelect,
  ImportStatus,
  LocalImporter,
  PlaylistImportStatus,
  YoutubeImporter,
} from './ParentImports';

export function AdminLibrary() {
  const { t } = useTranslation();
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await api.adminMedia();
        if (active) {
          setLibrary(data);
          setError(null);
        }
      } catch (reason: unknown) {
        if (active) setError(errorText(reason, t));
      }
    };
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 4000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refreshKey, t]);
  useEffect(() => {
    let active = true;
    void api
      .categories()
      .then((data) => {
        if (active) {
          setCategories(data);
          setCategoryError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) setCategoryError(errorText(reason, t));
      });
    return () => {
      active = false;
    };
  }, [refreshKey, t]);
  const refresh = () => setRefreshKey((value) => value + 1);

  return (
    <Stack spacing={4}>
      <Stack spacing={1}>
        <Typography
          variant="h1"
          sx={{ fontSize: { xs: '2.4rem', md: '3.6rem' } }}
        >
          {t('parent.libraryTitle')}
        </Typography>
        <Typography color="text.secondary">
          {t('parent.libraryHint')}
        </Typography>
      </Stack>
      {error ? <ErrorState message={error} retry={refresh} /> : null}
      {categoryError ? (
        <ErrorState message={categoryError} retry={refresh} />
      ) : null}
      {library ? <Stats library={library} /> : <LoadingState />}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(100%, 350px), 1fr))',
          gap: 2.5,
        }}
      >
        <YoutubeImporter categories={categories} onComplete={refresh} />
        <LocalImporter categories={categories} onComplete={refresh} />
      </Box>
      {library &&
      library.imports.length === 0 &&
      (library.playlistImports?.length ?? 0) === 0 ? (
        <EmptyState text={t('parent.noImports')} />
      ) : null}
      {library?.imports.map((job) => (
        <ImportStatus key={job.id} job={job} onChanged={refresh} />
      ))}
      {library?.playlistImports?.map((job) => (
        <PlaylistImportStatus key={job.id} job={job} onChanged={refresh} />
      ))}
      {library?.media.length === 0 ? (
        <EmptyState text={t('parent.noMedia')} />
      ) : null}
      <Stack spacing={2}>
        {library?.media.map((media) => (
          <AdminMediaCard
            key={media.id}
            media={media}
            categories={categories}
            onChanged={refresh}
          />
        ))}
      </Stack>
    </Stack>
  );
}

function Stats({ library }: { library: LibraryResponse }) {
  const { t } = useTranslation();
  const stats = [
    [t('parent.statsTotal'), library.counts.total],
    [t('parent.statsAvailable'), library.counts.available],
    [t('parent.statsDownloading'), library.counts.downloading],
    [t('parent.statsFailed'), library.counts.failed],
  ];
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 1.5,
      }}
    >
      {stats.map(([label, value]) => (
        <Paper key={label} sx={{ p: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 900 }}>
            {value}
          </Typography>
          <Typography color="text.secondary">{label}</Typography>
        </Paper>
      ))}
    </Box>
  );
}

function AdminMediaCard({
  media,
  categories,
  onChanged,
}: {
  media: AdminMedia;
  categories: Category[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(media.title);
  const [visible, setVisible] = useState(media.visible);
  const [categoryIds, setCategoryIds] = useState(media.categoryIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateMedia(media.id, { title, visible, categoryIds });
      onChanged();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteMedia(media.id);
      onChanged();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper component="article" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ sm: 'center' }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {media.title}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Chip size="small" label={t(`status.${media.sourceType}`)} />
              <Chip size="small" label={t(`status.${media.availability}`)} />
            </Stack>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={visible}
                onChange={(event) => setVisible(event.target.checked)}
                inputProps={{
                  'aria-label': t('a11y.toggleVisibility', {
                    title: media.title,
                  }),
                }}
              />
            }
            label={visible ? t('common.visible') : t('common.hidden')}
          />
        </Stack>
        <TextField
          fullWidth
          label={t('parent.mediaTitle')}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <CategorySelect
          categories={categories}
          value={categoryIds}
          onChange={setCategoryIds}
        />
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            variant="contained"
            onClick={() => {
              void save();
            }}
            disabled={busy}
          >
            {busy ? t('common.loading') : t('parent.saveMedia')}
          </Button>
          <Button
            color="error"
            onClick={() => {
              void remove();
            }}
            disabled={busy}
          >
            {t('parent.deleteMedia')}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
