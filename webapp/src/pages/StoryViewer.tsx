import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { doc as firestoreDoc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import {
  BookOpen, Download, Sparkles, Home, Star, Wand2,
  ChevronLeft, ChevronRight, ZoomIn, X
} from "lucide-react";
import { Dialog, DialogContent } from "../components/ui/dialog";
import BlurImage from "../components/BlurImage";

const MAGIC_MESSAGES = [
  "Gathering stardust...",
  "Finding the perfect words...",
  "Painting colorful worlds...",
  "Weaving a magical tale...",
  "Adding sprinkles of wonder...",
  "Crafting beautiful illustrations...",
  "Bringing characters to life...",
  "Almost ready...",
];

const STATUS_MESSAGES = {
  generating: "Starting the magic...",
  understanding_input: "Understanding your child's interests...",
  planning_story: "Planning an amazing adventure...",
  writing_story: "Writing the story...",
  quality_check: "Making sure everything is perfect...",
  creating_scenes: "Imagining beautiful scenes...",
  generating_images: "Drawing illustrations...",
  creating_pdf: "Binding your storybook...",
};

export default function StoryViewer() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [magicIdx, setMagicIdx] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [leavingPage, setLeavingPage] = useState(null); // index of page animating out
  const [flipDir, setFlipDir] = useState("forward");
  const [preloading, setPreloading] = useState(true);  // waiting for images to cache
  const [zoomedPage, setZoomedPage] = useState(null);  // index of page shown in lightbox
  const [showReveal, setShowReveal] = useState(true);  // show back cover reveal before flipbook
  useEffect(() => {
    if (!storyId) return;
    const unsub = onSnapshot(
      firestoreDoc(db, "stories", storyId),
      (snap) => {
        if (snap.exists()) setStory({ story_id: snap.id, ...snap.data() });
        setLoading(false);
      },
      (e) => {
        console.error("Story listener error:", e);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [storyId]);

  // Cycle magic messages
  useEffect(() => {
    if (story?.status === "completed" || story?.status === "failed") return;
    const interval = setInterval(() => {
      setMagicIdx((prev) => (prev + 1) % MAGIC_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [story]);

  // Keyboard navigation
  useEffect(() => {
    if (story?.status !== "completed") return;
    const handler = (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goToPage(currentPage + 1);
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   goToPage(currentPage - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.status, currentPage, leavingPage]);

  const handleDownloadPDF = async () => {
    toast.info("PDF download coming soon!");
  };

  const goToPage = (next) => {
    if (leavingPage !== null) return; // already mid-flip
    const pages = sortedPages();
    if (next < 0 || next >= pages.length || next === currentPage) return;
    setFlipDir(next > currentPage ? "forward" : "back");
    setLeavingPage(currentPage);
    setCurrentPage(next);
  };

  const sortedPages = () =>
    [...(story?.pages || [])].sort((a, b) => a.page_number - b.page_number);

  // Prefer the compressed JPEG for browser display; fall back to PNG
  const pageImageUrl = (p) => {
    const url = p?.jpeg_url || p?.image_url;
    return url || null;
  };

  // Preload effect: reset preloading state each time story completes
  // (page images are rendered as hidden DOM nodes — see below — so the
  //  browser keeps them decoded. We only need to wait for page 0.)
  useEffect(() => {
    if (story?.status !== "completed" || !story?.pages?.length) return;
    setPreloading(true);
  }, [story?.status]);

  // Generating / in-progress state
  if (loading || (story && story.status !== "completed" && story.status !== "failed")) {
    const pageCount = story?.page_count || 8;
    const avatarUrl = story?.avatar_url || null;
    const isDrawing = story?.status === "generating_images";
    const stepsOrder = ["understanding_input", "planning_story", "writing_story", "quality_check", "creating_scenes", "generating_images", "creating_pdf"];
    const currentStepIdx = stepsOrder.indexOf(story?.status ?? "");

    // Pages the server has already written (may have image_url or "")
    const inProgressPages = isDrawing && story?.pages?.length > 0
      ? [...story.pages].sort((a, b) => a.page_number - b.page_number)
      : Array.from({ length: pageCount }, (_, i) => ({ page_number: i, image_url: "" }));

    const doneCount = inProgressPages.filter(p => p.image_url).length;

    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-start pt-10 pb-16 px-4" data-testid="story-generating">

        {/* Avatar hero */}
        <div className="relative mb-8">
          {avatarUrl ? (
            <div className="relative w-36 h-36 sm:w-44 sm:h-44">
              <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(#FF9F1C, #FFD166, #2A9D8F, #FF9F1C)", animation: "spin 6s linear infinite" }} />
              <div className="absolute inset-[3px] rounded-full bg-[#FDFBF7]" />
              <img
                src={avatarUrl}
                alt="Child avatar"
                className="absolute inset-[5px] rounded-full object-cover w-[calc(100%-10px)] h-[calc(100%-10px)]"
              />
              {["-top-2 -right-2", "-bottom-1 -left-2", "top-1/2 -right-4"].map((pos, i) => (
                <div key={i} className={`absolute ${pos}`} style={{ animation: `sparkle 2s ease-in-out ${i * 0.6}s infinite` }}>
                  <Star className="w-4 h-4 text-[#FF9F1C]" fill="currentColor" />
                </div>
              ))}
            </div>
          ) : (
            <div className="w-36 h-36 rounded-full bg-[#FF9F1C]/10 flex items-center justify-center">
              <Sparkles className="w-16 h-16 text-[#FF9F1C] animate-float" strokeWidth={2} />
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-medium text-[#1E1B4B] mb-2 text-center" style={{ fontFamily: "Fredoka" }}>
          {story?.title ? `"${story.title}"` : "Creating your storybook"}
        </h2>
        <p className="text-[#3730A3] font-medium mb-1 text-center" data-testid="story-status-message">
          {story ? STATUS_MESSAGES[story.status] || "Working on it..." : "Loading..."}
        </p>
        <p className="text-[#1E1B4B]/40 text-sm mb-6 animate-fade-in-up" key={magicIdx}>
          {MAGIC_MESSAGES[magicIdx]}
        </p>

        {/* Step progress bar */}
        <div className="flex items-center gap-1.5 mb-8 flex-wrap justify-center max-w-sm">
          {stepsOrder.map((step, i) => (
            <div
              key={step}
              className="h-1.5 rounded-full transition-all duration-700"
              style={{
                width: i === currentStepIdx ? "2.5rem" : "0.625rem",
                background: i < currentStepIdx ? "#2A9D8F" : i === currentStepIdx ? "#FF9F1C" : "#E5E7EB",
              }}
            />
          ))}
        </div>

        {/* Page grid — real images or shimmers */}
        <div className="w-full max-w-lg">
          {isDrawing && (
            <p className="text-xs text-[#1E1B4B]/50 text-center mb-3 uppercase tracking-wider">
              {doneCount}/{pageCount} pages drawn — tap to zoom
            </p>
          )}
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {inProgressPages.map((page, i) => {
              const thumb = page.jpeg_url || page.image_url;
              const imgSrc = thumb || null;
              const label = i === 0 ? "Cover" : i === pageCount - 1 ? "Back" : `Pg ${i}`;
              return (
                <div
                  key={i}
                  data-testid={`generating-thumb-${i}`}
                  className={`aspect-[3/4] rounded-xl overflow-hidden relative transition-all duration-500 ${imgSrc ? "cursor-pointer group" : ""}`}
                  style={{
                    boxShadow: imgSrc ? "0 4px 16px rgba(0,0,0,0.12)" : "none",
                    transform: imgSrc ? "scale(1)" : "scale(0.95)",
                  }}
                  onClick={() => imgSrc && setZoomedPage(i)}
                >
                  {imgSrc ? (
                    <>
                      <BlurImage src={imgSrc} alt={label} className="w-full h-full object-cover" />
                      {/* Zoom hint on hover */}
                      <div className="absolute inset-0 bg-[#1E1B4B]/0 group-hover:bg-[#1E1B4B]/30 transition-all flex items-center justify-center">
                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={2.5} />
                      </div>
                      {/* "Done" badge */}
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#2A9D8F] flex items-center justify-center">
                        <Wand2 className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-end pb-2 bg-[#F3E8FF]">
                      {/* Shimmer stripe */}
                      <div className="absolute inset-0 animate-shimmer" />
                      <span className="relative text-[#1E1B4B]/30 z-10" style={{ fontSize: "9px" }}>{label}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Zoom lightbox for in-progress pages */}
        <Dialog open={zoomedPage !== null} onOpenChange={() => setZoomedPage(null)}>
          <DialogContent className="max-w-3xl w-[95vw] p-0 rounded-3xl overflow-hidden border-0 bg-transparent shadow-none [&>button]:hidden">
            {zoomedPage !== null && (() => {
              const zp = inProgressPages[zoomedPage];
              const zpImg = zp?.jpeg_url || zp?.image_url;
              const zpSrc = zpImg || null;
              const zpText = zp?.text || "";
              const zpLabel = zoomedPage === 0 ? "Cover" : zoomedPage === pageCount - 1 ? "Back Cover" : `Page ${zoomedPage}`;
              const hasNext = zoomedPage < inProgressPages.length - 1 && (inProgressPages[zoomedPage + 1]?.jpeg_url || inProgressPages[zoomedPage + 1]?.image_url);
              const hasPrev = zoomedPage > 0 && (inProgressPages[zoomedPage - 1]?.jpeg_url || inProgressPages[zoomedPage - 1]?.image_url);
              return (
                <div className="relative" data-testid="zoom-lightbox">
                  {/* Close button */}
                  <button
                    onClick={() => setZoomedPage(null)}
                    className="absolute top-3 right-3 z-20 w-10 h-10 rounded-full bg-[#1E1B4B]/60 hover:bg-[#1E1B4B]/80 flex items-center justify-center transition-colors"
                    data-testid="btn-close-zoom"
                  >
                    <X className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </button>

                  {/* Image */}
                  {zpSrc ? (
                    <BlurImage
                      src={zpSrc}
                      alt={zpLabel}
                      data-testid={`zoom-image-${zoomedPage}`}
                      className="w-full rounded-3xl"
                      style={{ maxHeight: "80vh", objectFit: "contain" }}
                    />
                  ) : (
                    <div className="w-full aspect-[3/4] bg-[#F3E8FF] rounded-3xl flex items-center justify-center">
                      <Sparkles className="w-12 h-12 text-[#FF9F1C] animate-float" />
                    </div>
                  )}

                  {/* Page text overlay */}
                  {zpText && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#1E1B4B]/80 to-transparent p-6 pt-16 rounded-b-3xl">
                      <p className="text-sm text-[#1E1B4B]/40 mb-1 font-medium">{zpLabel}</p>
                      <p className="font-native text-white text-base sm:text-lg leading-relaxed">
                        {zpText}
                      </p>
                    </div>
                  )}

                  {/* Navigation arrows */}
                  {hasPrev && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setZoomedPage(zoomedPage - 1); }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#1E1B4B]/60 hover:bg-[#1E1B4B]/80 flex items-center justify-center transition-colors"
                      data-testid="btn-zoom-prev"
                    >
                      <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </button>
                  )}
                  {hasNext && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setZoomedPage(zoomedPage + 1); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#1E1B4B]/60 hover:bg-[#1E1B4B]/80 flex items-center justify-center transition-colors"
                      data-testid="btn-zoom-next"
                    >
                      <ChevronRight className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              );
            })()}</DialogContent>
        </Dialog>

        <p className="text-xs text-[#1E1B4B]/25 mt-8 text-center">
          This usually takes 2–3 minutes. Sit tight!
        </p>
      </div>
    );
  }

  // Failed state
  if (story?.status === "failed") {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#E76F51]/10 flex items-center justify-center">
            <BookOpen className="w-10 h-10 text-[#E76F51]" strokeWidth={2} />
          </div>
          <h2
            className="text-2xl font-medium text-[#1E1B4B] mb-3"
            style={{ fontFamily: "Fredoka" }}
          >
            Oops, something went wrong
          </h2>
          <p className="text-[#1E1B4B]/60 mb-8">
            We couldn&apos;t generate the storybook. Please try again.
          </p>
          <Button
            onClick={() => navigate("/create")}
            className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold px-8 min-h-[48px]"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Completed — back cover reveal before flipbook
  const pages = sortedPages();
  const total = pages.length;

  if (showReveal && total > 0) {
    const coverPage = pages[0];
    const backCover = pages[total - 1];
    const coverImg = pageImageUrl(coverPage);
    const backCoverImg = pageImageUrl(backCover);
    const storyTitle = story?.title || "Your Storybook";

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
        style={{ background: "linear-gradient(160deg, #1E1B4B 0%, #3730A3 60%, #2A9D8F 100%)" }}
        data-testid="story-reveal"
      >
        <div className="text-center max-w-lg animate-fade-in-up">
          {/* Sparkle icon */}
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-[#FF9F1C]" strokeWidth={2} />
          </div>

          <h2
            className="text-2xl sm:text-3xl tracking-tight font-semibold text-white mb-2"
            style={{ fontFamily: "Fredoka" }}
          >
            Your storybook is ready!
          </h2>
          <p className="font-native text-lg text-white/70 mb-8" style={{ fontFamily: "Fredoka" }}>
            {storyTitle}
          </p>

          {/* Front cover image */}
          <div className="relative mx-auto mb-8" style={{ maxWidth: "320px" }}>
            {/* Stacked book effect — back cover peeking behind */}
            {backCoverImg && (
              <div
                className="absolute -left-3 -top-3 w-full rounded-2xl overflow-hidden opacity-30 blur-[1px]"
                style={{ aspectRatio: "3/4", transform: "rotate(-3deg)" }}
              >
                <img src={backCoverImg} alt="Back Cover" className="w-full h-full object-cover rounded-2xl" />
              </div>
            )}

            {/* Main front cover */}
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-white/20"
              style={{ aspectRatio: "3/4" }}
              data-testid="reveal-front-cover"
            >
              {coverImg ? (
                <BlurImage
                  src={coverImg}
                  alt="Front Cover"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#FF9F1C]/20 to-[#3730A3]/20 flex items-center justify-center">
                  <BookOpen className="w-16 h-16 text-white/30" strokeWidth={1.5} />
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-6 mb-8 text-white/50 text-sm">
            <span>{total} pages</span>
            <span>&middot;</span>
            <span>{story?.language}</span>
            <span>&middot;</span>
            <span>{story?.child_name}</span>
          </div>

          {/* CTA Button */}
          <Button
            data-testid="btn-read-story"
            onClick={() => setShowReveal(false)}
            className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold text-lg px-10 min-h-[56px] shadow-xl hover:shadow-2xl transition-all"
          >
            <BookOpen className="w-5 h-5 mr-2" strokeWidth={2.5} />
            Read the Story
          </Button>

          {/* Secondary actions */}
          <div className="flex items-center justify-center gap-4 mt-5">
            <button
              data-testid="btn-download-reveal"
              onClick={handleDownloadPDF}
              className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors inline-flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" strokeWidth={2} />
              Download PDF
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors inline-flex items-center gap-1.5"
            >
              <Home className="w-4 h-4" strokeWidth={2} />
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Completed — full-screen flipbook viewer
  const page = pages[currentPage];
  const leavingPageObj = leavingPage !== null ? pages[leavingPage] : null;
  const imgUrl = pageImageUrl(page);
  const leavingImgUrl = pageImageUrl(leavingPageObj);
  const isFirst = currentPage === 0;
  const isLast = currentPage === total - 1;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #1E1B4B 0%, #3730A3 60%, #2A9D8F 100%)" }}
      data-testid="story-viewer"
    >
      {/* Hidden image preload rack — keeps ALL page images decoded in browser memory */}
      <div style={{ display: "none" }} aria-hidden="true">
        {pages.map((p, i) => {
          const src = pageImageUrl(p);
          return src ? (
            <img
              key={i}
              src={src}
              alt=""
              onLoad={() => { if (i === 0) setPreloading(false); }}
            />
          ) : null;
        })}
      </div>

      {/* "Opening storybook" overlay shown while page 0 hasn't decoded yet */}
      {preloading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: "linear-gradient(160deg, #1E1B4B 0%, #3730A3 60%, #2A9D8F 100%)" }}>
          <div className="w-14 h-14 border-[3px] border-white/20 border-t-[#FF9F1C] rounded-full animate-spin mb-6" />
          <p className="text-white/70 text-base" style={{ fontFamily: "Fredoka" }}>Opening your storybook…</p>
        </div>
      )}

      {/* Header */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-black/20 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            data-testid="btn-back-dashboard"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors shrink-0"
          >
            <Home className="w-5 h-5" strokeWidth={2.5} />
            <span className="text-sm font-medium hidden sm:block">Dashboard</span>
          </button>

          <h1
            className="text-base sm:text-lg font-medium text-white truncate"
            style={{ fontFamily: "Fredoka" }}
          >
            {story?.title || "My Storybook"}
          </h1>

          <Button
            data-testid="btn-download-pdf"
            onClick={handleDownloadPDF}
            size="sm"
            className="rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/20 shrink-0"
          >
            <Download className="w-4 h-4 mr-1.5" strokeWidth={2.5} />
            PDF
          </Button>
        </div>
      </nav>

      {/* Book area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-6">

        {/* The book card with flip effect */}
        <div
          className="book-scene w-full"
          style={{ maxWidth: "min(480px, 92vw)" }}
        >
          <div
            className="relative rounded-2xl overflow-hidden shadow-2xl"
            style={{
              aspectRatio: "3/4",
              background: "#F5F0E8",
            }}
          >
            {/* Current (incoming) page — static, always visible underneath */}
            {imgUrl ? (
              <BlurImage
                key={`cur-${currentPage}`}
                src={imgUrl}
                alt={`Page ${currentPage + 1}`}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ zIndex: 1 }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[#F5F0E8]" style={{ zIndex: 1 }}>
                <BookOpen className="w-16 h-16 text-[#1E1B4B]/20" />
              </div>
            )}

            {/* Leaving page — animates out on top */}
            {leavingPage !== null && leavingImgUrl && (
              <img
                key={`leaving-${leavingPage}`}
                src={leavingImgUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  zIndex: 2,
                  transformOrigin: flipDir === "forward" ? "left center" : "right center",
                  animation: `${flipDir === "forward" ? "bookPageLeaveForward" : "bookPageLeaveBack"} 0.42s cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards`,
                }}
                onAnimationEnd={() => setLeavingPage(null)}
              />
            )}

            {/* Fold-edge shadow on the leaving page for depth */}
            {leavingPage !== null && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  zIndex: 3,
                  background: flipDir === "forward"
                    ? "linear-gradient(to right, rgba(0,0,0,0.22) 0%, transparent 35%)"
                    : "linear-gradient(to left,  rgba(0,0,0,0.22) 0%, transparent 35%)",
                  animation: `${flipDir === "forward" ? "bookPageLeaveForward" : "bookPageLeaveBack"} 0.42s cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards`,
                  transformOrigin: flipDir === "forward" ? "left center" : "right center",
                }}
              />
            )}

            {/* Spine shadow */}
            <div
              className="absolute inset-y-0 left-0 w-6 pointer-events-none"
              style={{
                zIndex: 10,
                background: "linear-gradient(to right, rgba(0,0,0,0.18) 0%, transparent 100%)",
              }}
            />

            {/* Tap zones — left / right halves */}
            {!isFirst && (
              <button
                aria-label="Previous page"
                onClick={() => goToPage(currentPage - 1)}
                className="absolute inset-y-0 left-0 w-1/3 z-20 cursor-pointer opacity-0"
              />
            )}
            {!isLast && (
              <button
                aria-label="Next page"
                onClick={() => goToPage(currentPage + 1)}
                className="absolute inset-y-0 right-0 w-1/3 z-20 cursor-pointer opacity-0"
              />
            )}
          </div>
        </div>

        {/* Navigation controls */}
        <div className="flex items-center gap-5">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={isFirst || leavingPage !== null}
            className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-all active:scale-95"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-6 h-6" strokeWidth={2.5} />
          </button>

          {/* Page dots */}
          <div className="flex gap-1.5 flex-wrap justify-center max-w-[200px]">
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => goToPage(i)}
                className="rounded-full transition-all"
                style={{
                  width:  i === currentPage ? "1.5rem" : "0.5rem",
                  height: "0.5rem",
                  background: i === currentPage ? "#FF9F1C" : "rgba(255,255,255,0.35)",
                }}
                aria-label={`Go to page ${i + 1}`}
              />
            ))}
          </div>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={isLast || leavingPage !== null}
            className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-all active:scale-95"
            aria-label="Next page"
          >
            <ChevronRight className="w-6 h-6" strokeWidth={2.5} />
          </button>
        </div>

        {/* Page label */}
        <p className="text-white/40 text-xs">
          {currentPage === 0
            ? "Cover"
            : currentPage === total - 1
            ? "Back Cover"
            : `Page ${currentPage} of ${total - 2}`}
        </p>
      </div>
    </div>
  );
}
