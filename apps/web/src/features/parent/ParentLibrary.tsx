import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import YouTubeIcon from '@mui/icons-material/YouTube';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import type {
  AdminMedia,
  Category,
  ImportJob,
  LibraryResponse,
} from '@wawatube/shared';
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
  const [tab, setTab] = useState<'videos' | 'downloads'>('videos');
  const [adding, setAdding] = useState(false);
  const [importKey, setImportKey] = useState(0);
  const [selectedMedia, setSelectedMedia] = useState<AdminMedia | null>(null);
  const [selectedImport, setSelectedImport] = useState<ImportJob | null>(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'added' | 'views'>('added');
  const [refreshingPlaylists, setRefreshingPlaylists] = useState(false);
  const [playlistRefreshResult, setPlaylistRefreshResult] = useState<
    number | null
  >(null);
  const [playlistRefreshError, setPlaylistRefreshError] = useState<
    string | null
  >(null);
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
  const refreshAllPlaylists = async () => {
    setRefreshingPlaylists(true);
    setPlaylistRefreshError(null);
    setPlaylistRefreshResult(null);
    try {
      const result = await api.refreshAllPlaylists();
      setPlaylistRefreshResult(result.count);
      refresh();
    } catch (reason: unknown) {
      setPlaylistRefreshError(errorText(reason, t));
    } finally {
      setRefreshingPlaylists(false);
    }
  };
  const videos = library?.media
    .filter(
      (media) =>
        media.title
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()) &&
        (!categoryId || media.categoryIds.includes(categoryId)),
    )
    .sort((a, b) =>
      sortBy === 'name'
        ? a.title.localeCompare(b.title)
        : sortBy === 'views'
          ? b.views - a.views || a.title.localeCompare(b.title)
          : b.createdAt.localeCompare(a.createdAt),
    );
  const imports = library?.imports.filter((job) => job.state !== 'READY');
  const playlistImports = library?.playlistImports.filter(
    (job) =>
      job.state === 'EXTRACTING' ||
      job.state === 'FAILED' ||
      job.downloadedCount < job.videoCount,
  );
  const downloadsCount =
    (imports?.length ?? 0) + (playlistImports?.length ?? 0);

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
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        gap={2}
      >
        <Tabs
          value={tab}
          onChange={(_, value: 'videos' | 'downloads') => setTab(value)}
          aria-label={t('parent.librarySections')}
        >
          <Tab value="videos" label={t('parent.videosTab')} />
          <Tab value="downloads" label={t('parent.downloadsTab')} />
        </Tabs>
        <Button variant="contained" onClick={() => setAdding(true)}>
          {t('parent.addVideos')}
        </Button>
      </Stack>
      {tab === 'videos' && library ? (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label={t('parent.searchVideos')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              select
              label={t('parent.filterCategory')}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">{t('parent.allCategories')}</MenuItem>
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.icon} {category.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={t('parent.sortVideos')}
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value as 'name' | 'added' | 'views')
              }
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="name">{t('parent.sortName')}</MenuItem>
              <MenuItem value="added">{t('parent.sortAdded')}</MenuItem>
              <MenuItem value="views">{t('parent.sortViews')}</MenuItem>
            </TextField>
          </Stack>
          {videos?.length === 0 ? (
            <EmptyState
              text={
                library.media.length === 0
                  ? t('parent.noMedia')
                  : t('parent.noMatchingVideos')
              }
            />
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
                gap: 2,
              }}
            >
              {videos?.map((media) => (
                <Card key={media.id} component="article">
                  <CardActionArea
                    onClick={() => setSelectedMedia(media)}
                    aria-label={t('parent.editVideo', { title: media.title })}
                  >
                    <Box
                      sx={{
                        aspectRatio: '16 / 9',
                        bgcolor: 'action.hover',
                        display: 'grid',
                        placeItems: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {media.thumbnailUrl ? (
                        <Box
                          component="img"
                          src={media.thumbnailUrl}
                          alt=""
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        <Typography color="text.secondary">
                          {t('child.noThumbnail')}
                        </Typography>
                      )}
                    </Box>
                    <CardContent>
                      <Typography
                        fontWeight={800}
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {media.title}
                      </Typography>
                      <Stack
                        direction="row"
                        gap={0.5}
                        flexWrap="wrap"
                        sx={{ mt: 1 }}
                      >
                        {media.categoryIds.length ? (
                          media.categoryIds.map((id) => {
                            const category = categories.find(
                              (item) => item.id === id,
                            );
                            return category ? (
                              <Chip
                                key={id}
                                size="small"
                                label={`${category.icon} ${category.name}`}
                              />
                            ) : null;
                          })
                        ) : (
                          <Chip size="small" label={t('parent.noCategory')} />
                        )}
                        {media.availability !== 'AVAILABLE' ? (
                          <Chip
                            size="small"
                            color="warning"
                            label={t(`status.${media.availability}`)}
                          />
                        ) : null}
                      </Stack>
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1.5}
                        sx={{ mt: 1 }}
                      >
                        {media.sourceType === 'YOUTUBE' ? (
                          <YouTubeIcon
                            fontSize="small"
                            sx={{ color: '#f00' }}
                            aria-label={t('status.YOUTUBE')}
                          />
                        ) : (
                          <FolderRoundedIcon
                            fontSize="small"
                            color="primary"
                            aria-label={t('status.LOCAL')}
                          />
                        )}
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.5}
                          aria-label={t('parent.viewCount', {
                            count: media.views,
                          })}
                        >
                          <VisibilityRoundedIcon
                            fontSize="small"
                            color="action"
                          />
                          <Typography variant="body2" color="text.secondary">
                            {media.views}
                          </Typography>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              ))}
            </Box>
          )}
        </Stack>
      ) : null}
      {tab === 'downloads' && library ? (
        <Stack spacing={2}>
          {library.playlistImports.length ? (
            <Button
              variant="outlined"
              startIcon={<SyncRoundedIcon />}
              disabled={refreshingPlaylists}
              onClick={() => {
                void refreshAllPlaylists();
              }}
              sx={{ alignSelf: 'flex-start' }}
            >
              {refreshingPlaylists
                ? t('parent.refreshingPlaylists')
                : t('parent.refreshAllPlaylists')}
            </Button>
          ) : null}
          {playlistRefreshResult !== null ? (
            <Alert severity="success">
              {t('parent.playlistsQueued', { count: playlistRefreshResult })}
            </Alert>
          ) : null}
          {playlistRefreshError ? (
            <Alert severity="error">{playlistRefreshError}</Alert>
          ) : null}
          {downloadsCount === 0 && !library?.playlistImports.length ? (
            <EmptyState text={t('parent.noImports')} />
          ) : null}
          {imports?.map((job) => (
            <ImportStatus
              key={job.id}
              job={job}
              onChanged={refresh}
              onContinue={
                job.state === 'PREVIEW'
                  ? () => {
                      setSelectedImport(job);
                      setAdding(true);
                    }
                  : undefined
              }
            />
          ))}
          {library?.playlistImports.map((job) => (
            <PlaylistImportStatus key={job.id} job={job} onChanged={refresh} />
          ))}
        </Stack>
      ) : null}
      <Dialog
        open={adding}
        onClose={() => {
          setAdding(false);
          setSelectedImport(null);
        }}
        fullWidth
        maxWidth="md"
        keepMounted
      >
        <DialogTitle>{t('parent.addVideos')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <YoutubeImporter
              key={`${importKey}-${selectedImport?.id ?? 'new'}`}
              categories={categories}
              initialJob={selectedImport}
              onComplete={() => {
                refresh();
                setTab('downloads');
                setAdding(false);
                setSelectedImport(null);
                setImportKey((value) => value + 1);
              }}
            />
            <LocalImporter
              categories={categories}
              onComplete={() => {
                refresh();
                setAdding(false);
              }}
            />
          </Stack>
        </DialogContent>
      </Dialog>
      <Dialog
        open={selectedMedia !== null}
        onClose={() => setSelectedMedia(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t('parent.editMedia')}</DialogTitle>
        <DialogContent>
          {selectedMedia ? (
            <AdminMediaCard
              key={selectedMedia.id}
              media={selectedMedia}
              categories={categories}
              onChanged={() => {
                refresh();
                setSelectedMedia(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
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
