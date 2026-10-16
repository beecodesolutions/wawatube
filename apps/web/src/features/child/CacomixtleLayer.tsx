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
  const [rockPresent, setRockPresent] = useState(false);
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
    let resetPending = true;
    const controller = createCacomixtleController(
      (next, nextRockSide) => {
        if (resetPending && next === 'hidden') {
          resetPending = false;
          setRockPresent(false);
          setRockSide('left');
        }
        if (nextRockSide !== undefined) setRockSide(nextRockSide);
        if (next === 'rockSettled') setRockPresent(true);
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
        setRockPresent(false);
        runs = 0;
      }
      if (action === 'videoStarted') {
        farewell = false;
        setFarewellActive(false);
        setRockPresent(false);
        setRockSide('left');
      }
      if (action === 'sessionStarted') {
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
    (visibleState === 'hidden' && !farewellActive && !rockPresent) ||
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
      ) : showRockScene || (homePath && rockPresent) ? (
        <>
          <div
            className="cacomixtle-rock-scene"
            data-rock-side={activeRockSide}
            data-rock-state={showRockScene ? visibleState : undefined}
          >
            <img
              className="cacomixtle-rock-art"
              src="/cacomixtle-rock.png"
              alt=""
              draggable={false}
            />
            <img
              className="cacomixtle-rock-droppings"
              src="/cacomixtle-droppings.png"
              alt=""
              draggable={false}
            />
            {showRockScene && visibleState !== 'rockSettled' ? (
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
          {!showRockScene && visibleState !== 'hidden' ? (
            <div
              key={visibleState}
              className={`cacomixtle-motion cacomixtle-${visibleState}`}
            >
              <div className="cacomixtle-sprite" />
            </div>
          ) : null}
        </>
      ) : visibleState !== 'hidden' ? (
        <div
          key={visibleState}
          className={`cacomixtle-motion cacomixtle-${visibleState}`}
        >
          <div className="cacomixtle-sprite" />
        </div>
      ) : null}
    </Box>,
    host,
  );
}
