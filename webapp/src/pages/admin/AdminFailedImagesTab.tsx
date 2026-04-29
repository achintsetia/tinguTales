import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { RefreshCw } from "lucide-react";
import { toDisplayDate } from "./_adminUtils";

interface AdminFailedImagesTabProps {
  failedImageItems: any[];
  loadingFailedImages: boolean;
  fetchFailedImageGenerations: () => void;
  handleRetryFailedImage: (failedDocId: string) => void;
  retryingFailedDocId: string | null;
}

export default function AdminFailedImagesTab({
  failedImageItems,
  loadingFailedImages,
  fetchFailedImageGenerations,
  handleRetryFailedImage,
  retryingFailedDocId,
}: AdminFailedImagesTabProps) {
  return (
    <div data-testid="admin-failed-image-generation">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#1E1B4B]/50">{failedImageItems.length} failed item(s)</p>
        <Button
          variant="outline"
          onClick={fetchFailedImageGenerations}
          disabled={loadingFailedImages}
          className="rounded-full border-[#F3E8FF]"
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loadingFailedImages ? "animate-spin" : ""}`}
            strokeWidth={2}
          />
          Refresh
        </Button>
      </div>

      {loadingFailedImages ? (
        <div className="flex items-center justify-center py-10 text-[#1E1B4B]/40">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading failed items…
        </div>
      ) : failedImageItems.length === 0 ? (
        <p className="text-center py-10 text-[#1E1B4B]/40">No failed image generation items</p>
      ) : (
        <div className="space-y-2">
          {failedImageItems.map((item: any) => (
            <Card key={item.id} className="rounded-2xl border-2 border-[#F3E8FF]">
              <CardContent className="p-4 flex items-center gap-3">
                <Badge className="bg-[#E76F51]/15 text-[#E76F51] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                  {item.status || "failed"}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1E1B4B] truncate">
                    Story {item.story_id} · Page {item.page_index ?? "?"}
                  </p>
                  <p className="text-xs text-[#1E1B4B]/50 truncate">
                    pageId: {item.page_id || "-"} · user: {item.user_id || "-"}
                  </p>
                  <p className="text-xs text-[#1E1B4B]/40 truncate">
                    failures: {Number(item.failure_count ?? 0)} · {toDisplayDate(item.last_failed_at)}
                  </p>
                  {item.last_error && (
                    <p className="text-xs text-[#E76F51] truncate mt-0.5">{String(item.last_error)}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRetryFailedImage(item.id)}
                  disabled={retryingFailedDocId === item.id}
                  className="rounded-full border-[#3730A3]/30 text-[#3730A3] hover:bg-[#3730A3]/10 text-xs"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 mr-1 ${retryingFailedDocId === item.id ? "animate-spin" : ""}`}
                    strokeWidth={2}
                  />
                  {retryingFailedDocId === item.id ? "Retrying…" : "Retry"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
