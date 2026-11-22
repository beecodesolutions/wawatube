import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type {
  LegoAdminSettings,
  LegoCandidate,
  LegoImportItem,
} from '@wawatube/shared';
import { api, errorText } from '../../api';

type Draft = {
  checked: boolean;
  name: string;
  setId: string;
};

const draftFor = (candidate: LegoCandidate): Draft => ({
  checked: candidate.mocId !== null,
  name: candidate.name,
  setId: candidate.setId ?? '',
});

export function AdminLego() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<LegoAdminSettings | null>(null);
  const [inbox, setInbox] = useState('');
  const [candidates, setCandidates] = useState<LegoCandidate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<'settings' | 'scan' | 'import' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void api
      .legoAdminSettings()
      .then((data) => {
        if (!active) return;
        setSettings(data);
        setInbox(data.inbox);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason, t));
      })
      .finally(() => {
        if (active) setSettingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [settingsAttempt, t]);

  const updateDraft = (file: string, update: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [file]: {
        checked: current[file]?.checked ?? false,
        name: current[file]?.name ?? '',
        setId: current[file]?.setId ?? '',
        ...update,
      },
    }));
  };

  const saveSettings = async () => {
    const nextInbox = inbox.trim();
    if (!nextInbox) {
      setError(t('common.required'));
      return;
    }
    setBusy('settings');
    setError(null);
    setSaved(false);
    try {
      await api.updateLegoAdminSettings(nextInbox);
      setSettings((current) =>
        current ? { ...current, inbox: nextInbox } : current,
      );
      setInbox(nextInbox);
      setScanned(false);
      setCandidates([]);
      setDrafts({});
      setResult(null);
      setSaved(true);
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(null);
    }
  };

  const scan = async () => {
    if (inbox.trim() !== settings?.inbox) {
      setError(t('parent.legoSaveBeforeScan'));
      return;
    }
    setBusy('scan');
    setError(null);
    setSaved(false);
    setResult(null);
    try {
      const data = await api.scanLego();
      setScanned(true);
      setCandidates(data.candidates);
      setDrafts(
        Object.fromEntries(
          data.candidates.map((candidate) => [
            candidate.file,
            draftFor(candidate),
          ]),
        ),
      );
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(null);
    }
  };

  const selected = candidates.filter(
    (candidate) => drafts[candidate.file]?.checked,
  );
  const inboxDirty = settings !== null && inbox.trim() !== settings.inbox;
  const invalidSelection = selected.some((candidate) => {
    const draft = drafts[candidate.file] ?? draftFor(candidate);
    return !draft || !draft.name.trim() || !draft.setId;
  });

  const importSelected = async () => {
    if (inbox.trim() !== settings?.inbox) {
      setError(t('parent.legoSaveBeforeScan'));
      return;
    }
    if (!selected.length) {
      setError(t('parent.legoSelectAtLeastOne'));
      return;
    }
    if (invalidSelection) {
      setError(t('parent.legoCompleteFields'));
      return;
    }
    const items: LegoImportItem[] = selected.map((candidate) => {
      const draft = drafts[candidate.file] ?? draftFor(candidate);
      return {
        file: candidate.file,
        name: draft.name.trim(),
        setId: draft.setId,
      };
    });
    setBusy('import');
    setError(null);
    setResult(null);
    try {
      const data = await api.importLego(items);
      setResult(data);
      const submitted = new Set(items.map((item) => item.file));
      setCandidates((current) =>
        current.filter((candidate) => !submitted.has(candidate.file)),
      );
    } catch (reason: unknown) {
      setError(errorText(reason, t));
    } finally {
      setBusy(null);
    }
  };

  if (!settings)
    return (
      <Stack alignItems="center" spacing={2} sx={{ py: 10 }}>
        {settingsLoading ? (
          <>
            <CircularProgress aria-label={t('common.loading')} />
            <Typography color="text.secondary">
              {t('common.loading')}
            </Typography>
          </>
        ) : null}
        {!settingsLoading && error ? (
          <>
            <Alert severity="error">{error}</Alert>
            <Button
              onClick={() => {
                setError(null);
                setSettingsLoading(true);
                setSettingsAttempt((attempt) => attempt + 1);
              }}
            >
              {t('common.retry')}
            </Button>
          </>
        ) : null}
      </Stack>
    );

  return (
    <Stack spacing={4} sx={{ minWidth: 0 }}>
      <Stack spacing={1}>
        <Typography
          variant="h1"
          sx={{ fontSize: { xs: '2.4rem', md: '3.6rem' } }}
        >
          {t('parent.legoTitle')}
        </Typography>
        <Typography color="text.secondary">{t('parent.legoHint')}</Typography>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {saved ? (
        <Alert severity="success">{t('parent.legoSettingsSaved')}</Alert>
      ) : null}
      {result ? (
        <Alert severity="success">{t('parent.legoImportResult', result)}</Alert>
      ) : null}

      <Paper sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
        <Stack spacing={2}>
          <TextField
            required
            label={t('parent.legoInbox')}
            value={inbox}
            disabled={busy !== null}
            onChange={(event) => {
              setInbox(event.target.value);
              setSaved(false);
              setScanned(false);
              setCandidates([]);
              setDrafts({});
              setResult(null);
            }}
            fullWidth
          />
          {inboxDirty ? (
            <Typography color="warning.main" variant="body2">
              {t('parent.legoSaveBeforeScan')}
            </Typography>
          ) : null}
          <Box
            sx={{
              display: 'grid',
              gap: 1,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            }}
          >
            <Typography color="text.secondary">
              {t('parent.legoCatalog')}:{' '}
              <strong style={{ overflowWrap: 'anywhere' }}>
                {settings.catalog}
              </strong>
            </Typography>
            <Typography color="text.secondary">
              {t('parent.legoApiKey')}:{' '}
              <strong>
                {settings.apiKeyConfigured
                  ? t('parent.legoApiKeyConfigured')
                  : t('parent.legoApiKeyMissing')}
              </strong>
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={() => void saveSettings()}
            disabled={busy !== null}
            sx={{ alignSelf: 'flex-start' }}
          >
            {busy === 'settings'
              ? t('common.loading')
              : t('parent.legoSaveSettings')}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            justifyContent="space-between"
          >
            <Typography variant="h5">{t('parent.legoCandidates')}</Typography>
            <Button
              variant="outlined"
              onClick={() => void scan()}
              disabled={busy !== null || inbox.trim() !== settings.inbox}
            >
              {busy === 'scan'
                ? t('parent.legoScanning')
                : t('parent.legoScan')}
            </Button>
          </Stack>
          {candidates.length ? (
            <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
              <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 660 }}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>{t('parent.legoFile')}</TableCell>
                    <TableCell>{t('parent.legoModelName')}</TableCell>
                    <TableCell>{t('parent.legoOriginalSet')}</TableCell>
                    <TableCell>{t('parent.legoKnownMoc')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {candidates.map((candidate) => {
                    const draft = drafts[candidate.file] ?? draftFor(candidate);
                    return (
                      <TableRow key={candidate.file}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={draft.checked}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateDraft(candidate.file, {
                                checked: event.target.checked,
                              })
                            }
                            inputProps={{
                              'aria-label': `${t('parent.legoFile')}: ${candidate.file}`,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ wordBreak: 'break-word' }}>
                          {candidate.file}
                        </TableCell>
                        <TableCell sx={{ minWidth: 190 }}>
                          <TextField
                            size="small"
                            fullWidth
                            value={draft.name}
                            onChange={(event) =>
                              updateDraft(candidate.file, {
                                name: event.target.value,
                              })
                            }
                            inputProps={{
                              'aria-label': t('parent.legoModelName'),
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 190 }}>
                          <FormControl size="small" fullWidth>
                            <InputLabel>
                              {t('parent.legoOriginalSet')}
                            </InputLabel>
                            <Select
                              value={draft.setId}
                              label={t('parent.legoOriginalSet')}
                              inputProps={{
                                'aria-label': t('parent.legoOriginalSet'),
                              }}
                              onChange={(event) =>
                                updateDraft(candidate.file, {
                                  setId: event.target.value,
                                })
                              }
                            >
                              <MenuItem value="">
                                {t('parent.legoChooseSet')}
                              </MenuItem>
                              {settings.sets.map((set) => (
                                <MenuItem key={set.id} value={set.id}>
                                  {set.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={candidate.mocId ? 'success' : 'default'}
                            label={candidate.mocId ?? t('parent.legoNotMoc')}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : scanned ? (
            <Typography color="text.secondary">
              {t('parent.legoNoCandidates')}
            </Typography>
          ) : null}
          {selected.length && invalidSelection ? (
            <Alert severity="warning">{t('parent.legoCompleteFields')}</Alert>
          ) : null}
          <Button
            variant="contained"
            onClick={() => void importSelected()}
            disabled={
              busy !== null ||
              inboxDirty ||
              !selected.length ||
              invalidSelection
            }
            sx={{ alignSelf: 'flex-start' }}
          >
            {busy === 'import'
              ? t('parent.legoImporting')
              : t('parent.legoImportSelected')}
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
