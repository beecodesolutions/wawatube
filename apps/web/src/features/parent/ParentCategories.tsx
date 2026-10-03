import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AdminMedia, Category, CategoryInput } from '@wawatube/shared';
import { api, errorText } from '../../api';
import { useTheme } from '@mui/material/styles';
import { emojiColor } from './emoji-color';
import { EmptyState } from '../../components/Shared';

const automaticThumbnailValue = '__automatic__';

export function AdminCategories() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [categories, setCategories] = useState<Category[]>([]);
  const [media, setMedia] = useState<AdminMedia[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('✨');
  const [color, setColor] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState('0');
  const [thumbnailMediaId, setThumbnailMediaId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setError(null);
    void Promise.all([api.categories(), api.adminMedia()])
      .then(([categoryData, library]) => {
        setCategories(categoryData);
        setMedia(library.media);
      })
      .catch((reason: unknown) => setError(errorText(reason, t)));
  };
  useEffect(() => {
    let active = true;
    void Promise.all([api.categories(), api.adminMedia()])
      .then(([categoryData, library]) => {
        if (active) {
          setCategories(categoryData);
          setMedia(library.media);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason, t));
      });
    return () => {
      active = false;
    };
  }, [t]);
  const clear = () => {
    setEditing(null);
    setName('');
    setIcon('✨');
    setColor(null);
    setSortOrder('0');
    setThumbnailMediaId(null);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const input: CategoryInput = {
      name: name.trim(),
      icon: icon.trim(),
      sortOrder: Number(sortOrder) || 0,
      thumbnailMediaId: effectiveThumbnailMediaId,
      color: effectiveColor,
    };
    try {
      if (editing) await api.updateCategory(editing, input);
      else await api.createCategory(input);
      clear();
      load();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  const edit = (category: Category) => {
    setEditing(category.id);
    setName(category.name);
    setIcon(category.icon);
    setColor(category.color);
    setSortOrder(String(category.sortOrder));
    setThumbnailMediaId(category.thumbnailMediaId);
  };
  const effectiveColor =
    color ?? emojiColor(icon) ?? theme.palette.primary.main;
  const eligibleMedia = editing
    ? media
        .filter(
          (item) =>
            item.categoryIds.includes(editing) &&
            item.visible &&
            item.availability === 'AVAILABLE',
        )
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            left.title.localeCompare(right.title),
        )
    : [];
  const thumbnailOptions = eligibleMedia.filter(
    (item) => item.thumbnailUrl !== null,
  );
  const selectedThumbnail = thumbnailOptions.find(
    (item) => item.id === thumbnailMediaId,
  );
  const autoThumbnail = eligibleMedia[0];
  const effectiveThumbnailMediaId = selectedThumbnail?.id ?? null;
  const previewThumbnailUrl =
    selectedThumbnail?.thumbnailUrl ?? autoThumbnail?.thumbnailUrl;
  const previewTitle = selectedThumbnail?.title ?? autoThumbnail?.title;
  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteCategory(id);
      load();
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={4}>
      <Stack spacing={1}>
        <Typography
          variant="h1"
          sx={{ fontSize: { xs: '2.4rem', md: '3.6rem' } }}
        >
          {t('parent.categoriesTitle')}
        </Typography>
        <Typography color="text.secondary">
          {t('parent.categoriesHint')}
        </Typography>
      </Stack>
      <Paper component="form" onSubmit={submit} sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h5">
            {editing ? t('common.edit') : t('parent.newCategory')}
          </Typography>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' },
              gap: 2,
            }}
          >
            <TextField
              required
              label={t('parent.categoryName')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextField
              required
              label={t('parent.categoryIcon')}
              value={icon}
              onChange={(event) => {
                setIcon(event.target.value);
                setColor(null);
              }}
            />
            <TextField
              type="number"
              label={t('parent.categoryOrder')}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              type="color"
              label={t('parent.categoryColor')}
              value={effectiveColor}
              onChange={(event) => setColor(event.target.value)}
              sx={{ width: 120 }}
            />
            <Button onClick={() => setColor(null)}>
              {t('parent.categoryColorAutomatic')}
            </Button>
          </Stack>
          <TextField
            select
            label={t('parent.categoryThumbnail')}
            value={effectiveThumbnailMediaId ?? automaticThumbnailValue}
            onChange={(event) =>
              setThumbnailMediaId(
                event.target.value === automaticThumbnailValue
                  ? null
                  : event.target.value,
              )
            }
          >
            <MenuItem value={automaticThumbnailValue}>
              {t('parent.categoryThumbnailAutomatic')}
            </MenuItem>
            {thumbnailOptions.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.title}
              </MenuItem>
            ))}
          </TextField>
          {previewThumbnailUrl ? (
            <Box
              component="img"
              src={previewThumbnailUrl}
              alt={t('a11y.categoryThumbnail', {
                title: previewTitle ?? t('parent.categoryThumbnail'),
              })}
              sx={{
                width: '100%',
                maxWidth: 480,
                aspectRatio: '16 / 9',
                objectFit: 'cover',
                borderRadius: 2,
              }}
            />
          ) : null}
          <Stack direction="row" spacing={1}>
            <Button
              type="submit"
              variant="contained"
              disabled={busy || !name.trim()}
            >
              {busy
                ? t('common.loading')
                : editing
                  ? t('common.save')
                  : t('common.create')}
            </Button>
            {editing ? (
              <Button onClick={clear}>{t('common.cancel')}</Button>
            ) : null}
          </Stack>
        </Stack>
      </Paper>
      {categories.length === 0 ? (
        <EmptyState text={t('parent.noCategories')} />
      ) : (
        <Stack spacing={1.5}>
          {categories.map((category) => (
            <Paper key={category.id} sx={{ p: 2 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ sm: 'center' }}
              >
                <Typography sx={{ fontSize: '1.8rem' }} aria-hidden>
                  {category.icon}
                </Typography>
                <Typography sx={{ flex: 1, fontWeight: 800 }}>
                  {category.name}
                </Typography>
                <Box
                  aria-label={t('parent.categoryColor')}
                  sx={{
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    borderRadius: '50%',
                    bgcolor: category.color ?? theme.palette.primary.main,
                  }}
                />
                <Typography color="text.secondary">
                  {category.sortOrder}
                </Typography>
                <Button onClick={() => edit(category)}>
                  {t('common.edit')}
                </Button>
                <Button
                  color="error"
                  onClick={() => {
                    void remove(category.id);
                  }}
                  disabled={busy}
                  aria-label={t('a11y.removeCategory', {
                    title: category.name,
                  })}
                >
                  {t('common.delete')}
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
