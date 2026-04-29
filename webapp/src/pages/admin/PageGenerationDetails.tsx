import { Badge } from "../../components/ui/badge";
import {
  toDisplayDate,
  shorten,
  QA_STATUS_COLORS,
  QA_STATUS_LABELS,
  QA_STAGE_LABELS,
} from "./_adminUtils";

interface PageGenerationDetailsProps {
  page: any;
}

export default function PageGenerationDetails({ page }: PageGenerationDetailsProps) {
  const rawQaStatus = String(page.image_generation_qa_status || "").trim();
  const qaStatus = rawQaStatus || (page.last_image_generation_error ? "error" : "not_recorded");
  const qaAttempts = Array.isArray(page.image_generation_qa_attempts) ? page.image_generation_qa_attempts : [];
  const recentAttempts = qaAttempts.slice(-3);
  const requiredElements = Array.isArray(page.image_generation_required_visual_elements)
    ? page.image_generation_required_visual_elements.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];
  const qaWarning = String(page.image_generation_qa_warning || "").trim();
  const lastError = String(page.last_image_generation_error || "").trim();
  const retryAt = toDisplayDate(page.image_generation_retry_requested_at);
  const retryBy = String(page.image_generation_retry_requested_by || "").trim();
  const startedAt = toDisplayDate(page.image_generation_attempt_started_at);

  return (
    <div className="rounded-lg border border-[#F3E8FF] bg-white/80 p-2 text-[10px] leading-snug text-[#1E1B4B]/60 space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-bold text-[#1E1B4B]/40 uppercase tracking-wide">Image QA</span>
        <Badge
          className={`${QA_STATUS_COLORS[qaStatus] || QA_STATUS_COLORS.not_recorded} border-0 rounded-full px-1.5 py-0 text-[9px] font-semibold`}
        >
          {QA_STATUS_LABELS[qaStatus] || qaStatus.replace(/_/g, " ")}
        </Badge>
      </div>

      {retryAt && (
        <p>
          Retry: {retryAt}
          {retryBy ? ` by ${shorten(retryBy, 10)}` : ""}
        </p>
      )}
      {!retryAt && startedAt && <p>Started: {startedAt}</p>}

      {requiredElements.length > 0 && (
        <p title={requiredElements.join(", ")}>Needs: {shorten(requiredElements.join(", "), 95)}</p>
      )}

      {qaWarning && (
        <p className="text-[#B45309]" title={qaWarning}>
          Warning: {shorten(qaWarning)}
        </p>
      )}
      {!qaWarning && lastError && (
        <p className="text-[#E76F51]" title={lastError}>
          Error: {shorten(lastError)}
        </p>
      )}

      {recentAttempts.length > 0 ? (
        <div className="space-y-0.5">
          {recentAttempts.map((attempt: any, index: number) => {
            const passed = Boolean(attempt?.passed);
            const stage = String(attempt?.stage || "").trim();
            const reason = String(attempt?.reason || "").trim();
            const attemptNo = attempt?.attempt ?? index + 1;
            return (
              <p key={`${stage || "qa"}-${attempt?.at || index}`} title={reason}>
                #{attemptNo} {QA_STAGE_LABELS[stage] || stage || "QA"}:
                <span className={passed ? " text-[#2A9D8F] font-semibold" : " text-[#E76F51] font-semibold"}>
                  {passed ? " PASS" : " FAIL"}
                </span>
                {reason ? ` — ${shorten(reason, 90)}` : ""}
              </p>
            );
          })}
        </div>
      ) : (
        <p>No QA attempts recorded yet.</p>
      )}
    </div>
  );
}
