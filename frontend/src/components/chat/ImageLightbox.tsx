import { useEffect, useRef, useCallback, memo, useState, type CSSProperties } from "react";
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
const SWIPE_CLOSE_THRESHOLD = 80;

const parseZoomValue = (value: number) => Number.parseFloat(value.toFixed(2));

const ImageLightbox = memo(function ImageLightbox({
  src,
  alt = "Image",
  caption,
  onClose,
}: LightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [swipeY, setSwipeY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const offsetAtDrag = useRef({ x: 0, y: 0 });
  const lastTouchDist = useRef<number | null>(null);
  const containerRef = useRef<HTMLDialogElement>(null);
  const closingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closingTimer.current = setTimeout(onClose, 250);
  }, [isClosing, onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") triggerClose();
      if (e.key === "+" || e.key === "=")
        setZoom((z) => Math.min(MAX_ZOOM, parseZoomValue(z + ZOOM_STEP)));
      if (e.key === "-")
        setZoom((z) => {
          const next = Math.max(MIN_ZOOM, parseZoomValue(z - ZOOM_STEP));
          if (next === 1) { setOffset({ x: 0, y: 0 }); setSwipeY(0); }
          return next;
        });
      if (e.key === "0") { setZoom(1); setOffset({ x: 0, y: 0 }); setSwipeY(0); }
    };
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [triggerClose]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (closingTimer.current) clearTimeout(closingTimer.current); }, []);

  // Wheel to zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parseZoomValue(z + delta)));
      if (next === 1) { setOffset({ x: 0, y: 0 }); setSwipeY(0); }
      return next;
    });
  }, []);

  // ------------- TOUCH PAN & PINCH & SWIPE -------------
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDist.current = dist;
    } else if (e.touches.length === 1) {
      setIsDragging(true);
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      offsetAtDrag.current = { ...offset };
    }
  }, [offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      // Pinch to zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = (dist - lastTouchDist.current) * 0.01;
      setZoom((z) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parseZoomValue(z + delta)));
        if (next === 1) { setOffset({ x: 0, y: 0 }); setSwipeY(0); }
        return next;
      });
      lastTouchDist.current = dist;
    } else if (e.touches.length === 1 && isDragging && dragStart.current) {
      // Pan or Swipe
      const dy = e.touches[0].clientY - dragStart.current.y;
      const dx = e.touches[0].clientX - dragStart.current.x;

      if (zoom === 1) {
        setSwipeY(dy);
      } else {
        setOffset({ x: offsetAtDrag.current.x + dx, y: offsetAtDrag.current.y + dy });
      }
    }
  }, [zoom, isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    dragStart.current = null;
    lastTouchDist.current = null;

    if (zoom === 1 && Math.abs(swipeY) > SWIPE_CLOSE_THRESHOLD) {
      triggerClose();
    } else if (zoom === 1) {
      setSwipeY(0); // bounce back
    }
  }, [zoom, swipeY, triggerClose]);

  // ------------- MOUSE PAN & SWIPE -------------
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetAtDrag.current = { ...offset };
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return;
    const dy = e.clientY - dragStart.current.y;
    const dx = e.clientX - dragStart.current.x;

    if (zoom === 1) {
      setSwipeY(dy);
    } else {
      setOffset({ x: offsetAtDrag.current.x + dx, y: offsetAtDrag.current.y + dy });
    }
  }, [isDragging, zoom]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (zoom === 1 && Math.abs(swipeY) > SWIPE_CLOSE_THRESHOLD) {
      triggerClose();
    } else if (zoom === 1) {
      setSwipeY(0); // Bounce back if not swiped far enough
    }
  }, [isDragging, zoom, swipeY, triggerClose]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (zoom > 1) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setSwipeY(0);
    } else {
      setZoom(2.5);
    }
  }, [zoom]);

  // Backdrop click → close only when not dragging/swiping
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isDragging && zoom <= 1 && Math.abs(swipeY) < 10) {
      triggerClose();
    }
  }, [isDragging, zoom, swipeY, triggerClose]);

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
    setSwipeY(0);
  }, []);

  // Calculate dynamic styling for the backdrop swipe pull-to-dismiss
  const backdropOpacity = isClosing ? 0 : Math.max(0, 0.92 - Math.abs(swipeY) / 500);

  let stageCursorClass = "cursor-zoom-in";
  if (isDragging) {
    stageCursorClass = "cursor-grabbing";
  } else if (zoom > 1) {
    stageCursorClass = "cursor-grab";
  }

  return createPortal(
    <dialog
      open
      aria-label="Image viewer"
      ref={containerRef}
      className={cn(
        "lightbox-backdrop",
        isClosing ? "lightbox-backdrop--closing" : "lightbox-backdrop--open",
      )}
      style={{
        "--lightbox-swipe-opacity": Math.max(0, 1 - Math.abs(swipeY) / 100),
        backgroundColor: `hsla(0, 0%, 0%, ${backdropOpacity})`,
        backdropFilter: `blur(${Math.max(0, 12 - Math.abs(swipeY) / 10)}px)`
      } as CSSProperties}
      onCancel={(event) => {
        event.preventDefault();
        triggerClose();
      }}
    >
      <button
        type="button"
        aria-label="Close image viewer"
        className="absolute inset-0"
        onClick={handleBackdropClick}
      />

      {/* ── Toolbar top ── */}
      <div
        className={cn(
          "lightbox-toolbar lightbox-swipe-fade",
          isDragging && "lightbox-swipe-fade--dragging",
        )}
      >
        <div className="lightbox-toolbar-left">
          {caption && <span className="lightbox-caption">{caption}</span>}
        </div>
        <div className="lightbox-toolbar-right gap-1.5 md:gap-2">
          {/* Zoom indicator */}
          <span className="lightbox-zoom-label hidden md:inline-block">{Math.round(zoom * 100)}%</span>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, parseZoomValue(z - ZOOM_STEP)))}
            className="lightbox-action-btn hidden sm:flex"
            aria-label="Zoom out"
            title="Zoom out (−)"
          >
            <ZoomOut className="size-4.5" />
          </button>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, parseZoomValue(z + ZOOM_STEP)))}
            className="lightbox-action-btn hidden sm:flex"
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <ZoomIn className="size-4.5" />
          </button>

          {zoom > 1 && (
            <button
              type="button"
              onClick={resetZoom}
              className="lightbox-action-btn"
              aria-label="Reset zoom"
              title="Reset (0)"
            >
              <RotateCcw className="size-4" />
            </button>
          )}

          <div className="lightbox-divider hidden sm:block" />

          <button
            type="button"
            onClick={handleCopyLink}
            className="lightbox-action-btn"
            aria-label="Copy image link"
            title="Copy link"
          >
            <Link2 className="size-4.5" />
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="lightbox-action-btn"
            aria-label="Download image"
            title="Download"
          >
            <Download className="size-4.5" />
          </button>

          <div className="lightbox-divider" />

          <button
            type="button"
            onClick={triggerClose}
            className="lightbox-action-btn lightbox-action-btn--close"
            aria-label="Close"
            title="Close (Esc)"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* ── Image stage ── */}
      <button
        type="button"
        aria-label="Image stage"
        className={cn(
          "lightbox-stage p-0 sm:p-4 md:p-8",
          stageCursorClass,
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
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
            "lightbox-img rounded-none sm:rounded-xl md:rounded-2xl shadow-2xl",
            imgLoaded ? "lightbox-img--loaded" : "lightbox-img--loading",
            isClosing && "lightbox-img--closing",
          )}
          style={{
            transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${(offset.y + swipeY) / zoom}px)`,
            transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.33, 1, 0.68, 1)",
          }}
        />
      </button>

      {/* ── Keyboard hint ── */}
      <div
        className={cn(
          "lightbox-hint lightbox-swipe-fade",
          isDragging && "lightbox-swipe-fade--dragging",
        )}
      >
        Double-click to zoom · Swipe down to close
      </div>
    </dialog>,
    document.body,
  );
});

export default ImageLightbox;
