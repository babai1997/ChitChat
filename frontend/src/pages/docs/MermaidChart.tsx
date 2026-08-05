import { useEffect, useRef, useState, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import mermaid from 'mermaid';
import { COLORS } from './theme';

let initialized = false;

function ensureInit() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    fontFamily: "'Inter', sans-serif",
    flowchart: { curve: 'basis', htmlLabels: true, padding: 12, nodeSpacing: 36, rankSpacing: 52, useMaxWidth: false },
    er: { useMaxWidth: false },
    themeVariables: {
      background: COLORS.bgFrom,
      primaryColor: COLORS.card,
      primaryTextColor: COLORS.text,
      primaryBorderColor: COLORS.cardBorder,
      lineColor: '#5f6b74',
      secondaryColor: COLORS.card,
      tertiaryColor: COLORS.card,
      fontSize: '13px',
      edgeLabelBackground: COLORS.bgTo,
      clusterBkg: COLORS.card,
      clusterBorder: COLORS.cardBorder,
    },
  });
  initialized = true;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.2;

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  size = 32,
  iconSize = 15,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  size?: number;
  iconSize?: number;
}) {
  const btnStyle: React.CSSProperties = {
    background: COLORS.card,
    border: `1px solid ${COLORS.cardBorder}`,
    color: COLORS.muted,
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 6, overflow: 'hidden', border: `1px solid ${COLORS.cardBorder}` }}>
      <button onClick={onZoomOut} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out" title="Zoom out" style={{ ...btnStyle, border: 'none', borderRight: `1px solid ${COLORS.cardBorder}`, opacity: zoom <= ZOOM_MIN ? 0.4 : 1 }}>
        <ZoomOut size={iconSize} />
      </button>
      <button
        onClick={onReset}
        aria-label="Reset zoom"
        title="Reset zoom"
        style={{ ...btnStyle, border: 'none', borderRight: `1px solid ${COLORS.cardBorder}`, fontSize: 11, fontFamily: 'ui-monospace, monospace', width: 44 }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={onZoomIn} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in" title="Zoom in" style={{ ...btnStyle, border: 'none', opacity: zoom >= ZOOM_MAX ? 0.4 : 1 }}>
        <ZoomIn size={iconSize} />
      </button>
    </div>
  );
}

function FullscreenModal({ svg, onClose }: { svg: string; onClose: () => void }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-' || e.key === '_') zoomOut();
      else if (e.key === '0') resetZoom();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, zoomIn, zoomOut, resetZoom]);

  useEffect(() => {
    // The inline preview renders the SVG at its native pixel size (so wide
    // diagrams scroll instead of shrinking). In the fullscreen lightbox we
    // want the opposite: scale UP to fill the available space, so drop the
    // fixed width/height attributes mermaid sets and let the viewBox scale
    // via CSS instead. The extra zoom control below layers a transform on
    // top of this base fit-to-screen size.
    const svgEl = holderRef.current?.querySelector('svg');
    if (svgEl) {
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');
      svgEl.style.width = '100%';
      svgEl.style.height = '100%';
      svgEl.style.maxWidth = 'none';
    }
  }, [svg]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 8,
          color: COLORS.text,
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <X size={20} />
      </button>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)' }}
      >
        <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} size={38} iconSize={17} />
      </div>
      <div
        ref={holderRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.bgFrom,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 12,
          padding: 28,
          width: '90vw',
          height: '85vh',
          overflow: 'auto',
          display: 'flex',
          alignItems: zoom <= 1 ? 'center' : 'flex-start',
          justifyContent: zoom <= 1 ? 'center' : 'flex-start',
        }}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: '100%',
            height: '100%',
            flexShrink: 0,
            pointerEvents: 'none',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>,
    document.body
  );
}

export function MermaidChart({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const id = useId().replace(/[:]/g, '-');

  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  useEffect(() => {
    ensureInit();
    let cancelled = false;
    mermaid
      .render(`mermaid-${id}`, chart)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return (
      <div style={{ color: '#ef4444', fontSize: 13, fontFamily: 'ui-monospace, monospace', padding: 16 }}>
        Diagram failed to render: {error}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, display: 'flex', gap: 6 }}>
        <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} />
        <button
          onClick={() => setFullscreen(true)}
          aria-label="View fullscreen"
          title="View fullscreen"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 6,
            color: COLORS.muted,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Maximize2 size={15} />
        </button>
      </div>
      <div
        ref={containerRef}
        style={{
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 12,
          background: COLORS.bgFrom,
          padding: 20,
          overflow: 'auto',
          maxHeight: 480,
          display: 'flex',
          justifyContent: zoom <= 1 ? 'safe center' : 'flex-start',
        }}
      >
        <div
          style={{ flexShrink: 0, transform: `scale(${zoom})`, transformOrigin: 'top left', pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      {fullscreen && <FullscreenModal svg={svg} onClose={() => setFullscreen(false)} />}
    </div>
  );
}
