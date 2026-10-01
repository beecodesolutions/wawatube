import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Category, CategoryInput } from '@wawatube/shared';
import { api, errorText } from '../../api';
import { EmptyState } from '../../components/Shared';

export function AdminCategories() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('✨');
  const [sortOrder, setSortOrder] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setError(null);
    void api
      .categories()
      .then(setCategories)
      .catch((reason: unknown) => setError(errorText(reason, t)));
  };
  useEffect(() => {
    let active = true;
    void api
      .categories()
      .then((data) => {
        if (active) setCategories(data);
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
    setSortOrder('0');
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const input: CategoryInput = {
      name: name.trim(),
      icon: icon.trim(),
      sortOrder: Number(sortOrder) || 0,
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
    setSortOrder(String(category.sortOrder));
  };
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
              onChange={(event) => setIcon(event.target.value)}
            />
            <TextField
              type="number"
              label={t('parent.categoryOrder')}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </Box>
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
