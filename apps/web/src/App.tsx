import { CssBaseline, ThemeProvider } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  ChildCategoryRoute,
  ChildHome,
  ChildPlayerRoute,
} from './features/child/ChildRoutes';
import { ParentApp } from './features/parent/ParentRoutes';
import { theme } from './theme';

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Routes>
        <Route path="/" element={<ChildHome />} />
        <Route path="/category/:categoryId" element={<ChildCategoryRoute />} />
        <Route path="/watch/:mediaId" element={<ChildPlayerRoute />} />
        <Route path="/parent/*" element={<ParentApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
