import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { BookOpen, RefreshCw, ChevronDown, ChevronUp, ZoomIn, Check } from "lucide-react";
import { PAGE_STATUS_COLORS, STORY_STATUS_COLORS, toDisplayDate, Lightbox } from "./_adminUtils";
import PageGenerationDetails from "./PageGenerationDetails";

interface AdminStoriesTabProps {
  visibleStories: any[];
  expandedStoryId: string | null;
  setExpandedStoryId: (v: string | null) => void;
  storyPagesByStory: Record<string, any[]>;
  fetchStoryPages: (storyId: string, force?: boolean) => Promise<void>;
  refreshingStoryPagesId: string | null;
  handleStoryRetryPage: (storyId: string, pageId: string) => void;
  handleStoryRetryTextOverlay: (storyId: string, pageId: string) => void;
  handleStoryRegeneratePdf: (storyId: string) => void;
  regeneratingPdfForStory: string | null;
  retryingStoryPageId: string | null;
  retryingStoryTextOverlayId: string | null;
  userEmailById: Record<string, string>;
  setLightbox: (v: Lightbox | null) => void;
}

export default function AdminStoriesTab({
  visibleStories,
  expandedStoryId,
  setExpandedStoryId,
  storyPagesByStory,
  fetchStoryPages,
  refreshingStoryPagesId,
  handleStoryRetryPage,
  handleStoryRetryTextOverlay,
  handleStoryRegeneratePdf,
  regeneratingPdfForStory,
  retryingStoryPageId,
  retryingStoryTextOverlayId,
  userEmailById,
  setLightbox,
}: AdminStoriesTabProps) {
  const getStoryCoverThumbnail = (story: any) => {
    if (story?.cover_image_url) return story.cover_image_url;
    if (Array.isArray(story?.pages) && story.pages.length > 0) {
      const coverPage = story.pages.find((p: any) => p?.page === 0) || story.pages[0];
      return coverPage?.image_url || "";
    }
    return "";
  };

  return (
    <div data-testid="admin-stories">
      <p className="text-sm text-[#1E1B4B]/50 mb-4">
        {visibleStories.length} story(s) including in-progress
      </p>
      <div className="space-y-2">
        {visibleStories.length === 0 ? (
          <p className="text-center py-12 text-[#1E1B4B]/40">
            No stories found in progress or completed states
          </p>
        ) : (
          visibleStories.map((s: any) => {
            const isExpanded = expandedStoryId === s.id;
            const pages = storyPagesByStory[s.id] || [];
            return (
              <div key={s.id} className="rounded-xl bg-white border-2 border-[#F3E8FF] overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#FFF8F0] transition-colors"
                  onClick={async () => {
                    const next = isExpanded ? null : s.id;
                    setExpandedStoryId(next);
                    if (next) await fetchStoryPages(next);
                  }}
                >
                  <div className="w-14 rounded-lg overflow-hidden bg-gradient-to-br from-[#3730A3]/10 to-[#FF9F1C]/10 flex-shrink-0 aspect-[3/4]">
                    {getStoryCoverThumbnail(s) ? (
                      <img
                        src={getStoryCoverThumbnail(s)}
                        alt={s.title || "Story cover"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-[#1E1B4B]/25" strokeWidth={2} />
                      </div>
                    )}
                  </div>
                  <Badge
                    className={`${
                      STORY_STATUS_COLORS[s.status] || "bg-[#2A9D8F]/15 text-[#2A9D8F]"
                    } rounded-full px-2.5 py-0.5 text-xs font-semibold border-0 flex-shrink-0`}
                  >
                    {s.status || "completed"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-[#1E1B4B] truncate">
                        {s.title || "Untitled Story"}
                      </p>
                      {s.quality_confirmed_at && (
                        <span
                          className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#2A9D8F]"
                          title="Quality confirmed by user"
                        >
                          <Check className="w-3 h-3 text-white" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#1E1B4B]/50 truncate">
                      {userEmailById[s.user_id] || s.user_email || "Unknown user"}
                    </p>
                    <p className="text-xs text-[#1E1B4B]/40 font-mono truncate">{s.id}</p>
                    <p className="text-xs text-[#1E1B4B]/40">{toDisplayDate(s.created_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {s.pdf_url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(s.pdf_url, "_blank");
                        }}
                        className="rounded-full border-[#3730A3]/30 text-[#3730A3] hover:bg-[#3730A3]/10 text-xs"
                      >
                        Open PDF
                      </Button>
                    ) : (
                      <span className="text-xs text-[#1E1B4B]/35">PDF not ready</span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[#1E1B4B]/30" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#1E1B4B]/30" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t-2 border-[#F3E8FF] px-4 pt-4 pb-5 bg-[#FDFBF7]">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider">Pages</p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={refreshingStoryPagesId === s.id}
                          onClick={() => fetchStoryPages(s.id, true)}
                          className="rounded-full border-[#3730A3]/30 text-[#3730A3] hover:bg-[#3730A3]/10 text-xs h-7"
                        >
                          <RefreshCw
                            className={`w-3 h-3 mr-1 ${refreshingStoryPagesId === s.id ? "animate-spin" : ""}`}
                            strokeWidth={2}
                          />
                          {refreshingStoryPagesId === s.id ? "Refreshing…" : "Refresh Pages"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={regeneratingPdfForStory === s.id}
                          onClick={() => handleStoryRegeneratePdf(s.id)}
                          className="rounded-full border-[#FF9F1C]/40 text-[#FF9F1C] hover:bg-[#FF9F1C]/10 text-xs h-7"
                        >
                          <RefreshCw
                            className={`w-3 h-3 mr-1 ${regeneratingPdfForStory === s.id ? "animate-spin" : ""}`}
                            strokeWidth={2}
                          />
                          {regeneratingPdfForStory === s.id ? "Regenerating…" : "Regen PDF"}
                        </Button>
                      </div>
                    </div>
                    {pages.length === 0 ? (
                      <p className="text-xs text-[#1E1B4B]/40">Loading pages…</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {pages.map((page: any) => {
                          const imgUrl = page.jpeg_url || page.image_url || null;
                          const pageLabel =
                            page.page === 0
                              ? "Cover"
                              : page.page === pages.length - 1
                              ? "Back"
                              : `Pg ${page.page}`;
                          const pageStatus = page.status || "unknown";
                          const pageText =
                            page.page === 0
                              ? [page.cover_title, page.cover_subtitle].filter(Boolean).join("\n") ||
                                page.text ||
                                ""
                              : page.text || "";
                          return (
                            <div key={page.id} className="flex flex-col gap-1.5">
                              <div className="rounded-xl overflow-hidden bg-[#F3E8FF] aspect-[3/4] relative group">
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={pageLabel}
                                    className="w-full h-full object-cover cursor-zoom-in"
                                    onClick={() =>
                                      setLightbox({ url: imgUrl, text: pageText, label: pageLabel })
                                    }
                                  />
                                ) : retryingStoryPageId === page.id ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                                    <RefreshCw
                                      className="w-6 h-6 text-[#3730A3]/40 animate-spin"
                                      strokeWidth={1.5}
                                    />
                                    <span className="text-[10px] text-[#1E1B4B]/40">Generating…</span>
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                                    <BookOpen className="w-6 h-6 text-[#1E1B4B]/20" strokeWidth={1.5} />
                                    <span className="text-[10px] text-[#1E1B4B]/40">{pageStatus}</span>
                                  </div>
                                )}
                                <div className="absolute top-1 left-1">
                                  <span className="text-[9px] font-bold bg-black/50 text-white rounded px-1 py-0.5">
                                    {pageLabel}
                                  </span>
                                </div>
                                {imgUrl && (
                                  <button
                                    onClick={() =>
                                      setLightbox({ url: imgUrl, text: pageText, label: pageLabel })
                                    }
                                    className="absolute bottom-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <ZoomIn className="w-3.5 h-3.5" strokeWidth={2} />
                                  </button>
                                )}
                              </div>
                              <Badge
                                className={`${
                                  PAGE_STATUS_COLORS[pageStatus] || "bg-[#1E1B4B]/10 text-[#1E1B4B]/50"
                                } border-0 rounded-full px-2 py-0 text-[10px] font-semibold self-start`}
                              >
                                {pageStatus}
                              </Badge>
                              <PageGenerationDetails page={page} />
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={retryingStoryPageId === page.id}
                                onClick={() => handleStoryRetryPage(s.id, page.id)}
                                className="rounded-full border-[#3730A3]/30 text-[#3730A3] hover:bg-[#3730A3]/10 text-[10px] h-6 px-2"
                              >
                                <RefreshCw
                                  className={`w-3 h-3 mr-1 ${
                                    retryingStoryPageId === page.id ? "animate-spin" : ""
                                  }`}
                                  strokeWidth={2}
                                />
                                {retryingStoryPageId === page.id ? "Retrying…" : "Retry"}
                              </Button>
                              {page.raw_image_url && page.page_type === "story" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={retryingStoryTextOverlayId === page.id}
                                  onClick={() => handleStoryRetryTextOverlay(s.id, page.id)}
                                  className="rounded-full border-[#2A9D8F]/30 text-[#2A9D8F] hover:bg-[#2A9D8F]/10 text-[10px] h-6 px-2"
                                >
                                  <RefreshCw
                                    className={`w-3 h-3 mr-1 ${
                                      retryingStoryTextOverlayId === page.id ? "animate-spin" : ""
                                    }`}
                                    strokeWidth={2}
                                  />
                                  {retryingStoryTextOverlayId === page.id ? "Applying…" : "Retry Text"}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
