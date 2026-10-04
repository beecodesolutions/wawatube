// Vite reads this from apps/web/.env.local; restart dev server after changing it.
export const cacomixtleEnabled =
  import.meta.env.VITE_CACOMIXTLE_ENABLED !== 'false';
