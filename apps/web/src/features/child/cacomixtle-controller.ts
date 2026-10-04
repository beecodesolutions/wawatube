export type MascotState =
  | 'hidden'
  | 'idle'
  | 'runningRight'
  | 'runningLeft'
  | 'peeking'
  | 'waving'
  | 'enteringCave'
  | 'cave';

export type MascotEvent =
  | 'sessionStarted'
  | 'videoStarted'
  | 'videoEnded'
  | 'userIdle'
  | 'sessionEnded';

export interface CacomixtleControllerOptions {
  random?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

type Mode = 'inactive' | 'browsing' | 'video' | 'ending' | 'ended';

const INITIAL_DELAY = [2_000, 5_000] as const;
const VIDEO_RESUME_DELAY = [2_000, 3_000] as const;
const BROWSE_DELAY = [45_000, 120_000] as const;
const SESSION_END_DELAY = [1_000, 2_000] as const;
const FIRST_RUN_DURATION = 2_000;
const APPEARANCE_DURATION = 4_000;
const PEEK_DURATION = 1_800;
const IDLE_DURATION = 2_500;
const GOODBYE_RUN_DURATION = 1_500;
const GOODBYE_WAVE_DURATION = 1_200;
const GOODBYE_CAVE_DURATION = 2_800;

const browseStates: readonly MascotState[] = [
  'runningRight',
  'runningLeft',
  'peeking',
  'idle',
];

const durationFor = (state: MascotState): number => {
  switch (state) {
    case 'runningRight':
    case 'runningLeft':
      return APPEARANCE_DURATION;
    case 'peeking':
      return PEEK_DURATION;
    case 'idle':
      return IDLE_DURATION;
    case 'hidden':
    case 'waving':
    case 'enteringCave':
    case 'cave':
      return 0;
  }
};

const sampleDelay = (
  random: () => number,
  [minimum, maximum]: readonly [number, number],
): number => {
  const sample = Math.min(0.999999999, Math.max(0, random()));
  return minimum + sample * (maximum - minimum);
};

export function createCacomixtleController(
  onState: (state: MascotState) => void,
  options: CacomixtleControllerOptions = {},
): { send: (event: MascotEvent) => void; dispose: () => void } {
  const random = options.random ?? Math.random;
  const schedule =
    options.setTimeout ??
    ((callback: () => void, delayMs: number) =>
      globalThis.setTimeout(callback, delayMs));
  const cancel =
    options.clearTimeout ??
    ((handle: unknown) =>
      globalThis.clearTimeout(
        handle as ReturnType<typeof globalThis.setTimeout>,
      ));

  let mode: Mode = 'inactive';
  let pendingTimer: unknown = null;
  let disposed = false;

  const clearPendingTimer = (): void => {
    if (pendingTimer === null) return;
    cancel(pendingTimer);
    pendingTimer = null;
  };

  const emit = (state: MascotState): void => {
    if (disposed) return;
    onState(state);
  };

  const scheduleTimer = (delayMs: number, callback: () => void): void => {
    clearPendingTimer();
    pendingTimer = schedule(() => {
      pendingTimer = null;
      if (!disposed) callback();
    }, delayMs);
  };

  const randomBrowseState = (): MascotState => {
    const index = Math.min(
      browseStates.length - 1,
      Math.floor(
        Math.min(0.999999999, Math.max(0, random())) * browseStates.length,
      ),
    );
    return browseStates[index] ?? 'idle';
  };

  const scheduleBrowse = (
    state?: MascotState,
    delayRange: readonly [number, number] = BROWSE_DELAY,
  ): void => {
    scheduleTimer(sampleDelay(random, delayRange), () => {
      if (mode !== 'browsing') return;
      const nextState = state ?? randomBrowseState();
      emit(nextState);
      scheduleTimer(durationFor(nextState), () => {
        if (mode !== 'browsing') return;
        emit('hidden');
        scheduleBrowse();
      });
    });
  };

  const startBrowsing = (): void => {
    mode = 'browsing';
    clearPendingTimer();
    emit('hidden');
    scheduleTimer(sampleDelay(random, INITIAL_DELAY), () => {
      if (mode !== 'browsing') return;
      emit('runningRight');
      scheduleTimer(FIRST_RUN_DURATION, () => {
        if (mode !== 'browsing') return;
        emit('idle');
        scheduleTimer(IDLE_DURATION, () => {
          if (mode !== 'browsing') return;
          emit('runningRight');
          scheduleTimer(FIRST_RUN_DURATION, () => {
            if (mode !== 'browsing') return;
            emit('hidden');
            scheduleBrowse();
          });
        });
      });
    });
  };

  const startGoodbye = (): void => {
    mode = 'ending';
    clearPendingTimer();
    emit('hidden');
    scheduleTimer(sampleDelay(random, SESSION_END_DELAY), () => {
      if (mode !== 'ending') return;
      emit('runningRight');
      scheduleTimer(GOODBYE_RUN_DURATION, () => {
        if (mode !== 'ending') return;
        emit('waving');
        scheduleTimer(GOODBYE_WAVE_DURATION, () => {
          if (mode !== 'ending') return;
          emit('enteringCave');
          scheduleTimer(GOODBYE_CAVE_DURATION, () => {
            if (mode !== 'ending') return;
            emit('cave');
            mode = 'ended';
          });
        });
      });
    });
  };

  const send = (event: MascotEvent): void => {
    if (disposed) return;

    switch (event) {
      case 'sessionStarted':
        if (mode !== 'browsing') startBrowsing();
        return;
      case 'videoStarted':
        mode = 'video';
        clearPendingTimer();
        emit('hidden');
        return;
      case 'videoEnded':
        if (mode !== 'video') return;
        mode = 'browsing';
        clearPendingTimer();
        scheduleTimer(sampleDelay(random, VIDEO_RESUME_DELAY), () => {
          if (mode !== 'browsing') return;
          emit('idle');
          scheduleTimer(IDLE_DURATION, () => {
            if (mode !== 'browsing') return;
            emit('hidden');
            scheduleBrowse();
          });
        });
        return;
      case 'userIdle':
        return;
      case 'sessionEnded':
        if (mode === 'ending' || mode === 'ended') return;
        startGoodbye();
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    clearPendingTimer();
  };

  return { send, dispose };
}
