import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCacomixtleController,
  type MascotState,
  type RockSceneSide,
} from '../apps/web/src/features/child/cacomixtle-controller.ts';

type Timer = { at: number; callback: () => void };

class FakeClock {
  now = 0;
  private nextId = 1;
  private readonly timers = new Map<number, Timer>();

  readonly setTimeout = (callback: () => void, delayMs: number): number => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + delayMs, callback });
    return id;
  };

  readonly clearTimeout = (handle: unknown): void => {
    if (typeof handle === 'number') this.timers.delete(handle);
  };

  advanceBy(durationMs: number): void {
    const target = this.now + durationMs;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort(([, left], [, right]) => left.at - right.at)[0];
      if (!next) break;
      const [id, timer] = next;
      this.timers.delete(id);
      this.now = timer.at;
      timer.callback();
    }
    this.now = target;
  }

  get pendingCount(): number {
    return this.timers.size;
  }
}

const createHarness = (
  randomValues: number[] = [0],
  home = true,
): {
  clock: FakeClock;
  states: MascotState[];
  rockSides: (RockSceneSide | undefined)[];
  send: (
    event: Parameters<ReturnType<typeof createCacomixtleController>['send']>[0],
  ) => void;
  dispose: () => void;
} => {
  const clock = new FakeClock();
  const states: MascotState[] = [];
  const rockSides: (RockSceneSide | undefined)[] = [];
  let randomIndex = 0;
  const controller = createCacomixtleController(
    (state, rockSide) => {
      states.push(state);
      rockSides.push(rockSide);
    },
    {
      home,
      random: () =>
        randomValues[Math.min(randomIndex++, randomValues.length - 1)] ?? 0,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    },
  );
  return {
    clock,
    states,
    rockSides,
    send: controller.send,
    dispose: controller.dispose,
  };
};

test('starts one walking appearance after the initial cooldown', () => {
  const { clock, states, send } = createHarness([0, 0.5, 0]);

  send('sessionStarted');
  send('sessionStarted');
  assert.deepEqual(states, ['hidden']);
  assert.equal(clock.pendingCount, 1);

  clock.advanceBy(1_999);
  assert.deepEqual(states, ['hidden']);
  clock.advanceBy(1);
  assert.deepEqual(states, ['hidden', 'walkingLeftToRight']);

  clock.advanceBy(6_499);
  assert.deepEqual(states, ['hidden', 'walkingLeftToRight']);
  clock.advanceBy(1);
  assert.deepEqual(states, ['hidden', 'walkingLeftToRight', 'hidden']);
  assert.equal(clock.pendingCount, 1);
});

test('keeps the legacy appearance cadence outside the home route', () => {
  const { clock, states, send } = createHarness([0], false);

  send('sessionStarted');
  clock.advanceBy(2_000 + 2_000 + 2_500 + 2_000);
  assert.deepEqual(states, [
    'hidden',
    'runningRight',
    'idle',
    'runningRight',
    'hidden',
  ]);
});

test('video playback hides the mascot and resumes with a short idle state', () => {
  const { clock, states, send } = createHarness([0]);

  send('sessionStarted');
  send('videoStarted');
  assert.deepEqual(states, ['hidden', 'hidden']);
  assert.equal(clock.pendingCount, 0);

  clock.advanceBy(10_000);
  assert.deepEqual(states, ['hidden', 'hidden']);

  send('videoEnded');
  clock.advanceBy(1_999);
  assert.deepEqual(states, ['hidden', 'hidden']);
  clock.advanceBy(1);
  assert.deepEqual(states, ['hidden', 'hidden', 'idle']);
  clock.advanceBy(2_500);
  assert.deepEqual(states, ['hidden', 'hidden', 'idle', 'hidden']);
  assert.equal(clock.pendingCount, 1);
});

test('chooses all four walking routes deterministically', () => {
  const routes: MascotState[] = [
    'walkingLeftToRight',
    'walkingRightToLeft',
    'walkingLeftToLeft',
    'walkingRightToRight',
  ];
  const routeSamples = [0, 0.3, 0.55, 0.8];

  routes.forEach((route, index) => {
    const { clock, states, send } = createHarness([
      0,
      0.5,
      routeSamples[index]!,
    ]);
    send('sessionStarted');
    clock.advanceBy(2_000);
    assert.equal(states[1], route);
    clock.advanceBy(6_500);
    assert.equal(states[2], 'hidden');
  });
});

test('plays the rock scene at 25 percent and keeps scene and flee directions independent', () => {
  const rock = createHarness([0, 0.24, 0.9, 0.1]);
  rock.send('sessionStarted');
  rock.clock.advanceBy(2_000);
  assert.deepEqual(rock.states, ['hidden', 'rockPooping']);
  rock.clock.advanceBy(1_999);
  assert.deepEqual(rock.states, ['hidden', 'rockPooping']);
  rock.clock.advanceBy(1);
  assert.deepEqual(rock.states, ['hidden', 'rockPooping', 'rockSurprised']);
  rock.clock.advanceBy(600);
  assert.deepEqual(rock.states, [
    'hidden',
    'rockPooping',
    'rockSurprised',
    'rockFleeLeft',
  ]);
  assert.deepEqual(rock.rockSides.slice(1, 4), ['right', 'right', 'right']);
  rock.clock.advanceBy(1_999);
  assert.deepEqual(rock.states, [
    'hidden',
    'rockPooping',
    'rockSurprised',
    'rockFleeLeft',
  ]);
  rock.clock.advanceBy(1);
  assert.deepEqual(rock.states, [
    'hidden',
    'rockPooping',
    'rockSurprised',
    'rockFleeLeft',
    'rockSettled',
  ]);
  rock.clock.advanceBy(1_400);
  assert.deepEqual(rock.states, [
    'hidden',
    'rockPooping',
    'rockSurprised',
    'rockFleeLeft',
    'rockSettled',
    'hidden',
  ]);

  const boundary = createHarness([0, 0.25, 0]);
  boundary.send('sessionStarted');
  boundary.clock.advanceBy(2_000);
  assert.equal(boundary.states[1], 'walkingLeftToRight');

  const left = createHarness([0, 0.24, 0.1, 0.9]);
  left.send('sessionStarted');
  left.clock.advanceBy(4_600);
  assert.equal(left.states[3], 'rockFleeRight');
  assert.deepEqual(left.rockSides.slice(1, 4), ['left', 'left', 'left']);
});

test('reuses the latrine side for later rock appearances in one session', () => {
  const rock = createHarness([0, 0.24, 0.9, 0.1, 0, 0.24, 0.9]);
  rock.send('sessionStarted');
  rock.clock.advanceBy(8_000 + 45_000);
  assert.equal(rock.states.at(-1), 'rockPooping');
  assert.deepEqual(
    rock.rockSides.filter((side): side is RockSceneSide => side !== undefined),
    ['right', 'right', 'right', 'right', 'right'],
  );
});

test('interrupts or disposes every rock phase without leaving timers', () => {
  const phases: readonly [number, MascotState][] = [
    [0, 'rockPooping'],
    [2_000, 'rockSurprised'],
    [2_600, 'rockFleeLeft'],
    [4_600, 'rockSettled'],
  ];

  for (const [elapsed, phase] of phases) {
    const interrupted = createHarness([0, 0.1, 0]);
    interrupted.send('sessionStarted');
    interrupted.clock.advanceBy(2_000 + elapsed);
    assert.equal(interrupted.states.at(-1), phase);
    interrupted.send('videoStarted');
    assert.equal(interrupted.states.at(-1), 'hidden');
    assert.equal(interrupted.clock.pendingCount, 0);

    const disposed = createHarness([0, 0.1, 0]);
    disposed.send('sessionStarted');
    disposed.clock.advanceBy(2_000 + elapsed);
    assert.equal(disposed.states.at(-1), phase);
    disposed.dispose();
    assert.equal(disposed.clock.pendingCount, 0);
    disposed.clock.advanceBy(10_000);
    assert.equal(disposed.states.at(-1), phase);
  }
});

test('videoStarted interrupts active and waving states and cancels callbacks', () => {
  const active = createHarness([0]);
  active.send('sessionStarted');
  active.clock.advanceBy(2_000);
  active.send('videoStarted');
  assert.deepEqual(active.states, ['hidden', 'rockPooping', 'hidden']);
  assert.equal(active.clock.pendingCount, 0);
  active.clock.advanceBy(200_000);
  assert.deepEqual(active.states, ['hidden', 'rockPooping', 'hidden']);

  const waving = createHarness([0]);
  waving.send('sessionStarted');
  waving.send('sessionEnded');
  waving.clock.advanceBy(2_500);
  assert.deepEqual(waving.states, [
    'hidden',
    'hidden',
    'runningRight',
    'waving',
  ]);
  waving.send('videoStarted');
  assert.deepEqual(waving.states, [
    'hidden',
    'hidden',
    'runningRight',
    'waving',
    'hidden',
  ]);
  assert.equal(waving.clock.pendingCount, 0);
  waving.clock.advanceBy(200_000);
  assert.deepEqual(waving.states, [
    'hidden',
    'hidden',
    'runningRight',
    'waving',
    'hidden',
  ]);

  const cave = createHarness([0]);
  cave.send('sessionEnded');
  cave.clock.advanceBy(1_000 + 1_500 + 1_200 + 2_800);
  assert.deepEqual(cave.states, [
    'hidden',
    'runningRight',
    'waving',
    'enteringCave',
    'cave',
  ]);
  assert.equal(cave.clock.pendingCount, 0);
  cave.send('videoStarted');
  assert.deepEqual(cave.states, [
    'hidden',
    'runningRight',
    'waving',
    'enteringCave',
    'cave',
    'hidden',
  ]);
  cave.clock.advanceBy(200_000);
  assert.deepEqual(cave.states, [
    'hidden',
    'runningRight',
    'waving',
    'enteringCave',
    'cave',
    'hidden',
  ]);
});

test('session end runs the goodbye sequence once and userIdle does not disturb cooldowns', () => {
  const { clock, states, send } = createHarness([0]);

  send('sessionStarted');
  send('userIdle');
  send('sessionEnded');
  assert.deepEqual(states, ['hidden', 'hidden']);
  assert.equal(clock.pendingCount, 1);

  clock.advanceBy(1_000);
  assert.deepEqual(states, ['hidden', 'hidden', 'runningRight']);
  clock.advanceBy(1_500);
  assert.deepEqual(states, ['hidden', 'hidden', 'runningRight', 'waving']);
  clock.advanceBy(1_199);
  assert.deepEqual(states, ['hidden', 'hidden', 'runningRight', 'waving']);
  clock.advanceBy(1);
  assert.deepEqual(states, [
    'hidden',
    'hidden',
    'runningRight',
    'waving',
    'enteringCave',
  ]);
  clock.advanceBy(2_799);
  assert.deepEqual(states, [
    'hidden',
    'hidden',
    'runningRight',
    'waving',
    'enteringCave',
  ]);
  clock.advanceBy(1);
  assert.deepEqual(states, [
    'hidden',
    'hidden',
    'runningRight',
    'waving',
    'enteringCave',
    'cave',
  ]);
  assert.equal(clock.pendingCount, 0);

  send('sessionEnded');
  assert.deepEqual(states, [
    'hidden',
    'hidden',
    'runningRight',
    'waving',
    'enteringCave',
    'cave',
  ]);

  send('sessionStarted');
  assert.deepEqual(states, [
    'hidden',
    'hidden',
    'runningRight',
    'waving',
    'enteringCave',
    'cave',
    'hidden',
  ]);
  assert.equal(clock.pendingCount, 1);
});

test('dispose cancels the only pending timer and prevents later callbacks', () => {
  const { clock, states, send, dispose } = createHarness([0]);

  send('sessionStarted');
  dispose();
  assert.equal(clock.pendingCount, 0);
  send('videoStarted');
  send('sessionEnded');
  send('sessionStarted');
  clock.advanceBy(10_000);
  assert.deepEqual(states, ['hidden']);
});
