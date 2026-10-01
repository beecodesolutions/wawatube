import { createTheme } from '@mui/material';

export const theme = createTheme({
  palette: {
    primary: { main: '#355c7d', contrastText: '#fffdf8' },
    secondary: { main: '#e58c67', contrastText: '#fffdf8' },
    background: { default: '#fbf7f0', paper: '#fffdf8' },
    text: { primary: '#25323b', secondary: '#5d6a70' },
  },
  shape: { borderRadius: 20 },
  typography: {
    fontFamily: '"Nunito", "Trebuchet MS", sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.04em' },
    h2: { fontWeight: 800, letterSpacing: '-0.03em' },
    h3: { fontWeight: 800 },
    button: { fontWeight: 800, textTransform: 'none' },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: {
      styleOverrides: { root: { border: '1px solid rgba(53, 92, 125, .10)' } },
    },
  },
});
