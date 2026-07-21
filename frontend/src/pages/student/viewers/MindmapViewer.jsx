import React, { Suspense, lazy, useMemo } from "react";
import { ImageOff, Move3d } from "lucide-react";

const MindmapCanvas = lazy(() => import("./MindmapCanvas"));

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

class MindmapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: false };
  }
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(err) {
    // eslint-disable-next-line no-console
    console.error("Mindmap 3D viewer failed, falling back to flat image", err);
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

// payload shape: { image_url, caption? }
const MindmapViewer = ({ content }) => {
  const url = content.payload?.image_url;
  const caption = content.payload?.caption;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const src = useMemo(() => (url ? (url.startsWith("http") ? url : `${BACKEND_URL}${url}`) : null), [url]);

  if (!src) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center" data-testid="mindmap-empty">
        <ImageOff size={28} className="mx-auto text-white/25" />
        <div className="mt-3 text-sm text-white/40">No mind map image yet.</div>
      </div>
    );
  }

  const flatFallback = (
    <div className="rounded-2xl overflow-hidden border border-white/10" data-testid="mindmap-flat-fallback">
      <img src={src} alt={caption || "Mind map"} className="w-full max-h-[50vh] object-contain bg-black/30" />
    </div>
  );

  return (
    <div>
      <div
        className="relative rounded-2xl overflow-hidden border border-[#00f0ff]/20 bg-gradient-to-b from-[#120a1f] to-[#0a0514]"
        style={{ height: "min(56vh, 420px)" }}
        data-testid="mindmap-3d"
      >
        <MindmapErrorBoundary fallback={flatFallback}>
          <Suspense fallback={<div className="h-full grid place-items-center text-xs text-white/30">Loading 3D view…</div>}>
            <MindmapCanvas url={src} reduce={reduce} />
          </Suspense>
        </MindmapErrorBoundary>
        <div className="pointer-events-none absolute bottom-2 right-3 flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/30">
          <Move3d size={11} /> Drag to orbit · Scroll to zoom
        </div>
      </div>
      {caption && <p className="mt-3 text-sm text-white/60">{caption}</p>}
    </div>
  );
};

export default MindmapViewer;
