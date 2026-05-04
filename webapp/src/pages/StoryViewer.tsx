import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db, functions } from "../firebase";
import { doc as firestoreDoc, collection, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import {
  BookOpen, Download, Sparkles, Home, Star, Wand2,
  ChevronLeft, ChevronRight, ZoomIn, X, RotateCcw
} from "lucide-react";
import { Dialog, DialogContent } from "../components/ui/dialog";
import BlurImage from "../components/BlurImage";
import { Analytics } from "../lib/analytics";

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
  approved: "Story approved — preparing illustrations...",
  generating_scenes: "Imagining every scene...",
  generating_cover: "Painting the cover...",
  generating_pages: "Drawing illustrations page by page...",
  creating_scenes: "Imagining beautiful scenes...",
  generating_images: "Drawing illustrations...",
  creating_pdf: "Binding your storybook...",
  scenes_failed: "Scene planning failed — tap Retry to try again",
};

export default function StoryViewer() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [magicIdx, setMagicIdx] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [leavingPage, setLeavingPage] = useState(null); // index of page animating out
  const [flipDir, setFlipDir] = useState("forward");
  const [preloading, setPreloading] = useState(true);  // waiting for images to cache
  const [zoomedPage, setZoomedPage] = useState(null);  // index of page shown in lightbox
  const [showReveal, setShowReveal] = useState(true);  // show back cover reveal before flipbook
  const [livePages, setLivePages] = useState<{page_number: number; image_url: string | null; jpeg_url: string | null; text?: string; status?: string}[]>([]);
  const [allLooksGood, setAllLooksGood] = useState(false);  // user confirmed quality check — persisted in Firestore
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundIssue, setRefundIssue] = useState("");
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [refundSubmitted, setRefundSubmitted] = useState(false); // real-time page images from subcollection
  const [showCloseHint, setShowCloseHint] = useState(false); // shown after 2 min of generating
  const storyViewedRef = useRef(false);

  useEffect(() => {
    if (!storyId) return;
    const unsub = onSnapshot(
      firestoreDoc(db, "stories", storyId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setStory({ story_id: snap.id, ...data });
          if (data.quality_confirmed_at) setAllLooksGood(true);
          if (data.status === "completed" && !storyViewedRef.current) {
            storyViewedRef.current = true;
            Analytics.storyViewed(snap.id);
          }
        }
        setLoading(false);
      },
      (e) => {
        console.error("Story listener error:", e);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [storyId]);

  // Live pages subcollection listener — updates as each image is generated
  useEffect(() => {
    if (!storyId) return;
    // Only listen during active generation or until completed
    const unsub = onSnapshot(
      collection(db, "stories", storyId, "pages"),
      (snap) => {
        const docs = snap.docs.map((d) => {
          const data = d.data();
          return {
            page_number: data.page as number,
            image_url: (data.image_url as string) ?? null,
            jpeg_url: (data.jpeg_url as string) ?? null,
            text: (data.text as string) ?? "",
            status: (data.status as string) ?? "pending",
          };
        });
        docs.sort((a, b) => a.page_number - b.page_number);
        setLivePages(docs);
      },
      (e) => console.warn("Pages listener error:", e)
    );
    return () => unsub();
  }, [storyId]);

  // Show "you can close this" hint after 2 minutes of generating
  useEffect(() => {
    const isGenerating = story && story.status !== "completed" && story.status !== "failed" && story.status !== "scenes_failed";
    if (!isGenerating) { setShowCloseHint(false); return; }
    const timer = setTimeout(() => setShowCloseHint(true), 2 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [story?.status]);

  // Cycle magic messages
  useEffect(() => {
    if (story?.status === "completed" || story?.status === "failed" || story?.status === "scenes_failed") return;
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

  const handleSubmitRefund = async () => {
    if (!refundIssue.trim()) {
      toast.error("Please describe the issue first.");
      return;
    }
    setSubmittingRefund(true);
    try {
      const fn = httpsCallable(functions, "submitRefundRequest");
      await fn({ storyId, issue: refundIssue.trim() });
      setRefundSubmitted(true);
      setShowRefundForm(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to submit refund request";
      toast.error(msg);
    } finally {
      setSubmittingRefund(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (story?.pdf_url) {
      try {
        const fn = httpsCallable(functions, "recordPdfDownload");
        await fn({ storyId });
      } catch (e) {
        console.warn("Failed to record PDF download:", e);
      }
      Analytics.pdfDownloaded(storyId!);
      window.open(story.pdf_url, "_blank");
    } else {
      toast.info("PDF is being prepared, please check back shortly.");
    }
  };

  const goToPage = (next) => {
    if (leavingPage !== null) return; // already mid-flip
    const pages = sortedPages();
    if (next < 0 || next >= pages.length || next === currentPage) return;
    setFlipDir(next > currentPage ? "forward" : "back");
    setLeavingPage(currentPage);
    setCurrentPage(next);
  };

  const sortedPages = () => {
    // Prefer live subcollection pages (have image_url), fall back to story.pages
    const source = livePages.length > 0 ? livePages : (story?.pages || []);
    return [...source].sort((a, b) => a.page_number - b.page_number);
  };

  // Prefer the compressed JPEG for browser display; fall back to PNG
  const pageImageUrl = (p) => {
    const url = p?.jpeg_url || p?.image_url;
    return url || null;
  };

  // Preload effect: reset preloading state each time story completes
  // (page images are rendered as hidden DOM nodes — see below — so the
  //  browser keeps them decoded. We only need to wait for page 0.)
  useEffect(() => {
    if (story?.status !== "completed") return;
    setPreloading(true);
  }, [story?.status]);

  // Generating / in-progress state
  if (loading || (story && story.status !== "completed" && story.status !== "failed" && story.status !== "scenes_failed")) {
    const pageCount = story?.page_count || 8;
    const avatarUrl = story?.avatar_url || null;
    const isDrawing = story?.status === "generating_images" || story?.status === "creating_pdf";
    const stepsOrder = ["understanding_input", "planning_story", "writing_story", "quality_check", "approved", "generating_scenes", "generating_images", "creating_pdf"];
    const currentStepIdx = stepsOrder.indexOf(story?.status ?? "");

    // Build a full pageCount-length array of placeholder slots, then overlay
    // whatever the subcollection has returned so far. This ensures pages 0..N-1
    // are always shown even when the subcollection only contains a subset.
    const placeholders = Array.from({ length: pageCount }, (_, i) => ({
      page_number: i,
      image_url: null as string | null,
      jpeg_url: null as string | null,
      text: "",
      status: "pending",
    }));
    const liveMap = new Map(livePages.map((p) => [p.page_number, p]));
    const inProgressPages = placeholders.map((p) => liveMap.get(p.page_number) ?? p);

    const doneCount = inProgressPages.filter(p => p.jpeg_url || p.image_url).length;

    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-start pt-8 pb-6 px-2" data-testid="story-generating">

        {/* Avatar hero */}
        <div className="relative mb-6">
          {avatarUrl ? (
            <div className="relative w-56 h-56 sm:w-72 sm:h-72">
              <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(#FF9F1C, #FFD166, #2A9D8F, #FF9F1C)", animation: "spin 6s linear infinite" }} />
              <div className="absolute inset-[4px] rounded-full bg-[#FDFBF7]" />
              <img
                src={avatarUrl}
                alt="Child avatar"
                className="absolute inset-[6px] rounded-full object-cover w-[calc(100%-12px)] h-[calc(100%-12px)]"
              />
              {["-top-3 -right-3", "-bottom-2 -left-3", "top-1/2 -right-5"].map((pos, i) => (
                <div key={i} className={`absolute ${pos}`} style={{ animation: `sparkle 2s ease-in-out ${i * 0.6}s infinite` }}>
                  <Star className="w-6 h-6 text-[#FF9F1C]" fill="currentColor" />
                </div>
              ))}
            </div>
          ) : (
            <div className="w-56 h-56 rounded-full bg-[#FF9F1C]/10 flex items-center justify-center">
              <Sparkles className="w-24 h-24 text-[#FF9F1C] animate-float" strokeWidth={2} />
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
        <div className="w-full">
          {(isDrawing || doneCount > 0) && (
            <p className="text-xs text-[#1E1B4B]/50 text-center mb-3 uppercase tracking-wider">
              {doneCount}/{pageCount} pages drawn — tap to zoom
            </p>
          )}
          <div className="overflow-x-auto pb-2">
            <div className="flex flex-row gap-3 snap-x snap-mandatory px-4 w-max mx-auto">
            {inProgressPages.map((page, i) => {
              const thumb = page.jpeg_url || page.image_url;
              const imgSrc = thumb || null;
              const label = i === 0 ? "Cover" : i === pageCount - 1 ? "Back" : `Pg ${i}`;
              return (
                <div
                  key={imgSrc ? `done-${page.page_number}` : `pending-${page.page_number}`}
                  data-testid={`generating-thumb-${i}`}
                  className={`flex-shrink-0 snap-start w-32 h-44 sm:w-40 sm:h-56 rounded-xl overflow-hidden relative transition-all duration-500 ${
                    imgSrc ? "cursor-pointer group animate-pop-in" : ""
                  }`}
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
                    <img
                      src={zpSrc}
                      alt={zpLabel}
                      data-testid={`zoom-image-${zoomedPage}`}
                      className={`w-full block ${zpText ? "rounded-t-3xl" : "rounded-3xl"}`}
                      style={{ maxHeight: zpText ? "70vh" : "85vh", objectFit: "contain" }}
                    />
                  ) : (
                    <div className="w-full aspect-[3/4] bg-[#F3E8FF] rounded-3xl flex items-center justify-center">
                      <Sparkles className="w-12 h-12 text-[#FF9F1C] animate-float" />
                    </div>
                  )}

                  {/* Page text reference */}
                  {zpText && (
                    <div className="bg-[#1E1B4B] p-4 sm:p-5 rounded-b-3xl max-h-[18vh] overflow-y-auto">
                      <p className="text-xs text-white/50 mb-1 font-medium uppercase tracking-wider">{zpLabel}</p>
                      <p className="font-story text-white text-base sm:text-lg leading-relaxed">
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

        {showCloseHint ? (
          <div className="mt-8 max-w-sm mx-auto text-center bg-[#3730A3]/5 border border-[#3730A3]/15 rounded-2xl px-5 py-4">
            <p className="text-sm font-semibold text-[#3730A3] mb-1">Feel free to close this tab</p>
            <p className="text-xs text-[#1E1B4B]/55 leading-relaxed">
              We'll send you an email when your storybook is ready. You can come back and download it anytime from your dashboard.
            </p>
          </div>
        ) : (
          <p className="text-xs text-[#1E1B4B]/25 mt-8 text-center">
            This usually takes 10–15 minutes. Sit tight!
          </p>
        )}
      </div>
    );
  }

  // scenes_failed state — inline retry (shown inside the generating UI)
  if (story?.status === "scenes_failed") {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#FF9F1C]/10 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-[#FF9F1C]" strokeWidth={2} />
          </div>
          <h2
            className="text-2xl font-medium text-[#1E1B4B] mb-3"
            style={{ fontFamily: "Fredoka" }}
          >
            Scene planning hit a snag
          </h2>
          <p className="text-[#1E1B4B]/60 mb-6">
            The illustration planner hit a temporary hiccup. Your story text is safe
            — tap <strong>Retry</strong> to try again.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <Button
              onClick={async () => {
                if (retrying) return;
                setRetrying(true);
                try {
                  const fn = httpsCallable(functions, "retrySceneGeneration");
                  await fn({ storyId });
                  toast.success("Retrying scene generation…");
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : "Retry failed";
                  toast.error(msg);
                  setRetrying(false);
                }
              }}
              disabled={retrying}
              className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold px-8 min-h-[48px] gap-2"
            >
              <RotateCcw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} strokeWidth={2.5} />
              {retrying ? "Retrying…" : "Retry Illustrations"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard")}
              className="rounded-full text-[#1E1B4B]/50 hover:text-[#1E1B4B] px-8 min-h-[48px]"
            >
              <Home className="w-4 h-4 mr-2" strokeWidth={2} />
              Dashboard
            </Button>
          </div>
        </div>
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

        </div>
      </nav>

      {/* Book area */}
      <div className="flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-center px-4 py-8 gap-8">

        {/* Book column */}
        <div className="flex flex-col items-center gap-6 w-full" style={{ maxWidth: "min(480px, 92vw)" }}>

        {/* The book card with flip effect */}
        <div
          className="book-scene w-full"
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

        </div>{/* end book column */}

        {/* Quality check side panel */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 lg:mt-4">
          <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-5 text-white">
            {!allLooksGood ? (
              <>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-[#FF9F1C]/20 flex items-center justify-center shrink-0 mt-0.5">
                <Star className="w-4 h-4 text-[#FF9F1C]" fill="currentColor" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm mb-1" style={{ fontFamily: "Fredoka" }}>
                  Review your storybook
                </h3>
                <p className="text-white/70 text-xs leading-relaxed">
                  AI can make mistakes — please review every page carefully. Only after you press <span className="text-white font-medium">All Looks Good</span> will your PDF download link become available. If you spot any defect, you can request a refund instead.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
                {!showRefundForm && !refundSubmitted && (
                  <>
                    <Button
                      data-testid="btn-all-looks-good"
                      onClick={async () => {
                        setAllLooksGood(true);
                        try {
                          await updateDoc(firestoreDoc(db, "stories", storyId!), {
                            quality_confirmed_at: serverTimestamp(),
                          });
                        } catch (e) {
                          console.warn("Failed to persist quality confirmation", e);
                        }
                      }}
                      className="w-full rounded-full bg-[#2A9D8F] hover:bg-[#23877B] text-white font-semibold min-h-[44px] gap-2"
                    >
                      <Star className="w-4 h-4" fill="currentColor" strokeWidth={0} />
                      All Looks Good
                    </Button>
                    <Button
                      data-testid="btn-ask-refund"
                      variant="ghost"
                      onClick={() => setShowRefundForm(true)}
                      className="w-full rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-white/10 font-medium min-h-[44px]"
                    >
                      Ask for Refund
                    </Button>
                  </>
                )}

                {showRefundForm && !refundSubmitted && (
                  <div className="flex flex-col gap-3">
                    <p className="text-white/80 text-xs leading-relaxed">
                      Our team will review your refund request and only if there are any defects present, will process you the refund.
                    </p>
                    <p className="text-white/60 text-xs leading-relaxed">
                      Since the pages are AI-generated, AI can sometimes make mistakes. If we find any defective pages, we'll correct them and resend you an updated storybook link.
                    </p>
                    <textarea
                      placeholder="Describe the issue you noticed…"
                      value={refundIssue}
                      onChange={(e) => setRefundIssue(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-white/30 px-3 py-2"
                    />
                    <Button
                      data-testid="btn-submit-refund"
                      onClick={handleSubmitRefund}
                      disabled={submittingRefund}
                      className="w-full rounded-full bg-[#E76F51] hover:bg-[#d4613f] text-white font-semibold min-h-[44px]"
                    >
                      {submittingRefund ? "Submitting…" : "Submit Refund Request"}
                    </Button>
                    <button
                      onClick={() => { setShowRefundForm(false); setRefundIssue(""); }}
                      className="text-white/40 hover:text-white/70 text-xs text-center transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {refundSubmitted && (
                  <div className="rounded-xl bg-white/10 border border-white/20 p-4 text-center">
                    <p className="text-white/90 text-sm font-medium mb-1">Request submitted!</p>
                    <p className="text-white/55 text-xs leading-relaxed mb-2">
                      Our team will review your request and only if defects are found, will process a refund.
                    </p>
                    <p className="text-white/45 text-xs leading-relaxed">
                      Since the pages are AI-generated, AI can sometimes make mistakes. If there are any defective pages, we'll correct them and resend you an updated storybook link.
                    </p>
                  </div>
                )}
              </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-[#2A9D8F] text-xs font-medium flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
                  Great! Your book is confirmed.
                </p>
                <Button
                  data-testid="btn-download-pdf"
                  onClick={handleDownloadPDF}
                  className="w-full rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold min-h-[44px] gap-2"
                >
                  <Download className="w-4 h-4" strokeWidth={2.5} />
                  Download PDF
                </Button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
