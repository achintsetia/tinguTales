import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { RefreshCw, AlertCircle, ChevronDown, ChevronUp, BookOpen, ZoomIn, Check, Pencil, RefreshCw as RefreshCwIcon, X, Mail, IndianRupee } from "lucide-react";
import { PAGE_STATUS_COLORS, toDisplayDate, Lightbox } from "./_adminUtils";
import PageGenerationDetails from "./PageGenerationDetails";

interface AdminRefundRequestsTabProps {
  refundRequests: any[];
  loadingRefunds: boolean;
  fetchRefundRequests: () => void;
  expandedRefundId: string | null;
  setExpandedRefundId: (v: string | null) => void;
  refundPagesByStory: Record<string, any[]>;
  fetchRefundStoryPages: (storyId: string) => Promise<void>;
  refundStoryPdfByStory: Record<string, string>;
  handleRefundRetryPage: (storyId: string, pageId: string) => void;
  retryingRefundPageId: string | null;
  handleRefundRegeneratePdf: (storyId: string) => void;
  regeneratingPdfForStory: string | null;
  handleSendCorrectionEmail: (storyId: string) => void;
  sendingCorrectionEmail: string | null;
  handleIssueRefund: (refundRequestId: string) => void;
  issuingRefund: string | null;
  handleCloseRefundRequest: (refundRequestId: string) => void;
  closingRefundRequest: string | null;
  handleSavePageText: (storyId: string, page: any) => void;
  pageTextEdits: Record<string, string>;
  setPageTextEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  editingPageId: string | null;
  setEditingPageId: (v: string | null) => void;
  savingPageTextId: string | null;
  setLightbox: (v: Lightbox | null) => void;
}

export default function AdminRefundRequestsTab({
  refundRequests,
  loadingRefunds,
  fetchRefundRequests,
  expandedRefundId,
  setExpandedRefundId,
  refundPagesByStory,
  fetchRefundStoryPages,
  refundStoryPdfByStory,
  handleRefundRetryPage,
  retryingRefundPageId,
  handleRefundRegeneratePdf,
  regeneratingPdfForStory,
  handleSendCorrectionEmail,
  sendingCorrectionEmail,
  handleIssueRefund,
  issuingRefund,
  handleCloseRefundRequest,
  closingRefundRequest,
  handleSavePageText,
  pageTextEdits,
  setPageTextEdits,
  editingPageId,
  setEditingPageId,
  savingPageTextId,
  setLightbox,
}: AdminRefundRequestsTabProps) {
  return (
    <div data-testid="admin-refund-requests">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#1E1B4B]/50">{refundRequests.length} refund request(s)</p>
        <Button
          variant="outline"
          onClick={fetchRefundRequests}
          disabled={loadingRefunds}
          className="rounded-full border-[#F3E8FF]"
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loadingRefunds ? "animate-spin" : ""}`}
            strokeWidth={2}
          />
          Refresh
        </Button>
      </div>

      {loadingRefunds ? (
        <div className="flex items-center justify-center py-10 text-[#1E1B4B]/40">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading refund requests…
        </div>
      ) : refundRequests.length === 0 ? (
        <p className="text-center py-10 text-[#1E1B4B]/40">No refund requests yet</p>
      ) : (
        <div className="space-y-3">
          {refundRequests.map((r: any) => {
            const isExpanded = expandedRefundId === r.id;
            const storyId = r.story_id;
            const pages = refundPagesByStory[storyId] || [];
            return (
              <div
                key={r.id}
                className="rounded-2xl border-2 border-[#F3E8FF] bg-white overflow-hidden"
              >
                <button
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-[#FFF8F0] transition-colors"
                  onClick={async () => {
                    const next = isExpanded ? null : r.id;
                    setExpandedRefundId(next);
                    if (next && storyId) await fetchRefundStoryPages(storyId);
                  }}
                >
                  <div className="w-9 h-9 rounded-full bg-[#E76F51]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AlertCircle className="w-4 h-4 text-[#E76F51]" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1E1B4B] truncate">
                      {r.story_title || storyId || "Unknown Story"}
                    </p>
                    <p className="text-xs text-[#1E1B4B]/50 truncate">User: {r.user_id}</p>
                    <p className="text-xs text-[#1E1B4B]/40">{toDisplayDate(r.created_at)}</p>
                    <p className="text-sm text-[#1E1B4B]/75 mt-1.5 whitespace-pre-wrap break-words line-clamp-2">
                      {r.issue}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge
                      className={`border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        r.status === "refunded"
                          ? "bg-[#2A9D8F]/15 text-[#2A9D8F]"
                          : r.status === "closed"
                          ? "bg-[#1E1B4B]/10 text-[#1E1B4B]/50"
                          : "bg-[#E76F51]/15 text-[#E76F51]"
                      }`}
                    >
                      {r.status || "pending"}
                    </Badge>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[#1E1B4B]/30 mt-2" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#1E1B4B]/30 mt-2" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t-2 border-[#F3E8FF] px-4 pt-4 pb-5 bg-[#FDFBF7]">
                    <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-2">
                      Issue Description
                    </p>
                    <p className="text-sm text-[#1E1B4B]/80 whitespace-pre-wrap break-words mb-5 p-3 rounded-xl bg-white border border-[#F3E8FF]">
                      {r.issue}
                    </p>

                    <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-2">
                      Story ID: <span className="font-mono normal-case">{storyId}</span>
                    </p>

                    <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-3">
                      Story Pages
                    </p>
                    {pages.length === 0 ? (
                      <p className="text-xs text-[#1E1B4B]/40 mb-4">Loading pages…</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-5">
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
                              ? [page.cover_title, page.cover_subtitle]
                                  .filter(Boolean)
                                  .join("\n") ||
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
                                ) : retryingRefundPageId === page.id ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                                    <RefreshCwIcon
                                      className="w-6 h-6 text-[#3730A3]/40 animate-spin"
                                      strokeWidth={1.5}
                                    />
                                    <span className="text-[10px] text-[#1E1B4B]/40">
                                      Generating…
                                    </span>
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <BookOpen
                                      className="w-6 h-6 text-[#1E1B4B]/20"
                                      strokeWidth={1.5}
                                    />
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

                              {editingPageId === page.id ? (
                                <div className="flex flex-col gap-1">
                                  <textarea
                                    className="text-[10px] text-[#1E1B4B] leading-relaxed bg-white border border-[#3730A3]/40 rounded-lg p-1.5 w-full resize-none focus:outline-none focus:ring-1 focus:ring-[#3730A3]/50"
                                    rows={4}
                                    value={pageTextEdits[`${storyId}:${page.id}`] ?? ""}
                                    onChange={(e) =>
                                      setPageTextEdits((prev) => ({
                                        ...prev,
                                        [`${storyId}:${page.id}`]: e.target.value,
                                      }))
                                    }
                                  />
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      disabled={savingPageTextId === page.id}
                                      onClick={() => handleSavePageText(storyId, page)}
                                      className="rounded-full text-[10px] h-6 px-2 bg-[#3730A3] hover:bg-[#2e278f] text-white gap-1 flex-1"
                                    >
                                      <Check
                                        className={`w-2.5 h-2.5 ${
                                          savingPageTextId === page.id ? "animate-pulse" : ""
                                        }`}
                                        strokeWidth={2.5}
                                      />
                                      {savingPageTextId === page.id ? "Saving…" : "Save"}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={savingPageTextId === page.id}
                                      onClick={() => setEditingPageId(null)}
                                      className="rounded-full text-[10px] h-6 px-2 border-[#1E1B4B]/20 text-[#1E1B4B]/50"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const currentText =
                                      page.page === 0
                                        ? [page.cover_title, page.cover_subtitle]
                                            .filter(Boolean)
                                            .join("\n") ||
                                          page.text ||
                                          ""
                                        : page.text || "";
                                    setPageTextEdits((prev) => ({
                                      ...prev,
                                      [`${storyId}:${page.id}`]: currentText,
                                    }));
                                    setEditingPageId(page.id);
                                  }}
                                  className="rounded-full text-[10px] border-[#E76F51]/30 text-[#E76F51] hover:bg-[#E76F51]/10 h-6 px-2 gap-1"
                                >
                                  <Pencil className="w-2.5 h-2.5" strokeWidth={2} />
                                  Edit Text
                                </Button>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                disabled={retryingRefundPageId === page.id}
                                onClick={() => handleRefundRetryPage(storyId, page.id)}
                                className="rounded-full text-xs border-[#3730A3]/30 text-[#3730A3] hover:bg-[#3730A3]/10 h-7 px-3"
                              >
                                <RefreshCw
                                  className={`w-3 h-3 mr-1 ${
                                    retryingRefundPageId === page.id ? "animate-spin" : ""
                                  }`}
                                  strokeWidth={2}
                                />
                                {retryingRefundPageId === page.id ? "Retrying…" : "Retry"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#F3E8FF]">
                      <Button
                        onClick={() => handleRefundRegeneratePdf(storyId)}
                        disabled={regeneratingPdfForStory === storyId}
                        className="rounded-full bg-[#3730A3] hover:bg-[#2e278f] text-white font-semibold gap-2"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${
                            regeneratingPdfForStory === storyId ? "animate-spin" : ""
                          }`}
                          strokeWidth={2.5}
                        />
                        {regeneratingPdfForStory === storyId ? "Queuing PDF…" : "Regenerate PDF"}
                      </Button>
                      <Button
                        onClick={() => handleSendCorrectionEmail(storyId)}
                        disabled={sendingCorrectionEmail === storyId}
                        variant="outline"
                        className="rounded-full border-[#2A9D8F] text-[#2A9D8F] hover:bg-[#2A9D8F]/10 font-semibold gap-2"
                      >
                        <Mail
                          className={`w-4 h-4 ${
                            sendingCorrectionEmail === storyId ? "animate-pulse" : ""
                          }`}
                          strokeWidth={2}
                        />
                        {sendingCorrectionEmail === storyId ? "Sending…" : "Send Correction Email"}
                      </Button>
                      {refundStoryPdfByStory[storyId] ? (
                        <a
                          href={refundStoryPdfByStory[storyId]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3730A3] underline underline-offset-2 hover:text-[#2e278f] w-full"
                        >
                          📄 Review PDF
                        </a>
                      ) : null}
                      <p className="text-xs text-[#1E1B4B]/40 w-full">
                        Regenerate first, review the PDF, then send the correction email to notify
                        the user.
                      </p>
                    </div>

                    {r.status !== "refunded" && r.status !== "closed" && (
                      <div className="flex flex-wrap items-center gap-3 pt-3 mt-3 border-t border-[#F3E8FF]">
                        <Button
                          onClick={() => handleIssueRefund(r.id)}
                          disabled={issuingRefund === r.id}
                          variant="outline"
                          className="rounded-full border-[#E76F51] text-[#E76F51] hover:bg-[#E76F51]/10 font-semibold gap-2"
                        >
                          <IndianRupee
                            className={`w-4 h-4 ${issuingRefund === r.id ? "animate-pulse" : ""}`}
                            strokeWidth={2}
                          />
                          {issuingRefund === r.id ? "Issuing Refund…" : "Issue Refund"}
                        </Button>
                        <Button
                          onClick={() => handleCloseRefundRequest(r.id)}
                          disabled={closingRefundRequest === r.id}
                          variant="outline"
                          className="rounded-full border-[#1E1B4B]/30 text-[#1E1B4B]/60 hover:bg-[#1E1B4B]/5 font-semibold gap-2"
                        >
                          <X
                            className={`w-4 h-4 ${
                              closingRefundRequest === r.id ? "animate-pulse" : ""
                            }`}
                            strokeWidth={2}
                          />
                          {closingRefundRequest === r.id ? "Closing…" : "Close Request"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
