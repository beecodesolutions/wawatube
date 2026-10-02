import { createTheme } from '@mui/material';

declare module '@mui/material/styles' {
  interface Palette {
    artwork: {
      childBackground: string;
      parentBackground: string;
      thumbnail: string;
      category: string[];
      categoryOverlay: string;
      player: string;
      overlay: string;
      overlayHover: string;
      fullscreenOverlay: string;
      fullscreenOverlayHover: string;
      onOverlay: string;
    };
  }
  interface PaletteOptions {
    artwork?: Palette['artwork'];
  }
}

export const childTheme = createTheme({
  palette: {
    primary: { main: '#36785b', contrastText: '#fffdf8' },
    secondary: { main: '#a65337', contrastText: '#fffdf8' },
    background: { default: '#fff3cb', paper: '#fffaf0' },
    text: { primary: '#25323b', secondary: '#5d6263' },
    success: { main: '#2e7d32', dark: '#1b5e20', contrastText: '#fff' },
    error: { main: '#c62828', dark: '#b71c1c', contrastText: '#fff' },
    artwork: {
      childBackground: 'linear-gradient(180deg, #fff5d7 0%, #ffe9bc 100%)',
      parentBackground: 'linear-gradient(145deg, #eee7fb, #e1def4)',
      thumbnail: 'linear-gradient(135deg, #d9e6f3, #f8d8c4)',
      category: ['#f8d8c4', '#dcebdc', '#d9e6f3', '#f1e2ba'],
      categoryOverlay: 'linear-gradient(transparent, rgba(0, 0, 0, 0.8))',
      player: '#17232a',
      overlay: 'rgba(0, 0, 0, 0.75)',
      overlayHover: 'rgba(0, 0, 0, 0.9)',
      fullscreenOverlay: 'rgba(0, 0, 0, 0.65)',
      fullscreenOverlayHover: 'rgba(0, 0, 0, 0.85)',
      onOverlay: '#fff',
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

export const parentTheme = createTheme(childTheme, {
  palette: {
    primary: { main: '#624197', contrastText: '#fff' },
    secondary: { main: '#426f9b', contrastText: '#fff' },
    background: { default: '#eee7fb', paper: '#fffaff' },
    text: { primary: '#302641', secondary: '#615773' },
  },
});
