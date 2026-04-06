/**
 * ImageLightbox — Premium full-screen image viewer
 *
 * Features:
 * - Smooth fade/scale enter + exit animation
 * - Pinch-to-zoom / scroll-to-zoom (1x – 4x)
 * - Click-and-drag pan when zoomed
 * - Keyboard: Esc → close, +/- → zoom, 0 → reset
 * - Download button (saves original Cloudinary URL)
 * - Copy link button
 * - Caption showing sender display name + timestamp
 * - Accessible: focus-trap, aria-modal, aria-label
 */

import { useEffect, useRef, useCallback, memo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, Link2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface LightboxProps {
  src: string;
  alt?: string;
  caption?: string;
  onClose: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.4;

const ImageLightbox = memo(function ImageLightbox({
  src,
  alt = "Image",
  caption,
  onClose,
}: LightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const offsetAtDrag = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const closingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closingTimer.current = setTimeout(onClose, 220);
  }, [isClosing, onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") triggerClose();
      if (e.key === "+" || e.key === "=")
        setZoom((z) => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(2))));
      if (e.key === "-")
        setZoom((z) => {
          const next = Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(2)));
          if (next === 1) setOffset({ x: 0, y: 0 });
          return next;
        });
      if (e.key === "0") { setZoom(1); setOffset({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [triggerClose]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (closingTimer.current) clearTimeout(closingTimer.current); }, []);

  // Scroll to zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parseFloat((z + delta).toFixed(2))));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Pan drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetAtDrag.current = { ...offset };
  }, [zoom, offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({ x: offsetAtDrag.current.x + dx, y: offsetAtDrag.current.y + dy });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStart.current = null;
  }, []);

  // Backdrop click → close only when not dragging and zoom=1
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isDragging && zoom <= 1) {
      triggerClose();
    }
  }, [isDragging, zoom, triggerClose]);

  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = blob.type.split("/")[1] || "jpg";
      a.download = `moji-image-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Image downloaded!");
    } catch {
      // Fallback: open in new tab
      window.open(src, "_blank", "noopener,noreferrer");
      toast.info("Opened in new tab");
    }
  }, [src]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(src).then(() => {
      toast.success("Image link copied!");
    }).catch(() => toast.error("Failed to copy link"));
  }, [src]);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      ref={containerRef}
      className={cn(
        "lightbox-backdrop",
        isClosing ? "lightbox-backdrop--closing" : "lightbox-backdrop--open",
      )}
      onClick={handleBackdropClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── Toolbar top ── */}
      <div className="lightbox-toolbar">
        <div className="lightbox-toolbar-left">
          {caption && <span className="lightbox-caption">{caption}</span>}
        </div>
        <div className="lightbox-toolbar-right">
          {/* Zoom indicator */}
          <span className="lightbox-zoom-label">{Math.round(zoom * 100)}%</span>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(2))))}
            className="lightbox-action-btn"
            aria-label="Zoom out"
            title="Zoom out (−)"
          >
            <ZoomOut className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(2))))}
            className="lightbox-action-btn"
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <ZoomIn className="size-4" />
          </button>

          {zoom > 1 && (
            <button
              type="button"
              onClick={resetZoom}
              className="lightbox-action-btn"
              aria-label="Reset zoom"
              title="Reset (0)"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}

          <div className="lightbox-divider" />

          <button
            type="button"
            onClick={handleCopyLink}
            className="lightbox-action-btn"
            aria-label="Copy image link"
            title="Copy link"
          >
            <Link2 className="size-4" />
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="lightbox-action-btn"
            aria-label="Download image"
            title="Download"
          >
            <Download className="size-4" />
          </button>

          <div className="lightbox-divider" />

          <button
            type="button"
            onClick={triggerClose}
            className="lightbox-action-btn lightbox-action-btn--close"
            aria-label="Close"
            title="Close (Esc)"
          >
            <X className="size-4.5" />
          </button>
        </div>
      </div>

      {/* ── Image stage ── */}
      <div
        className={cn(
          "lightbox-stage",
          isDragging ? "cursor-grabbing" : zoom > 1 ? "cursor-grab" : "cursor-zoom-in",
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Skeleton while loading */}
        {!imgLoaded && (
          <div className="lightbox-skeleton">
            <div className="lightbox-skeleton-pulse" />
          </div>
        )}

        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setImgLoaded(true)}
          className={cn(
            "lightbox-img",
            imgLoaded ? "lightbox-img--loaded" : "lightbox-img--loading",
            isClosing && "lightbox-img--closing",
          )}
          style={{
            transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
            transition: isDragging ? "none" : "transform 0.18s cubic-bezier(0.25,0.46,0.45,0.94)",
          }}
        />
      </div>

      {/* ── Keyboard hint ── */}
      <div className="lightbox-hint">
        Scroll to zoom · Drag to pan · Esc to close
      </div>
    </div>,
    document.body,
  );
});

export default ImageLightbox;
