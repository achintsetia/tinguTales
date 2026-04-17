import { useState, useRef, useEffect } from "react";

interface BlurImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

/**
 * BlurImage — shows a shimmer placeholder that transitions to a
 * blur-to-sharp reveal once the image is loaded. No layout shift.
 */
export default function BlurImage({ src, alt, className = "", style = {}, onLoad: onLoadProp, ...rest }: BlurImageProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset loaded state when src changes (page flip)
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  // Handle already-cached images (no onLoad fires)
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current?.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoaded(true);
    onLoadProp?.(e);
  };

  return (
    <div className="relative w-full h-full overflow-hidden" style={style}>
      {/* Shimmer placeholder — visible until loaded */}
      {!loaded && (
        <div
          className="absolute inset-0 img-placeholder flex items-center justify-center"
          style={{ zIndex: 1 }}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-[#FF9F1C]/30 border-t-[#FF9F1C] animate-spin" />
          </div>
        </div>
      )}

      {/* Actual image with blur transition */}
      {src && (
        <img
          ref={imgRef}
          src={src}
          alt={alt || ""}
          onLoad={handleLoad}
          className={`${className} transition-all duration-700 ease-out ${loaded ? "img-blur-loaded" : "img-blur-loading"}`}
          {...rest}
        />
      )}
    </div>
  );
}
