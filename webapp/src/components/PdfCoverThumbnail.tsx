import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { BookOpen, Loader2 } from "lucide-react";

// Set worker once at module level
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfCoverThumbnailProps {
  pdfUrl: string;
  alt?: string;
  className?: string;
}

/**
 * Renders the first page of a PDF as an image thumbnail.
 * Used in the dashboard when page images have been cleaned up but the PDF remains.
 */
export default function PdfCoverThumbnail({ pdfUrl, alt, className }: PdfCoverThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!pdfUrl) {
      setState("error");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          // Disable range requests to avoid CORS issues with Firebase Storage signed URLs
          disableRange: true,
          disableStream: true,
        });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Scale to fill the canvas at 2x for sharpness
        const viewport = page.getViewport({ scale: 1 });
        const containerWidth = canvas.offsetWidth || 200;
        const scale = (containerWidth / viewport.width) * 2;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        await page.render({ canvas, viewport: scaledViewport }).promise;
        if (cancelled) return;

        setState("ready");
      } catch (err) {
        if (!cancelled) {
          console.warn("[PdfCoverThumbnail] failed to render PDF cover:", err);
          setState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  if (state === "error") {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className ?? ""}`}>
        <BookOpen className="w-10 h-10 text-[#F3E8FF]" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full ${className ?? ""}`}>
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#FF9F1C] animate-spin" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        aria-label={alt}
        className="w-full h-full object-cover"
        style={{ display: state === "ready" ? "block" : "none" }}
      />
    </div>
  );
}
