export type MascotState =
  | 'hidden'
  | 'idle'
  | 'runningRight'
  | 'runningLeft'
  | 'walkingLeftToRight'
  | 'walkingRightToLeft'
  | 'walkingLeftToLeft'
  | 'walkingRightToRight'
  | 'rockPooping'
  | 'rockSurprised'
  | 'rockFleeLeft'
  | 'rockFleeRight'
  | 'rockSettled'
  | 'peeking'
  | 'waving'
  | 'enteringCave'
  | 'cave';

export type RockSceneSide = 'left' | 'right';

export type MascotEvent =
  | 'sessionStarted'
  | 'videoStarted'
  | 'videoEnded'
  | 'userIdle'
  | 'sessionEnded';

export interface CacomixtleControllerOptions {
  home?: boolean;
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
const WALK_DURATION = 6_500;
const PEEK_DURATION = 1_800;
const IDLE_DURATION = 2_500;
const ROCK_POOP_DURATION = 2_000;
const ROCK_SURPRISE_DURATION = 600;
const ROCK_FLEE_DURATION = 2_000;
const ROCK_SETTLED_DURATION = 1_400;
const GOODBYE_RUN_DURATION = 1_500;
const GOODBYE_WAVE_DURATION = 1_200;
const GOODBYE_CAVE_DURATION = 2_800;

const browseStates: readonly MascotState[] = [
  'walkingLeftToRight',
  'walkingRightToLeft',
  'walkingLeftToLeft',
  'walkingRightToRight',
];
const legacyBrowseStates: readonly MascotState[] = [
  'runningRight',
  'runningLeft',
  'peeking',
  'idle',
];

const durationFor = (state: MascotState): number => {
  switch (state) {
    case 'walkingLeftToRight':
    case 'walkingRightToLeft':
    case 'walkingLeftToLeft':
    case 'walkingRightToRight':
      return WALK_DURATION;
    case 'rockPooping':
      return ROCK_POOP_DURATION;
    case 'rockSurprised':
      return ROCK_SURPRISE_DURATION;
    case 'rockFleeLeft':
    case 'rockFleeRight':
      return ROCK_FLEE_DURATION;
    case 'rockSettled':
      return ROCK_SETTLED_DURATION;
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

const sampleIndex = (random: () => number, length: number): number =>
  Math.min(
    length - 1,
    Math.floor(Math.min(0.999999999, Math.max(0, random())) * length),
  );

const randomRockFleeState = (random: () => number): MascotState =>
  random() < 0.5 ? 'rockFleeLeft' : 'rockFleeRight';

const randomAppearance = (random: () => number, home: boolean): MascotState => {
  if (!home)
    return (
      legacyBrowseStates[sampleIndex(random, legacyBrowseStates.length)] ??
      'idle'
    );
  if (random() < 0.25) return 'rockPooping';
  return (
    browseStates[sampleIndex(random, browseStates.length)] ??
    'walkingLeftToRight'
  );
};

const sampleDelay = (
  random: () => number,
  [minimum, maximum]: readonly [number, number],
): number => {
  const sample = Math.min(0.999999999, Math.max(0, random()));
  return minimum + sample * (maximum - minimum);
};

export function createCacomixtleController(
  onState: (state: MascotState, rockSide?: RockSceneSide) => void,
  options: CacomixtleControllerOptions = {},
): { send: (event: MascotEvent) => void; dispose: () => void } {
  const home = options.home ?? true;
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
  let rockSceneSide: RockSceneSide | null = null;

  const clearPendingTimer = (): void => {
    if (pendingTimer === null) return;
    cancel(pendingTimer);
    pendingTimer = null;
  };

  const emit = (state: MascotState): void => {
    if (disposed) return;
    if (state === 'rockPooping' && rockSceneSide === null) {
      rockSceneSide = random() < 0.5 ? 'left' : 'right';
    }
    onState(
      state,
      state.startsWith('rock') ? (rockSceneSide ?? 'left') : undefined,
    );
  };

  const scheduleTimer = (delayMs: number, callback: () => void): void => {
    clearPendingTimer();
    pendingTimer = schedule(() => {
      pendingTimer = null;
      if (!disposed) callback();
    }, delayMs);
  };

  const finishAppearance = (): void => {
    if (mode !== 'browsing') return;
    emit('hidden');
    scheduleBrowse();
  };

  const playRockAppearance = (): void => {
    emit('rockPooping');
    scheduleTimer(ROCK_POOP_DURATION, () => {
      if (mode !== 'browsing') return;
      emit('rockSurprised');
      scheduleTimer(ROCK_SURPRISE_DURATION, () => {
        if (mode !== 'browsing') return;
        emit(randomRockFleeState(random));
        scheduleTimer(ROCK_FLEE_DURATION, () => {
          if (mode !== 'browsing') return;
          emit('rockSettled');
          scheduleTimer(ROCK_SETTLED_DURATION, finishAppearance);
        });
      });
    });
  };

  const playAppearance = (state: MascotState): void => {
    if (state === 'rockPooping') {
      playRockAppearance();
      return;
    }
    emit(state);
    scheduleTimer(durationFor(state), finishAppearance);
  };

  const scheduleBrowse = (
    delayRange: readonly [number, number] = BROWSE_DELAY,
  ): void => {
    scheduleTimer(sampleDelay(random, delayRange), () => {
      if (mode !== 'browsing') return;
      playAppearance(randomAppearance(random, home));
    });
  };

  const startBrowsing = (): void => {
    mode = 'browsing';
    clearPendingTimer();
    emit('hidden');
    scheduleTimer(sampleDelay(random, INITIAL_DELAY), () => {
      if (mode !== 'browsing') return;
      if (!home) {
        emit('runningRight');
        scheduleTimer(FIRST_RUN_DURATION, () => {
          if (mode !== 'browsing') return;
          emit('idle');
          scheduleTimer(IDLE_DURATION, () => {
            if (mode !== 'browsing') return;
            emit('runningRight');
            scheduleTimer(FIRST_RUN_DURATION, finishAppearance);
          });
        });
        return;
      }
      playAppearance(randomAppearance(random, true));
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
        if (mode !== 'browsing') {
          rockSceneSide = null;
          startBrowsing();
        }
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
