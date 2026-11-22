import { lazy, Suspense, useEffect } from 'react';
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  ChildCategoryRoute,
  ChildHome,
  ChildPlayerRoute,
  ChildVideosHome,
} from './features/child/ChildRoutes';
import {
  LegoMocsRoute,
  LegoReaderRoute,
  LegoSetsRoute,
} from './features/child/LegoRoutes';
import { ParentApp } from './features/parent/ParentRoutes';
import { childTheme, parentTheme } from './theme';
import { api } from './api';
import { CacomixtleLayer } from './features/child/CacomixtleLayer';

const CacomixtlePreview = import.meta.env.DEV
  ? lazy(() => import('./features/child/CacomixtlePreview'))
  : null;

export function App() {
  const { pathname } = useLocation();
  const parent = pathname.startsWith('/parent');
  useEffect(() => {
    if (!parent) void api.logout().catch(() => {});
  }, [parent]);
  useEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon)
      favicon.href = parent ? '/logo-parent.webp' : '/logo-child.webp';
  }, [parent]);
  useEffect(() => {
    if (
      !pathname.startsWith('/watch') &&
      !/^\/lego\/[^/]+\/[^/]+$/.test(pathname) &&
      document.fullscreenElement === document.documentElement
    ) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [pathname]);
  return (
    <ThemeProvider theme={parent ? parentTheme : childTheme}>
      <CssBaseline />
      <Box
        key={parent ? 'parent' : 'child'}
        sx={{
          animation: `${parent ? 'revealParent' : 'revealChild'} 380ms ease-out both`,
          '@keyframes revealParent': {
            from: { clipPath: 'inset(0 100% 0 0)' },
            to: { clipPath: 'inset(0 0 0 0)' },
          },
          '@keyframes revealChild': {
            from: { clipPath: 'inset(0 0 0 100%)' },
            to: { clipPath: 'inset(0 0 0 0)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        <Routes>
          {CacomixtlePreview ? (
            <Route
              path="/dev/cacomixtle"
              element={
                <Suspense fallback={null}>
                  <CacomixtlePreview />
                </Suspense>
              }
            />
          ) : null}
          <Route path="/" element={<ChildHome />} />
          <Route path="/videos" element={<ChildVideosHome />} />
          <Route path="/lego" element={<LegoSetsRoute />} />
          <Route path="/lego/:setId" element={<LegoMocsRoute />} />
          <Route path="/lego/:setId/:mocId" element={<LegoReaderRoute />} />
          <Route
            path="/category/:categoryId"
            element={<ChildCategoryRoute />}
          />
          <Route path="/watch/:mediaId" element={<ChildPlayerRoute />} />
          <Route path="/parent/*" element={<ParentApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
      {!parent &&
      pathname !== '/' &&
      !pathname.startsWith('/lego') &&
      !(import.meta.env.DEV && pathname === '/dev/cacomixtle') ? (
        <CacomixtleLayer />
      ) : null}
    </ThemeProvider>
  );
}
