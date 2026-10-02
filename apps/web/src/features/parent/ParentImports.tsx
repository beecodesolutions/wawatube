import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type {
  Category,
  ImportJob,
  LocalCandidate,
  PlaylistImportJob,
  PlaylistImportRequest,
} from '@wawatube/shared';
import { api, errorText } from '../../api';

export function CategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <FormControl fullWidth>
      <InputLabel>{t('parent.categoriesField')}</InputLabel>
      <Select
        multiple
        value={value}
        label={t('parent.categoriesField')}
        onChange={(event) =>
          onChange(
            typeof event.target.value === 'string'
              ? event.target.value.split(',')
              : event.target.value,
          )
        }
        renderValue={(selected) =>
          categories
            .filter((category) => selected.includes(category.id))
            .map((category) => category.name)
            .join(', ')
        }
      >
        {categories.map((category) => (
          <MenuItem key={category.id} value={category.id}>
            <Checkbox checked={value.includes(category.id)} />
            <Typography>{category.name}</Typography>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export function YoutubeImporter({
  categories,
  onComplete,
  initialJob = null,
}: {
  categories: Category[];
  onComplete: () => void;
  initialJob?: ImportJob | null;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [mode, setMode] = useState<'video' | 'playlist'>('video');
  const [url, setUrl] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [job, setJob] = useState<ImportJob | null>(initialJob);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [playlistCategoryId, setPlaylistCategoryId] = useState('');
  const [visible, setVisible] = useState(true);
  const [playlistVisible, setPlaylistVisible] = useState(true);
  const [playlistMonitor, setPlaylistMonitor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlistSuccess, setPlaylistSuccess] = useState(false);
  const [previewThumbnailFailed, setPreviewThumbnailFailed] = useState(false);
  const preview = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setJob(await api.importYoutube(url));
      setPreviewThumbnailFailed(false);
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  const importPlaylist = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setPlaylistSuccess(false);
    const input: PlaylistImportRequest = {
      url: playlistUrl,
      visible: playlistVisible,
      monitor: playlistMonitor,
      ...(playlistCategoryId ? { categoryId: playlistCategoryId } : {}),
    };
    try {
      const result = await api.importYoutubePlaylist(input);
      if (result.state !== 'FAILED') {
        setPlaylistUrl('');
        setPlaylistSuccess(true);
      }
      onComplete();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await api.confirmImport(job.id, { categoryIds, visible }));
      onComplete();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper component="section" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Stack spacing={0.5}>
          <Typography variant="h5">{t('parent.youtubeTitle')}</Typography>
          <Typography color="text.secondary">
            {mode === 'video'
              ? t('parent.youtubeHint')
              : t('parent.playlistHint')}
          </Typography>
        </Stack>
        <FormControl component="fieldset" disabled={busy}>
          <FormLabel component="legend">{t('parent.importMode')}</FormLabel>
          <RadioGroup
            row
            value={mode}
            onChange={(event) => {
              const nextMode = event.target.value;
              if (nextMode === 'video' || nextMode === 'playlist')
                setMode(nextMode);
              setError(null);
              setPlaylistSuccess(false);
            }}
          >
            <FormControlLabel
              value="video"
              control={<Radio />}
              label={t('parent.videoMode')}
            />
            <FormControlLabel
              value="playlist"
              control={<Radio />}
              label={t('parent.playlistMode')}
            />
          </RadioGroup>
        </FormControl>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {playlistSuccess ? (
          <Alert severity="success">{t('parent.playlistSuccess')}</Alert>
        ) : null}
        {mode === 'video' && !job ? (
          <Box component="form" onSubmit={preview}>
            <Stack spacing={2}>
              <TextField
                fullWidth
                required
                label={t('parent.youtubeUrl')}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={t('parent.youtubePlaceholder')}
              />
              <Button type="submit" variant="contained" disabled={busy}>
                {busy ? (
                  <CircularProgress size={22} color="inherit" />
                ) : (
                  t('parent.preview')
                )}
              </Button>
              <Typography color="text.secondary" variant="body2">
                {t('parent.videoModeHint')}
              </Typography>
            </Stack>
          </Box>
        ) : mode === 'video' && job ? (
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              {t('parent.previewTitle')}
            </Typography>
            {job.thumbnailUrl && !previewThumbnailFailed ? (
              <Box
                component="img"
                src={api.importThumbnail(job.id)}
                alt={t('parent.importThumbnail')}
                onError={() => setPreviewThumbnailFailed(true)}
                sx={{
                  width: '100%',
                  aspectRatio: '16/9',
                  objectFit: 'cover',
                  borderRadius: 3,
                }}
              />
            ) : job.thumbnailUrl ? (
              <Box
                sx={{
                  display: 'grid',
                  placeItems: 'center',
                  width: '100%',
                  aspectRatio: '16/9',
                  background: theme.palette.artwork.thumbnail,
                }}
              >
                <Typography color="text.secondary">
                  {t('child.noThumbnail')}
                </Typography>
              </Box>
            ) : null}
            <Typography variant="h6">
              {job.title ?? t('common.notSet')}
            </Typography>
            <CategorySelect
              categories={categories}
              value={categoryIds}
              onChange={setCategoryIds}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={visible}
                  onChange={(event) => setVisible(event.target.checked)}
                />
              }
              label={t('parent.visibility')}
            />
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                onClick={() => {
                  void confirm();
                }}
                disabled={busy || categoryIds.length === 0}
              >
                {busy ? t('parent.confirming') : t('parent.confirm')}
              </Button>
              <Button onClick={() => setJob(null)}>{t('common.cancel')}</Button>
            </Stack>
          </Stack>
        ) : (
          <Box component="form" onSubmit={importPlaylist}>
            <Stack spacing={2}>
              <TextField
                fullWidth
                required
                label={t('parent.youtubeUrl')}
                value={playlistUrl}
                disabled={busy}
                onChange={(event) => setPlaylistUrl(event.target.value)}
                placeholder={t('parent.playlistPlaceholder')}
              />
              <FormControl fullWidth disabled={busy}>
                <InputLabel id="playlist-category-label">
                  {t('parent.playlistCategory')}
                </InputLabel>
                <Select
                  labelId="playlist-category-label"
                  label={t('parent.playlistCategory')}
                  value={playlistCategoryId}
                  onChange={(event) =>
                    setPlaylistCategoryId(event.target.value)
                  }
                >
                  <MenuItem value="">
                    <em>{t('parent.noCategory')}</em>
                  </MenuItem>
                  {categories.map((category) => (
                    <MenuItem key={category.id} value={category.id}>
                      {category.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography color="text.secondary" variant="body2">
                {t('parent.playlistCategoryHint')}
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={playlistVisible}
                    disabled={busy}
                    onChange={(event) =>
                      setPlaylistVisible(event.target.checked)
                    }
                  />
                }
                label={t('parent.visibility')}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={playlistMonitor}
                    disabled={busy}
                    onChange={(event) =>
                      setPlaylistMonitor(event.target.checked)
                    }
                  />
                }
                label={t('parent.playlistMonitor')}
              />
              <Button type="submit" variant="contained" disabled={busy}>
                {busy ? (
                  <CircularProgress size={22} color="inherit" />
                ) : (
                  t('parent.downloadPlaylist')
                )}
              </Button>
            </Stack>
          </Box>
        )}
      </Stack>
    </Paper>
  );
}

export function LocalImporter({
  categories,
  onComplete,
}: {
  categories: Category[];
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState<LocalCandidate[] | null>(null);
  const [selected, setSelected] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scan = async () => {
    setBusy(true);
    setError(null);
    try {
      setCandidates(await api.localCandidates());
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  const register = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.registerLocal(selected, categoryIds, visible);
      setSelected('');
      setCandidates(
        (items) => items?.filter((item) => item.sourceId !== selected) ?? [],
      );
      onComplete();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper component="section" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Stack spacing={0.5}>
          <Typography variant="h5">{t('parent.localTitle')}</Typography>
          <Typography color="text.secondary">
            {t('parent.localHint')}
          </Typography>
        </Stack>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Button
          variant="outlined"
          onClick={() => {
            void scan();
          }}
          disabled={busy}
        >
          {busy ? t('parent.scanning') : t('parent.scanLocal')}
        </Button>
        {candidates?.length === 0 ? (
          <Typography color="text.secondary">
            {t('parent.noCandidate')}
          </Typography>
        ) : null}
        {candidates?.map((candidate) => (
          <Button
            key={candidate.sourceId}
            variant={selected === candidate.sourceId ? 'contained' : 'text'}
            onClick={() => setSelected(candidate.sourceId)}
            sx={{ justifyContent: 'flex-start' }}
          >
            {candidate.title}
          </Button>
        ))}
        {selected ? (
          <Stack spacing={2}>
            <CategorySelect
              categories={categories}
              value={categoryIds}
              onChange={setCategoryIds}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={visible}
                  onChange={(event) => setVisible(event.target.checked)}
                />
              }
              label={t('parent.visibility')}
            />
            <Button
              variant="contained"
              onClick={() => {
                void register();
              }}
              disabled={busy || categoryIds.length === 0}
            >
              {t('parent.register')}
            </Button>
          </Stack>
        ) : candidates && candidates.length > 0 ? (
          <Typography color="text.secondary">
            {t('parent.noCandidate')}
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
}

export function ImportStatus({
  job,
  onChanged,
  onContinue,
}: {
  job: ImportJob;
  onChanged: () => void;
  onContinue?: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.retryImport(job.id);
      onChanged();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  const importError = job.errorCode
    ? t(`errors.${job.errorCode}`, { defaultValue: t('errors.import_failed') })
    : null;
  return (
    <Paper sx={{ p: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ sm: 'center' }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800 }}>
            {job.title ?? t('common.notSet')}
          </Typography>
          <Chip size="small" label={t(`status.${job.state}`)} />
          {importError ? (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {importError}
            </Typography>
          ) : null}
        </Box>
        {error ? <Typography color="error">{error}</Typography> : null}
        {onContinue ? (
          <Button onClick={onContinue}>{t('parent.continueImport')}</Button>
        ) : null}
        {job.state === 'FAILED' ? (
          <Button
            onClick={() => {
              void retry();
            }}
            disabled={busy}
          >
            {busy ? t('common.loading') : t('parent.retryDownload')}
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
}

export function PlaylistImportStatus({
  job,
  onChanged,
}: {
  job: PlaylistImportJob;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.retryPlaylistImport(job.id);
      onChanged();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  const setMonitor = async (monitor: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api.setPlaylistMonitor(job.id, monitor);
      onChanged();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  const importError = job.errorCode
    ? t(`errors.${job.errorCode}`, { defaultValue: t('errors.import_failed') })
    : null;
  const hasKnownTotal = job.videoCount > 0;
  const isComplete = hasKnownTotal && job.downloadedCount === job.videoCount;
  const statusLabel =
    job.state === 'EXTRACTING'
      ? t('status.EXTRACTING')
      : job.state === 'FAILED'
        ? t('status.FAILED')
        : isComplete
          ? t('parent.playlistCompleted')
          : job.failedCount > 0
            ? t('parent.playlistDownloadFailed')
            : t('parent.playlistDownloading');
  const progressValue = hasKnownTotal
    ? (job.downloadedCount / job.videoCount) * 100
    : undefined;
  return (
    <Paper sx={{ p: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ sm: 'center' }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800 }}>
            {job.title ?? t('parent.playlistFallbackTitle')}
          </Typography>
          <Chip size="small" label={statusLabel} />
          <FormControlLabel
            control={
              <Switch
                checked={job.monitor}
                disabled={busy}
                onChange={(event) => {
                  void setMonitor(event.target.checked);
                }}
              />
            }
            label={t('parent.playlistMonitor')}
          />
          {job.state === 'EXTRACTING' && !hasKnownTotal ? (
            <>
              <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                {t('parent.playlistExtractionUnknown')}
              </Typography>
              <LinearProgress
                aria-label={t('parent.playlistProgressLabel')}
                sx={{ mt: 1 }}
              />
            </>
          ) : null}
          {hasKnownTotal ? (
            <Stack spacing={0.75} sx={{ mt: 1 }}>
              <Typography color="text.secondary" variant="body2">
                {t('parent.playlistProgress', {
                  downloaded: job.downloadedCount,
                  total: job.videoCount,
                })}
              </Typography>
              <LinearProgress
                aria-label={t('parent.playlistProgressLabel')}
                variant="determinate"
                value={progressValue}
              />
              <Typography color="text.secondary" variant="body2">
                {t('parent.playlistProgressDetails', {
                  pending: job.pendingCount,
                  failed: job.failedCount,
                })}
              </Typography>
            </Stack>
          ) : null}
          {job.state === 'EXTRACTING' && hasKnownTotal ? (
            <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
              {t('parent.playlistPreparing')}
            </Typography>
          ) : null}
          {importError ? (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {importError}
            </Typography>
          ) : null}
        </Box>
        {error ? <Typography color="error">{error}</Typography> : null}
        {job.state === 'FAILED' ? (
          <Button
            onClick={() => {
              void retry();
            }}
            disabled={busy}
          >
            {busy ? t('common.loading') : t('parent.retryDownload')}
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
}
