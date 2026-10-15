import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Box, useMediaQuery } from '@mui/material';
import {
  createCacomixtleController,
  type MascotEvent,
  type RockSceneSide,
  type MascotState,
} from './cacomixtle-controller';
import { CACOMIXTLE_EVENT } from './cacomixtle-events';
import { cacomixtleEnabled } from './cacomixtle-config';
import './cacomixtle.css';

export function CacomixtleLayer({
  enabled = cacomixtleEnabled,
  previewState,
  previewRockSide,
  motionDisabled = false,
}: {
  enabled?: boolean;
  previewState?: MascotState;
  previewRockSide?: RockSceneSide;
  motionDisabled?: boolean;
}) {
  const { pathname } = useLocation();
  const systemReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reducedMotion = systemReducedMotion || motionDisabled;
  const watchPath = pathname.startsWith('/watch/') ? pathname : null;
  const homePath = pathname === '/' || pathname === '/dev/cacomixtle';
  const [state, setState] = useState<MascotState>('hidden');
  const [rockSide, setRockSide] = useState<RockSceneSide>('left');
  const [farewellRun, setFarewellRun] = useState(0);
  const [farewellActive, setFarewellActive] = useState(false);
  const [host, setHost] = useState<Element>(() => document.body);

  useEffect(() => {
    const syncHost = () => setHost(document.fullscreenElement ?? document.body);
    syncHost();
    document.addEventListener('fullscreenchange', syncHost);
    return () => document.removeEventListener('fullscreenchange', syncHost);
  }, []);

  useEffect(() => {
    if (!enabled || reducedMotion || previewState !== undefined) return;
    let farewell = false;
    let runs = 0;
    const controller = createCacomixtleController(
      (next, nextRockSide) => {
        if (nextRockSide !== undefined) setRockSide(nextRockSide);
        if (farewell && next === 'runningRight') runs += 1;
        setFarewellRun(farewell ? runs : 0);
        setState(next);
      },
      { home: homePath },
    );
    const handleEvent = (event: Event) => {
      const action = (event as CustomEvent<MascotEvent>).detail;
      if (action === 'sessionEnded') {
        farewell = true;
        setFarewellActive(true);
        runs = 0;
      }
      if (action === 'videoStarted' || action === 'sessionStarted') {
        farewell = false;
        setFarewellActive(false);
      }
      // The end screen owns the mascot's acorn deposit animation.
      if (action !== 'videoEnded') controller.send(action);
    };
    window.addEventListener(CACOMIXTLE_EVENT, handleEvent);
    controller.send(watchPath ? 'videoStarted' : 'sessionStarted');
    return () => {
      window.removeEventListener(CACOMIXTLE_EVENT, handleEvent);
      controller.dispose();
      setFarewellActive(false);
    };
  }, [enabled, homePath, reducedMotion, watchPath, previewState]);

  const visibleState = previewState ?? state;
  const showFarewellScene =
    farewellActive ||
    visibleState === 'enteringCave' ||
    visibleState === 'cave';
  const showRockScene = visibleState.startsWith('rock');
  const activeRockSide = previewRockSide ?? rockSide;

  // Route gate hides synchronously, before effects, including paused/loading videos.
  if (
    !enabled ||
    reducedMotion ||
    pathname.startsWith('/parent') ||
    (visibleState === 'hidden' && !farewellActive) ||
    watchPath !== null
  )
    return null;

  return createPortal(
    <Box
      aria-hidden="true"
      className="cacomixtle-layer"
      data-mascot-state={visibleState}
      data-farewell-run={previewState === undefined ? farewellRun : 0}
      data-preview={previewState !== undefined}
      data-home={homePath}
      data-rock-side={activeRockSide}
      data-farewell-active={showFarewellScene}
    >
      {showFarewellScene ? (
        <div className="cacomixtle-farewell-scene">
          <img
            className="cacomixtle-cave-art cacomixtle-cave-back"
            src="/cacomixtle-cave-dark.png"
            alt=""
            draggable={false}
          />
          {visibleState !== 'hidden' && visibleState !== 'cave' ? (
            <div
              key={visibleState}
              className={`cacomixtle-farewell-character cacomixtle-${visibleState}`}
            >
              <div className="cacomixtle-sprite" />
              {visibleState === 'enteringCave' ? (
                <div className="cacomixtle-enter-sprite" />
              ) : null}
            </div>
          ) : null}
          <img
            className="cacomixtle-cave-art cacomixtle-cave-foreground cacomixtle-cave-foreground-rocks"
            src="/cacomixtle-cave-dark.png"
            alt=""
            draggable={false}
          />
          <img
            className="cacomixtle-cave-art cacomixtle-cave-foreground cacomixtle-cave-foreground-lip"
            src="/cacomixtle-cave-dark.png"
            alt=""
            draggable={false}
          />
        </div>
      ) : showRockScene ? (
        <div
          className="cacomixtle-rock-scene"
          data-rock-side={activeRockSide}
          data-rock-state={visibleState}
        >
          <img
            className="cacomixtle-rock-art"
            src="/cacomixtle-rock.png"
            alt=""
            draggable={false}
          />
          <svg
            aria-hidden="true"
            className="cacomixtle-rock-poop"
            viewBox="0 0 80 64"
          >
            <path
              d="M18 47c-2-6 3-10 9-11 0-6 6-10 12-7 4-5 12-2 14 4 7 0 11 4 9 9-2 7-12 8-19 5-8 4-22 4-25 0Z"
              fill="#6d432c"
            />
            <path
              d="M25 40c3-3 8-4 11-1 2 2 1 5-2 7-4 2-9 1-11-2Z"
              fill="#875638"
            />
            <path
              d="M43 40c3-3 8-2 10 1 2 3 0 6-3 7-4 1-8-1-9-4Z"
              fill="#815031"
            />
            <ellipse cx="24" cy="48" fill="#c8a06a" rx="2.5" ry="1.8" />
            <ellipse cx="35" cy="50" fill="#b98d58" rx="2.2" ry="1.5" />
            <ellipse cx="47" cy="48" fill="#c8a06a" rx="2.5" ry="1.7" />
            <ellipse cx="57" cy="45" fill="#b98d58" rx="2" ry="1.4" />
          </svg>
          {visibleState !== 'rockSettled' ? (
            <div
              className={`cacomixtle-rock-character cacomixtle-${visibleState}`}
            >
              <div
                className={
                  visibleState === 'rockPooping' ||
                  visibleState === 'rockSurprised'
                    ? 'cacomixtle-pooping-sprite'
                    : 'cacomixtle-sprite'
                }
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div
          key={visibleState}
          className={`cacomixtle-motion cacomixtle-${visibleState}`}
        >
          <div className="cacomixtle-sprite" />
          {visibleState.startsWith('walking') ? (
            <div className="cacomixtle-walk-look" />
          ) : null}
        </div>
      )}
    </Box>,
    host,
  );
}
