import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCacomixtleController,
  type MascotState,
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
): {
  clock: FakeClock;
  states: MascotState[];
  send: (
    event: Parameters<ReturnType<typeof createCacomixtleController>['send']>[0],
  ) => void;
  dispose: () => void;
} => {
  const clock = new FakeClock();
  const states: MascotState[] = [];
  let randomIndex = 0;
  const controller = createCacomixtleController((state) => states.push(state), {
    random: () =>
      randomValues[Math.min(randomIndex++, randomValues.length - 1)] ?? 0,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });
  return { clock, states, send: controller.send, dispose: controller.dispose };
};

test('starts browsing once and follows the initial appearance cooldown', () => {
  const { clock, states, send } = createHarness([0]);

  send('sessionStarted');
  send('sessionStarted');
  assert.deepEqual(states, ['hidden']);
  assert.equal(clock.pendingCount, 1);

  clock.advanceBy(1_999);
  assert.deepEqual(states, ['hidden']);
  clock.advanceBy(1);
  assert.deepEqual(states, ['hidden', 'runningRight']);

  clock.advanceBy(1_999);
  assert.deepEqual(states, ['hidden', 'runningRight']);
  clock.advanceBy(1);
  assert.deepEqual(states, ['hidden', 'runningRight', 'idle']);
  clock.advanceBy(2_499);
  assert.deepEqual(states, ['hidden', 'runningRight', 'idle']);
  clock.advanceBy(1);
  assert.deepEqual(states, ['hidden', 'runningRight', 'idle', 'runningRight']);
  clock.advanceBy(1_999);
  assert.deepEqual(states, ['hidden', 'runningRight', 'idle', 'runningRight']);
  clock.advanceBy(1);
  assert.deepEqual(states, [
    'hidden',
    'runningRight',
    'idle',
    'runningRight',
    'hidden',
  ]);
  assert.equal(clock.pendingCount, 1);
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

test('chooses runningLeft, peeking, and idle with the requested browse durations', () => {
  const { clock, states, send } = createHarness([0, 0, 0.3, 1, 0.6, 0, 0.9]);

  send('sessionStarted');
  clock.advanceBy(2_000 + 2_000 + 2_500 + 2_000);
  assert.deepEqual(states, [
    'hidden',
    'runningRight',
    'idle',
    'runningRight',
    'hidden',
  ]);

  clock.advanceBy(45_000);
  assert.deepEqual(states, [
    'hidden',
    'runningRight',
    'idle',
    'runningRight',
    'hidden',
    'runningLeft',
  ]);
  clock.advanceBy(4_000 + 120_000);
  assert.deepEqual(states, [
    'hidden',
    'runningRight',
    'idle',
    'runningRight',
    'hidden',
    'runningLeft',
    'hidden',
    'peeking',
  ]);
  clock.advanceBy(1_800 + 45_000);
  assert.deepEqual(states, [
    'hidden',
    'runningRight',
    'idle',
    'runningRight',
    'hidden',
    'runningLeft',
    'hidden',
    'peeking',
    'hidden',
    'idle',
  ]);
  clock.advanceBy(2_500);
  assert.deepEqual(states, [
    'hidden',
    'runningRight',
    'idle',
    'runningRight',
    'hidden',
    'runningLeft',
    'hidden',
    'peeking',
    'hidden',
    'idle',
    'hidden',
  ]);
});

test('videoStarted interrupts active and waving states and cancels callbacks', () => {
  const active = createHarness([0]);
  active.send('sessionStarted');
  active.clock.advanceBy(2_000);
  active.send('videoStarted');
  assert.deepEqual(active.states, ['hidden', 'runningRight', 'hidden']);
  assert.equal(active.clock.pendingCount, 0);
  active.clock.advanceBy(200_000);
  assert.deepEqual(active.states, ['hidden', 'runningRight', 'hidden']);

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
