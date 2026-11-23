import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { Button, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function BackButton({
  to = '/videos',
  onExit,
  toolbar = false,
}: {
  toolbar?: boolean;
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
      sx={{
        mb: toolbar ? 0 : 4,
        alignSelf: 'flex-start',
        minHeight: toolbar ? 44 : 64,
        py: toolbar ? 0 : undefined,
        px: toolbar ? 1.5 : 3,
        fontSize: toolbar ? '1rem' : '1.25rem',
        borderRadius: 3,
      }}
    >
      {t('nav.back')}
    </Button>
  );
}

export function ChildPageHeader({
  to,
  onExit,
  title,
}: {
  to?: string;
  onExit?: () => void;
  title?: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{
        mb: 4,
        gap: 2,
        '& > a': { mb: 0, alignSelf: 'center', flexShrink: 0 },
      }}
    >
      <BackButton to={to} onExit={onExit} />
      {title && (
        <Typography
          variant="h1"
          sx={{
            minWidth: 0,
            textAlign: 'right',
            overflowWrap: 'anywhere',
            fontSize: { xs: 'clamp(1.25rem, 5vw, 2.5rem)', md: '4rem' },
          }}
        >
          {title}
        </Typography>
      )}
    </Stack>
  );
}
