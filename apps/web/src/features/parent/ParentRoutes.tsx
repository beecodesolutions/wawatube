import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppBar,
  Box,
  Button,
  Container,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { api, subscribeUnauthorized } from '../../api';
import { ParentBrand } from '../../components/Shared';
import { AdminLibrary } from './ParentLibrary';
import { AdminCategories } from './ParentCategories';
import { ParentLogin } from './ParentLogin';

export function ParentApp() {
  const { t } = useTranslation();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const entryLogout = useRef<Promise<void> | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeUnauthorized(() => setAuthenticated(false));
    let active = true;
    entryLogout.current ??= api.logout().catch(() => {
      // Login remains available if the server is temporarily unreachable.
    });
    void entryLogout.current.then(() => {
      if (active) setAuthenticated(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (authenticated === null)
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: (theme) => theme.palette.artwork.parentBackground,
        }}
      >
        <ParentBrand />
        <Typography
          sx={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
          }}
          role="status"
        >
          {t('parent.sessionLoading')}
        </Typography>
      </Box>
    );
  return (
    <Box
      sx={{
        animation: 'parentReady 180ms ease-out both',
        '@keyframes parentReady': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      {authenticated ? (
        <ParentFrame onLogout={() => setAuthenticated(false)}>
          <Routes>
            <Route index element={<Navigate to="library" replace />} />
            <Route path="library" element={<AdminLibrary />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="*" element={<Navigate to="library" replace />} />
          </Routes>
        </ParentFrame>
      ) : (
        <ParentLogin onLoggedIn={() => setAuthenticated(true)} />
      )}
    </Box>
  );
}

function ParentFrame({
  children,
  onLogout,
}: {
  children: ReactNode;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = async () => {
    try {
      await api.logout();
    } finally {
      onLogout();
      navigate('/parent');
    }
  };
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: (theme) => theme.palette.artwork.parentBackground,
      }}
    >
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ backdropFilter: 'blur(14px)' }}
      >
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap', py: 1 }}>
          <Box sx={{ flex: 1, minWidth: 'min(100%, 180px)' }}>
            <ParentBrand />
          </Box>
          <Box
            sx={{
              display: 'flex',
              width: { xs: '100%', sm: 'auto' },
              justifyContent: { xs: 'space-between', sm: 'initial' },
              gap: 1,
              order: { xs: 2, sm: 1 },
            }}
          >
            <Button component={NavLink} to="library" color="inherit">
              {t('nav.library')}
            </Button>
            <Button component={NavLink} to="categories" color="inherit">
              {t('nav.categories')}
            </Button>
            <Button
              onClick={() => {
                void logout();
              }}
              color="secondary"
            >
              {t('nav.logout')}
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
        {children}
      </Container>
    </Box>
  );
}
