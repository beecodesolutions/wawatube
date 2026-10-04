import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Box, useMediaQuery } from '@mui/material';
import {
  createCacomixtleController,
  type MascotEvent,
  type MascotState,
} from './cacomixtle-controller';
import { CACOMIXTLE_EVENT } from './cacomixtle-events';
import { cacomixtleEnabled } from './cacomixtle-config';
import './cacomixtle.css';

export function CacomixtleLayer({
  enabled = cacomixtleEnabled,
  previewState,
  motionDisabled = false,
}: {
  enabled?: boolean;
  previewState?: MascotState;
  motionDisabled?: boolean;
}) {
  const { pathname } = useLocation();
  const systemReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reducedMotion = systemReducedMotion || motionDisabled;
  const watchPath = pathname.startsWith('/watch/') ? pathname : null;
  const [state, setState] = useState<MascotState>('hidden');
  const [farewellRun, setFarewellRun] = useState(0);
  const [homeRun, setHomeRun] = useState(0);
  const [farewellActive, setFarewellActive] = useState(false);
  const [endedPath, setEndedPath] = useState<string | null>(null);
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
    let firstAppearance = watchPath === null;
    let sessionActive = watchPath === null;
    let homeRuns = 0;
    const controller = createCacomixtleController((next) => {
      if (farewell && next === 'runningRight') runs += 1;
      if (firstAppearance && next === 'runningRight') homeRuns += 1;
      if (next === 'hidden' && homeRuns >= 2) firstAppearance = false;
      setHomeRun(firstAppearance ? homeRuns : 0);
      setFarewellRun(farewell ? runs : 0);
      setState(next);
    });
    const handleEvent = (event: Event) => {
      const action = (event as CustomEvent<MascotEvent>).detail;
      if (action === 'sessionEnded') {
        farewell = true;
        setFarewellActive(true);
        runs = 0;
        firstAppearance = false;
        sessionActive = false;
      }
      if (action === 'videoStarted' || action === 'videoEnded')
        firstAppearance = false;
      if (action === 'sessionStarted' && !sessionActive) {
        firstAppearance = true;
        homeRuns = 0;
        sessionActive = true;
      }
      if (action === 'videoStarted') sessionActive = false;
      if (action === 'videoEnded') sessionActive = true;
      if (action === 'videoStarted' || action === 'sessionStarted') {
        farewell = false;
        setFarewellActive(false);
      }
      if (action === 'videoStarted') setEndedPath(null);
      if (action === 'videoEnded' || action === 'sessionEnded')
        setEndedPath(watchPath);
      controller.send(action);
    };
    window.addEventListener(CACOMIXTLE_EVENT, handleEvent);
    controller.send(watchPath ? 'videoStarted' : 'sessionStarted');
    return () => {
      window.removeEventListener(CACOMIXTLE_EVENT, handleEvent);
      controller.dispose();
      setFarewellActive(false);
    };
  }, [enabled, reducedMotion, watchPath, previewState]);

  const visibleState = previewState ?? state;
  const showFarewellScene =
    farewellActive ||
    visibleState === 'enteringCave' ||
    visibleState === 'cave';

  // Route gate hides synchronously, before effects, including paused/loading videos.
  if (
    !enabled ||
    reducedMotion ||
    pathname.startsWith('/parent') ||
    (visibleState === 'hidden' && !farewellActive) ||
    (watchPath !== null && endedPath !== watchPath)
  )
    return null;

  return createPortal(
    <Box
      aria-hidden="true"
      className="cacomixtle-layer"
      data-mascot-state={visibleState}
      data-farewell-run={previewState === undefined ? farewellRun : 0}
      data-preview={previewState !== undefined}
      data-home-run={previewState === undefined ? homeRun : 0}
      data-home={pathname === '/'}
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
      ) : (
        <div
          key={visibleState}
          className={`cacomixtle-motion cacomixtle-${visibleState}`}
        >
          <div className="cacomixtle-sprite" />
        </div>
      )}
    </Box>,
    host,
  );
}
