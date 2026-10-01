import { useEffect, useState, type ReactNode } from 'react';
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
import { LoadingState } from '../../components/Shared';
import { AdminLibrary } from './ParentLibrary';
import { AdminCategories } from './ParentCategories';
import { ParentLogin } from './ParentLogin';

export function ParentApp() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeUnauthorized(() => setAuthenticated(false));
    let active = true;
    void api
      .session()
      .then((session) => {
        if (active) setAuthenticated(session.authenticated);
      })
      .catch(() => {
        if (active) setAuthenticated(false);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (authenticated === null)
    return <LoadingState label="parent.sessionLoading" />;
  if (!authenticated)
    return <ParentLogin onLoggedIn={() => setAuthenticated(true)} />;
  return (
    <ParentFrame onLogout={() => setAuthenticated(false)}>
      <Routes>
        <Route index element={<Navigate to="library" replace />} />
        <Route path="library" element={<AdminLibrary />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="*" element={<Navigate to="library" replace />} />
      </Routes>
    </ParentFrame>
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
    <Box sx={{ minHeight: '100vh', backgroundColor: '#f6f7f5' }}>
      <AppBar position="sticky" color="inherit" elevation={0}>
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap', py: 1 }}>
          <Typography variant="h6" sx={{ mr: 'auto', fontWeight: 900 }}>
            {t('parent.title')}
          </Typography>
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
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
        {children}
      </Container>
    </Box>
  );
}
