import type { MascotEvent } from './cacomixtle-controller';

export const CACOMIXTLE_EVENT = 'wawatube:cacomixtle';

export function sendCacomixtleEvent(event: MascotEvent): void {
  window.dispatchEvent(new CustomEvent(CACOMIXTLE_EVENT, { detail: event }));
}
