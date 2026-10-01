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

export const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#355c7d', contrastText: '#fffdf8' },
        secondary: { main: '#e58c67', contrastText: '#fffdf8' },
        background: { default: '#fbf7f0', paper: '#fffdf8' },
        text: { primary: '#25323b', secondary: '#5d6a70' },
        success: { main: '#2e7d32', dark: '#1b5e20', contrastText: '#fff' },
        error: { main: '#c62828', dark: '#b71c1c', contrastText: '#fff' },
        artwork: {
          childBackground: 'linear-gradient(180deg, #fbf7f0 0%, #eff5f5 100%)',
          parentBackground: 'linear-gradient(145deg, #d7e1e8, #edf1f3)',
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
    },
    dark: {
      palette: {
        primary: { main: '#9cc6e3', contrastText: '#10212b' },
        secondary: { main: '#f0aa87', contrastText: '#2b1a15' },
        background: { default: '#101a20', paper: '#19262d' },
        text: { primary: '#eef4f5', secondary: '#b8c7ca' },
        success: { main: '#2e7d32', dark: '#1b5e20', contrastText: '#fff' },
        error: { main: '#c62828', dark: '#b71c1c', contrastText: '#fff' },
        artwork: {
          childBackground: 'linear-gradient(180deg, #20343e 0%, #29434c 100%)',
          parentBackground: 'linear-gradient(145deg, #111d27, #080f15)',
          thumbnail: 'linear-gradient(135deg, #23333e, #4b3940)',
          category: ['#3b3033', '#29403f', '#293d4b', '#4a3e2d'],
          categoryOverlay: 'linear-gradient(transparent, rgba(0, 0, 0, 0.8))',
          player: '#17232a',
          overlay: 'rgba(0, 0, 0, 0.75)',
          overlayHover: 'rgba(0, 0, 0, 0.9)',
          fullscreenOverlay: 'rgba(0, 0, 0, 0.65)',
          fullscreenOverlayHover: 'rgba(0, 0, 0, 0.85)',
          onOverlay: '#fff',
        },
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
