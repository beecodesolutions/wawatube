import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { Button } from '@mui/material';
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
