import { createTheme } from '@mui/material';

export const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#355c7d', contrastText: '#fffdf8' },
        secondary: { main: '#e58c67', contrastText: '#fffdf8' },
        background: { default: '#fbf7f0', paper: '#fffdf8' },
        text: { primary: '#25323b', secondary: '#5d6a70' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#9cc6e3', contrastText: '#10212b' },
        secondary: { main: '#f0aa87', contrastText: '#2b1a15' },
        background: { default: '#101a20', paper: '#19262d' },
        text: { primary: '#eef4f5', secondary: '#b8c7ca' },
      },
    },
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
      styleOverrides: {
        root: ({ theme }) => ({ border: `1px solid ${theme.palette.divider}` }),
      },
    },
  },
});
