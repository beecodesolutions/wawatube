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
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { Category, ImportJob, LocalCandidate } from '@wawatube/shared';
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
}: {
  categories: Category[];
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [job, setJob] = useState<ImportJob | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
            {t('parent.youtubeHint')}
          </Typography>
        </Stack>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {!job ? (
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
            </Stack>
          </Box>
        ) : (
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
                  background: 'linear-gradient(135deg, #d9e6f3, #f8d8c4)',
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
}: {
  job: ImportJob;
  onChanged: () => void;
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
