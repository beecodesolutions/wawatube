import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Box,
  Button,
  DialogTitle,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AcornIcon } from './AcornIcon';
import { cacomixtleEnabled } from './cacomixtle-config';
import './session-acorns.css';

type Choice = 'continue' | 'finish';
type Phase = 'delivery' | 'waiting' | 'focusing' | 'entering' | 'finished';
type Point = { left: number; top: number };
type Positions = { start: Point; deposit: Point; acornScale: number };
type FocusLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};
type Destination = {
  target: Point;
  art: { left: number; top: number; width: number; height: number };
};
const looks = ['center', 'left', 'center', 'right'] as const;

export function ChildEndingScene({
  count,
  depositKey,
  onContinue,
  onFinish,
}: {
  count: number;
  depositKey: number;
  onContinue: () => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const motion = cacomixtleEnabled && !reducedMotion;
  const [phase, setPhase] = useState<Phase>(
    motion && depositKey > 0 ? 'delivery' : 'waiting',
  );
  const [choice, setChoice] = useState<Choice | null>(null);
  const [positions, setPositions] = useState<Positions | null>(null);
  const [focusLayout, setFocusLayout] = useState<FocusLayout | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [insideDestination, setInsideDestination] = useState(false);
  const [look, setLook] = useState(0);
  const sceneRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
  const forestRef = useRef<HTMLButtonElement>(null);
  const caveRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const locked = useRef(false);
  const completed = useRef(false);

  useLayoutEffect(() => {
    const measure = () => {
      const scene = sceneRef.current;
      const slot = slotRef.current?.getBoundingClientRect();
      if (!scene || !slot) return;
      const size =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--cacomixtle-size',
          ),
        ) || 100;
      const acornSize = Number.parseFloat(
        getComputedStyle(scene).getPropertyValue('--session-acorn-size'),
      );
      // Match the baked acorn center in each 627px square carrying frame.
      const deposit = {
        left: slot.left + slot.width / 2 - size * (98 / 627),
        top: slot.top + slot.height / 2 - size * (454 / 627) - 16,
      };
      setPositions({
        start: { left: window.innerWidth + size, top: deposit.top },
        deposit,
        acornScale: (size * 151) / (627 * acornSize),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useLayoutEffect(() => {
    if (choice) titleRef.current?.focus();
    else if (phase === 'waiting') forestRef.current?.focus();
  }, [choice, phase]);

  useEffect(() => {
    if (phase !== 'delivery') return;
    const timer = window.setTimeout(() => setPhase('waiting'), 4_100);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'waiting' || !motion) return;
    const timer = window.setTimeout(
      () => setLook((current) => (current + 1) % looks.length),
      4_000 + Math.random() * 5_000,
    );
    return () => window.clearTimeout(timer);
  }, [look, motion, phase]);

  const completeChoice = useCallback(() => {
    if (!choice || completed.current) return;
    completed.current = true;
    if (choice === 'continue') onContinue();
    else {
      setPhase('finished');
      onFinish();
    }
  }, [choice, onContinue, onFinish]);

  useLayoutEffect(() => {
    if (phase !== 'entering' || !choice) return;
    const image = (
      choice === 'finish' ? caveRef : forestRef
    ).current?.querySelector('img');
    const art = image?.getBoundingClientRect();
    if (!art) return;
    const size =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--cacomixtle-size',
        ),
      ) || 100;
    setDestination({
      art: {
        left: art.left,
        top: art.top,
        width: art.width,
        height: art.height,
      },
      target: {
        left:
          art.left +
          art.width * (choice === 'finish' ? 800 / 1536 : 0.52) -
          size / 2,
        top:
          art.top +
          art.height * (choice === 'finish' ? 650 / 1024 : 0.72) -
          size * 0.8,
      },
    });
  }, [choice, phase]);

  useEffect(() => {
    if (phase !== 'focusing' && phase !== 'entering') return;
    // Each stage finishes even when animation events are unavailable.
    const timer = window.setTimeout(
      phase === 'focusing' ? () => setPhase('entering') : completeChoice,
      motion
        ? phase === 'focusing'
          ? 800
          : choice === 'finish'
            ? 2_900
            : 1_700
        : 0,
    );
    return () => window.clearTimeout(timer);
  }, [choice, completeChoice, motion, phase]);

  useEffect(() => {
    if (phase !== 'entering' || choice !== 'finish' || !motion) return;
    const timer = window.setTimeout(() => setInsideDestination(true), 1_800);
    return () => window.clearTimeout(timer);
  }, [choice, motion, phase]);

  const choose = (next: Choice) => {
    if (phase !== 'waiting' || locked.current) return;
    const button = (
      next === 'finish' ? caveRef : forestRef
    ).current?.getBoundingClientRect();
    const choices = choicesRef.current?.getBoundingClientRect();
    const scene = sceneRef.current?.getBoundingClientRect();
    if (!button || !choices || !scene) return;
    locked.current = true;
    const width = Math.min(scene.width, 420);
    const height = Math.max(
      220,
      Math.min(360, window.innerHeight - choices.top - 24),
    );
    const left = scene.left + (scene.width - width) / 2;
    setFocusLayout({
      left,
      top: choices.top,
      width,
      height,
      x: button.left - left,
      y: button.top - choices.top,
      scaleX: button.width / width,
      scaleY: button.height / height,
    });
    setChoice(next);
    setPhase('focusing');
  };

  const variables = {
    '--acorn-release-scale': positions?.acornScale ?? 1,
    '--start-x': `${positions?.start.left ?? 0}px`,
    '--start-y': `${positions?.start.top ?? 0}px`,
    '--deposit-x': `${positions?.deposit.left ?? 0}px`,
    '--deposit-y': `${positions?.deposit.top ?? 0}px`,
    '--target-x': `${destination?.target.left ?? positions?.deposit.left ?? 0}px`,
    '--target-y': `${destination?.target.top ?? positions?.deposit.top ?? 0}px`,
    '--approach-y': `${(destination?.target.top ?? 0) + (choice === 'finish' ? 42 : 20)}px`,
    '--focus-left': `${focusLayout?.left ?? 0}px`,
    '--focus-top': `${focusLayout?.top ?? 0}px`,
    '--focus-width': `${focusLayout?.width ?? 0}px`,
    '--focus-height': `${focusLayout?.height ?? 0}px`,
    '--focus-x': `${focusLayout?.x ?? 0}px`,
    '--focus-y': `${focusLayout?.y ?? 0}px`,
    '--focus-scale-x': focusLayout?.scaleX ?? 1,
    '--focus-scale-y': focusLayout?.scaleY ?? 1,
    '--entry-duration': choice === 'finish' ? '2700ms' : '1500ms',
  } as CSSProperties;
  const showChoices = phase !== 'delivery';

  return (
    <Box
      ref={sceneRef}
      className="child-ending-scene"
      data-ending-phase={phase}
      data-ending-choice={choice ?? ''}
      data-motion={motion}
      style={variables}
    >
      <Box
        className="session-acorns"
        role="img"
        aria-label={t('child.sessionAcorns', { count })}
      >
        {Array.from({ length: count }, (_, index) => (
          <Box
            className="session-acorn-slot"
            key={index}
            ref={index === count - 1 ? slotRef : undefined}
            aria-hidden="true"
          >
            <AcornIcon
              className={`session-acorn-icon${index === count - 1 && phase === 'delivery' && motion ? ' ending-deposited-acorn' : ''}`}
            />
          </Box>
        ))}
      </Box>
      <DialogTitle
        id="video-ending-title"
        ref={titleRef}
        tabIndex={-1}
        sx={{ fontSize: { xs: '2rem', sm: '3.5rem' }, fontWeight: 800 }}
      >
        {t(choice === 'finish' ? 'child.goodbye' : 'child.watchAnother')}
      </DialogTitle>
      <Box
        ref={choicesRef}
        className="ending-choices"
        aria-hidden={!showChoices || undefined}
        inert={!showChoices}
      >
        <Button
          disableRipple
          ref={forestRef}
          className="ending-choice ending-forest"
          aria-label={t('child.watchAnotherShort')}
          disabled={phase !== 'waiting'}
          aria-pressed={choice === 'continue'}
          onClick={() => choose('continue')}
          onAnimationEnd={(event) => {
            if (
              event.target === event.currentTarget &&
              event.animationName === 'ending-focus-choice'
            )
              setPhase('entering');
          }}
        >
          <img
            className="ending-choice-art"
            src="/cacomixtle-forest.png"
            alt=""
            draggable={false}
          />
          <Typography
            className="ending-choice-label"
            component="span"
            sx={{ fontWeight: 800 }}
          >
            {t('child.watchAnotherShort')}
          </Typography>
        </Button>
        <Button
          disableRipple
          ref={caveRef}
          className="ending-choice ending-cave"
          aria-label={t('child.finish')}
          disabled={phase !== 'waiting'}
          aria-pressed={choice === 'finish'}
          onClick={() => choose('finish')}
          onAnimationEnd={(event) => {
            if (
              event.target === event.currentTarget &&
              event.animationName === 'ending-focus-choice'
            )
              setPhase('entering');
          }}
        >
          <Box className="ending-cave-artbox">
            <img
              className="ending-choice-art"
              src="/cacomixtle-cave-roots.png"
              alt=""
              draggable={false}
            />
          </Box>
          <Typography
            className="ending-choice-label"
            component="span"
            sx={{ fontWeight: 800 }}
          >
            {t('child.finish')}
          </Typography>
        </Button>
      </Box>
      {phase === 'entering' &&
        choice === 'finish' &&
        insideDestination &&
        destination && (
          <img
            className="ending-destination-foreground ending-cave-foreground"
            src="/cacomixtle-cave-roots.png"
            alt=""
            style={{
              left: destination.art.left,
              top: destination.art.top,
              width: destination.art.width,
              height: destination.art.height,
            }}
          />
        )}
      {cacomixtleEnabled && phase !== 'finished' && (
        <Box
          className={`ending-mascot ending-mascot-${phase === 'entering' && motion ? 'entering' : phase === 'delivery' && motion ? 'delivery' : 'waiting'}`}
          data-choice={choice ?? ''}
          data-look={looks[look]}
          aria-hidden="true"
          sx={{ visibility: positions ? 'visible' : 'hidden' }}
          onAnimationEnd={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.animationName === 'ending-delivery')
              setPhase((current) =>
                current === 'delivery' ? 'waiting' : current,
              );
            if (
              event.animationName === 'ending-choice-journey' ||
              event.animationName === 'ending-cave-journey'
            )
              completeChoice();
          }}
        >
          <div className="ending-closed-sprite" />
          {phase !== 'entering' && <div className="ending-gaze-head" />}
          {phase === 'delivery' && motion && (
            <div className="ending-carry-sprite" />
          )}
          {phase === 'entering' && motion && (
            <div className="ending-enter-sprite" />
          )}
        </Box>
      )}
    </Box>
  );
}
