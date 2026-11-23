import { useCallback, useEffect, useRef, useState } from 'react';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import { BackButton } from './BackButton';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Container,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { LegoMoc, LegoSet } from '@wawatube/shared';
import { api, errorText } from '../../api';
import {
  ChildFrame,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/Shared';
import { useTranslation } from 'react-i18next';

function LegoCover({
  src,
  alt,
  fallback = '/lego-brick.webp',
}: {
  src: string | null;
  alt: string;
  fallback?: string;
}) {
  const [imageSrc, setImageSrc] = useState(src ?? fallback);
  return (
    <Box
      component="img"
      src={imageSrc}
      alt={alt}
      onError={() => {
        if (imageSrc !== fallback) setImageSrc(fallback);
      }}
      sx={{
        display: 'block',
        width: '100%',
        aspectRatio: '16 / 10',
        objectFit: 'contain',
        background: 'linear-gradient(135deg, #f6df91, #e9a34f)',
      }}
    />
  );
}

export function LegoSetsRoute() {
  const { t } = useTranslation();
  const [sets, setSets] = useState<LegoSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    void api
      .legoSets()
      .then((result) => setSets(result.sets))
      .catch((reason: unknown) => setError(errorText(reason, t)));
  }, [t]);

  useEffect(() => {
    let active = true;
    void api
      .legoSets()
      .then((result) => {
        if (active) setSets(result.sets);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason, t));
      });
    return () => {
      active = false;
    };
  }, [t]);

  return (
    <ChildFrame>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <BackButton to="/" />
        <Typography
          variant="h1"
          sx={{ mt: 2, mb: 4, fontSize: { xs: '2.5rem', md: '4rem' } }}
        >
          LEGO
        </Typography>
        {error ? (
          <ErrorState message={error} retry={load} childFriendly />
        ) : null}
        {sets === null && !error ? <LoadingState /> : null}
        {sets?.length === 0 ? <EmptyState text="Todavía no hay sets." /> : null}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            gap: 3,
          }}
        >
          {sets?.map((set) => (
            <Card key={set.id}>
              <CardActionArea
                component={Link}
                to={`/lego/${encodeURIComponent(set.id)}`}
              >
                <LegoCover src={set.coverUrl} alt="" />
                <CardContent>
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}
                  >
                    {set.name}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Container>
    </ChildFrame>
  );
}

export function LegoMocsRoute() {
  const { t } = useTranslation();
  const { setId } = useParams();
  const [setName, setSetName] = useState('');
  const [mocs, setMocs] = useState<LegoMoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!setId) return;
    setError(null);
    void api
      .legoMocs(setId)
      .then((result) => {
        setMocs(result.mocs);
        setSetName(result.setName);
      })
      .catch((reason: unknown) => setError(errorText(reason, t)));
  }, [setId, t]);

  useEffect(() => {
    if (!setId) return undefined;
    let active = true;
    void api
      .legoMocs(setId)
      .then((result) => {
        if (!active) return;
        setMocs(result.mocs);
        setSetName(result.setName);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason, t));
      });
    return () => {
      active = false;
    };
  }, [setId, t]);

  return (
    <ChildFrame>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <BackButton to="/lego" />
        <Typography
          variant="h1"
          sx={{ mt: 3, mb: 4, fontSize: { xs: '2.5rem', md: '4rem' } }}
        >
          {setName || 'LEGO'}
        </Typography>
        {error ? (
          <ErrorState message={error} retry={load} childFriendly />
        ) : null}
        {mocs === null && !error ? <LoadingState /> : null}
        {mocs?.length === 0 ? (
          <EmptyState text="Todavía no hay instrucciones." />
        ) : null}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            gap: 3,
          }}
        >
          {mocs?.map((moc) => (
            <Card key={moc.id}>
              <CardActionArea
                component={Link}
                to={`/lego/${encodeURIComponent(setId ?? '')}/${encodeURIComponent(moc.id)}`}
                onClick={(event) => {
                  if (
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.shiftKey &&
                    !event.altKey
                  )
                    void document.documentElement
                      .requestFullscreen?.()
                      .catch(() => {});
                }}
              >
                <LegoCover src={moc.coverUrl} alt="" />
                <CardContent>
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}
                  >
                    {moc.name}
                  </Typography>
                  <Typography color="text.secondary">
                    Página {Math.max(1, moc.page)}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Container>
    </ChildFrame>
  );
}

export function LegoReaderRoute() {
  const { t } = useTranslation();
  const { setId, mocId } = useParams();
  const [moc, setMoc] = useState<LegoMoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [facingLeft, setFacingLeft] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [expanded, setExpanded] = useState(document.fullscreenElement !== null);
  const [saveError, setSaveError] = useState(false);
  const latestPageRef = useRef(1);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const readerRef = useRef<HTMLDivElement>(null);

  const queueProgress = useCallback(
    (nextPage: number) => {
      if (!mocId) return;
      latestPageRef.current = nextPage;
      saveQueueRef.current = saveQueueRef.current
        .catch(() => {})
        .then(() => {
          if (nextPage !== latestPageRef.current) return;
          return api
            .legoProgress(mocId, nextPage)
            .then(() => setSaveError(false));
        })
        .catch(() => setSaveError(true));
    },
    [mocId],
  );

  const setReaderPage = useCallback(
    (nextPage: number) => {
      if (!moc || !totalPages || error) return;
      const clamped = Math.max(1, Math.min(totalPages, Math.round(nextPage)));
      if (clamped === latestPageRef.current && !saveError) return;
      if (clamped !== latestPageRef.current)
        setFacingLeft(clamped < latestPageRef.current);
      setPage(clamped);
      queueProgress(clamped);
    },
    [queueProgress, totalPages, moc, error, saveError],
  );

  const handleTotalPages = useCallback(
    (count: number) => {
      setTotalPages(count);
      const clamped = Math.min(count, latestPageRef.current);
      if (clamped !== latestPageRef.current) {
        setPage(clamped);
        queueProgress(clamped);
      }
    },
    [queueProgress],
  );
  const handlePdfError = useCallback(
    () => setError('No pudimos abrir estas instrucciones.'),
    [],
  );

  useEffect(() => {
    if (!setId || !mocId) return undefined;
    let active = true;
    void api
      .legoMocs(setId)
      .then((result) => {
        if (!active) return;
        const found = result.mocs.find((item) => item.id === mocId);
        if (!found) {
          setError('No encontramos esas instrucciones.');
          return;
        }
        setMoc(found);
        const savedPage = Math.max(1, Math.floor(found.page));
        setPage(savedPage);
        latestPageRef.current = savedPage;
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason, t));
      });
    return () => {
      active = false;
    };
  }, [mocId, setId, t]);

  useEffect(() => {
    const onFullscreenChange = () =>
      setExpanded(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing)
        return;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.matches('input, textarea, select, [contenteditable="true"]')
      )
        return;
      event.preventDefault();
      setReaderPage(page + (event.key === 'ArrowRight' ? 1 : -1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [page, setReaderPage]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    await readerRef.current?.requestFullscreen?.().catch(() => {});
  };

  if (error) {
    return (
      <ChildFrame>
        <Container maxWidth="md" sx={{ py: 5 }}>
          <BackButton to={`/lego/${encodeURIComponent(setId ?? '')}`} />
          <ErrorState
            message={error}
            retry={() => window.location.reload()}
            childFriendly
          />
        </Container>
      </ChildFrame>
    );
  }
  if (!moc)
    return (
      <ChildFrame>
        <LoadingState />
      </ChildFrame>
    );

  return (
    <Box
      ref={readerRef}
      sx={{
        '--progress-color': '#f4cc77',
        height: '100dvh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: '#151515',
        color: '#fff',
        ...(expanded ? { width: '100vw', height: '100vh' } : {}),
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: 1,
          py: 0.25,
          background: 'rgba(0,0,0,.7)',
          zIndex: 1,
          '& > button': { width: 44, height: 44 },
        }}
      >
        <BackButton toolbar to={`/lego/${encodeURIComponent(setId ?? '')}`} />
        <Typography
          sx={{
            flex: 1,
            pl: { xs: 1, sm: 2 },
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          LEGO · {moc.name}
        </Typography>
        <Typography aria-live="polite">
          {totalPages ? `${page} / ${totalPages}` : '…'}
        </Typography>
        <IconButton
          aria-label="Reiniciar"
          onClick={() => setReaderPage(1)}
          sx={{ color: 'inherit' }}
        >
          <RestartAltRoundedIcon />
        </IconButton>
        <IconButton
          aria-label={
            expanded ? 'Salir de pantalla completa' : 'Pantalla completa'
          }
          onClick={() => void toggleFullscreen()}
          sx={{ color: 'inherit' }}
        >
          <FullscreenRoundedIcon />
        </IconButton>
      </Stack>
      {saveError ? (
        <Typography
          role="status"
          sx={{ px: 2, py: 0.5, background: '#5d1e1e', color: '#fff' }}
        >
          No pudimos guardar el progreso.
        </Typography>
      ) : null}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <PdfPageCanvas
          pdfUrl={moc.pdfUrl}
          page={page}
          onTotalPages={handleTotalPages}
          onError={handlePdfError}
        />
      </Box>
      <Box
        role="progressbar"
        aria-label="Progreso del armado"
        aria-valuemin={1}
        aria-valuemax={totalPages || 1}
        aria-valuenow={Math.min(page, totalPages || 1)}
        sx={{
          position: 'absolute',
          insetInline: 0,
          bottom: 0,
          height: 108,
          pointerEvents: 'none',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            insetInline: 0,
            bottom: 0,
            height: 16,
            bgcolor: '#6b685c',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              width:
                totalPages > 1
                  ? `${(100 * (page - 1)) / (totalPages - 1)}%`
                  : '100%',
              bgcolor: 'var(--progress-color)',
              borderRadius: 'inherit',
            }}
          />
          <Box
            aria-hidden="true"
            sx={{
              position: 'absolute',
              left: `clamp(51px, ${totalPages > 1 ? (100 * (page - 1)) / (totalPages - 1) : 100}%, calc(100% - 51px))`,
              bottom: 8,
              width: 102,
              height: 102,
              backgroundImage: "url('/cacomixtle-sprites.png')",
              backgroundSize: '400% 300%',
              backgroundPosition: `${(((page - 1) % 4) * 100) / 3}% 0`,
              transform: facingLeft
                ? 'translateX(-50%) scaleX(-1)'
                : 'translateX(-50%)',
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}

function PdfPageCanvas({
  pdfUrl,
  page,
  onTotalPages,
  onError,
}: {
  pdfUrl: string;
  page: number;
  onTotalPages: (count: number) => void;
  onError: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [documentReady, setDocumentReady] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await documentRef.current?.destroy();
        documentRef.current = null;
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const documentProxy = await pdfjs.getDocument(pdfUrl).promise;
        if (cancelled) {
          await documentProxy.destroy();
          return;
        }
        documentRef.current = documentProxy;
        onTotalPages(documentProxy.numPages);
        setDocumentReady((current) => current + 1);
      } catch {
        if (!cancelled) onError();
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [onError, onTotalPages, pdfUrl]);

  useEffect(() => {
    const documentProxy = documentRef.current;
    const canvas = canvasRef.current;
    if (!documentProxy || !canvas || size.width <= 0 || size.height <= 0)
      return undefined;
    let cancelled = false;
    renderTaskRef.current?.cancel();
    void documentProxy
      .getPage(Math.min(page, documentProxy.numPages))
      .then((pdfPage) => {
        if (cancelled) return;
        const initialViewport = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(
          size.width / initialViewport.width,
          size.height / initialViewport.height,
        );
        const viewport = pdfPage.getViewport({ scale: Math.max(0.1, scale) });
        const nextCanvas = document.createElement('canvas');
        nextCanvas.width = viewport.width;
        nextCanvas.height = viewport.height;
        const context = nextCanvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        const renderTask = pdfPage.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        return renderTask.promise.then(() => {
          if (cancelled) return;
          const visibleContext = canvas.getContext('2d');
          if (!visibleContext) throw new Error('Canvas unavailable');
          canvas.width = nextCanvas.width;
          canvas.height = nextCanvas.height;
          visibleContext.drawImage(nextCanvas, 0, 0);
        });
      })
      .catch(() => {
        if (!cancelled) onError();
      });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [documentReady, onError, page, size]);

  useEffect(
    () => () => {
      renderTaskRef.current?.cancel();
      void documentRef.current?.destroy();
      documentRef.current = null;
    },
    [],
  );

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label={`Página ${page}`}
        style={{
          display: 'block',
          maxWidth: '100%',
          maxHeight: '100%',
          boxShadow: '0 3px 24px rgba(0,0,0,.45)',
        }}
      />
    </Box>
  );
}
