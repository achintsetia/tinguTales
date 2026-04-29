// Shared utilities and constants for the Admin Panel sub-components

export const toDateValue = (raw: any): Date | null => {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw?.toDate === "function") {
    const d = raw.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof raw === "number") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "object" && typeof raw.seconds === "number") {
    const d = new Date(raw.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

export const toDisplayDate = (raw: any): string => {
  const d = toDateValue(raw);
  return d ? d.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "";
};

export const shorten = (value: string, max = 130) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

export const PAGE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
  processing: "bg-[#3730A3]/15 text-[#3730A3]",
  completed: "bg-[#2A9D8F]/15 text-[#2A9D8F]",
  failed: "bg-[#E76F51]/15 text-[#E76F51]",
};

export const QA_STATUS_COLORS: Record<string, string> = {
  retry_queued: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
  processing: "bg-[#3730A3]/15 text-[#3730A3]",
  passed: "bg-[#2A9D8F]/15 text-[#2A9D8F]",
  passed_with_warnings: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
  artwork_warning: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
  final_warning: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
  error: "bg-[#E76F51]/15 text-[#E76F51]",
  not_required: "bg-[#1E1B4B]/10 text-[#1E1B4B]/50",
  not_recorded: "bg-[#1E1B4B]/10 text-[#1E1B4B]/50",
  not_run: "bg-[#1E1B4B]/10 text-[#1E1B4B]/50",
};

export const QA_STATUS_LABELS: Record<string, string> = {
  retry_queued: "Retry queued",
  processing: "Processing",
  passed: "QA passed",
  passed_with_warnings: "Passed + warnings",
  artwork_warning: "Art warning",
  final_warning: "Final warning",
  error: "QA/error failed",
  not_required: "Not required",
  not_recorded: "Not recorded",
  not_run: "Not run",
};

export const QA_STAGE_LABELS: Record<string, string> = {
  artwork_pre_overlay: "Art",
  final_composited: "Final",
};

export const STORY_STATUS_COLORS: Record<string, string> = {
  draft_ready: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
  approved: "bg-[#3730A3]/15 text-[#3730A3]",
  generating_scenes: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
  generating_images: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
  creating_pdf: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
  completed: "bg-[#2A9D8F]/15 text-[#2A9D8F]",
  scenes_failed: "bg-[#E76F51]/15 text-[#E76F51]",
  failed: "bg-[#E76F51]/15 text-[#E76F51]",
};

export const PAY_STATUS_COLORS: Record<string, string> = {
  created: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
  paid: "bg-[#2A9D8F]/15 text-[#2A9D8F]",
  failed: "bg-[#E76F51]/15 text-[#E76F51]",
  refunded: "bg-[#3730A3]/15 text-[#3730A3]",
};

export type Lightbox = { url: string; text: string; label: string };
