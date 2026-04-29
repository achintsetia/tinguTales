import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  collection, getDocs, doc, getDoc, setDoc, deleteDoc,
  query, orderBy, onSnapshot,
} from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { ArrowLeft, RefreshCw, Bot, IndianRupee, X } from "lucide-react";

import { toDateValue } from "./admin/_adminUtils";
import AdminOverviewTab from "./admin/AdminOverviewTab";
import AdminUsersTab from "./admin/AdminUsersTab";
import AdminStoriesTab from "./admin/AdminStoriesTab";
import AdminFailedImagesTab from "./admin/AdminFailedImagesTab";
import AdminRefundRequestsTab from "./admin/AdminRefundRequestsTab";
import AdminContactsTab from "./admin/AdminContactsTab";
import AdminWhitelistTab from "./admin/AdminWhitelistTab";
import AdminCouponsTab from "./admin/AdminCouponsTab";
import AdminPaymentsTab from "./admin/AdminPaymentsTab";
import AdminCostsTab from "./admin/AdminCostsTab";

const ADMIN_TAB_STORAGE_KEY = "admin_active_tab";
const ADMIN_TAB_IDS = [
  "overview",
  "users",
  "stories",
  "failed-image-generation",
  "refund-requests",
  "contacts",
  "whitelist",
  "coupons",
  "payments",
  "costs",
] as const;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "stories", label: "Stories" },
  { id: "failed-image-generation", label: "Failed Image Generation" },
  { id: "refund-requests", label: "Refund Requests" },
  { id: "contacts", label: "Contacts" },
  { id: "whitelist", label: "Whitelist" },
  { id: "coupons", label: "Coupons" },
  { id: "payments", label: "Payments" },
  { id: "costs", label: "Costs" },
];

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [userEmailById, setUserEmailById] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  // Costs tab
  const [costReport, setCostReport] = useState<any>(null);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Whitelist tab
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [whitelistMap, setWhitelistMap] = useState<Record<string, any>>({});
  const [loadingWhitelist, setLoadingWhitelist] = useState(false);
  const [whitelistSearch, setWhitelistSearch] = useState("");
  const [savingWhitelistUser, setSavingWhitelistUser] = useState<string | null>(null);
  const [whitelistEmail, setWhitelistEmail] = useState("");
  const [addingWhitelistEmail, setAddingWhitelistEmail] = useState(false);

  // Users tab
  const [userProfiles, setUserProfiles] = useState<any[]>([]);
  const [childProfilesByUser, setChildProfilesByUser] = useState<Record<string, any[]>>({});
  const [userSearch, setUserSearch] = useState("");

  // Stories tab
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  const [storyPagesByStory, setStoryPagesByStory] = useState<Record<string, any[]>>({});
  const [retryingStoryPageId, setRetryingStoryPageId] = useState<string | null>(null);

  // Failed image generation tab
  const [failedImageItems, setFailedImageItems] = useState<any[]>([]);
  const [loadingFailedImages, setLoadingFailedImages] = useState(false);
  const [retryingFailedDocId, setRetryingFailedDocId] = useState<string | null>(null);

  // Contacts tab
  const [contacts, setContacts] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);

  // Refund requests tab
  const [refundRequests, setRefundRequests] = useState<any[]>([]);
  const [loadingRefunds, setLoadingRefunds] = useState(false);
  const [expandedRefundId, setExpandedRefundId] = useState<string | null>(null);
  const [refundPagesByStory, setRefundPagesByStory] = useState<Record<string, any[]>>({});
  const [refundStoryPdfByStory, setRefundStoryPdfByStory] = useState<Record<string, string>>({});
  const [retryingRefundPageId, setRetryingRefundPageId] = useState<string | null>(null);
  const [regeneratingPdfForStory, setRegeneratingPdfForStory] = useState<string | null>(null);
  const [sendingCorrectionEmail, setSendingCorrectionEmail] = useState<string | null>(null);
  const [issuingRefund, setIssuingRefund] = useState<string | null>(null);
  const [closingRefundRequest, setClosingRefundRequest] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; text: string; label: string } | null>(null);
  const [pageTextEdits, setPageTextEdits] = useState<Record<string, string>>({});
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [savingPageTextId, setSavingPageTextId] = useState<string | null>(null);

  // Coupons tab
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [couponUsageInput, setCouponUsageInput] = useState("");
  const [couponDiscountInput, setCouponDiscountInput] = useState("");
  const [addingCoupon, setAddingCoupon] = useState(false);
  const [deletingCoupon, setDeletingCoupon] = useState<string | null>(null);

  // ─── Auth guard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    if (!user.is_admin) {
      navigate("/dashboard", { replace: true });
      return;
    }
    fetchAll();
  }, [user?.id, user?.is_admin, navigate]);

  // ─── Tab persistence ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.is_admin) return;
    const storageKey = `${ADMIN_TAB_STORAGE_KEY}:${user.id || "unknown"}`;
    let savedTab = "overview";
    try {
      savedTab = localStorage.getItem(storageKey) || "overview";
      if (!ADMIN_TAB_IDS.includes(savedTab as (typeof ADMIN_TAB_IDS)[number])) savedTab = "overview";
      setTab(savedTab);
    } catch {
      setTab("overview");
    }
    if (savedTab === "costs" && !costReport) fetchCosts();
    if (savedTab === "whitelist") fetchWhitelistData();
    if (savedTab === "coupons") fetchCoupons();
    if (savedTab === "failed-image-generation") fetchFailedImageGenerations();
    if (savedTab === "contacts") fetchContacts();
    if (savedTab === "refund-requests") fetchRefundRequests();
  }, [user?.id, user?.is_admin]);

  useEffect(() => {
    if (!user?.is_admin) return;
    const storageKey = `${ADMIN_TAB_STORAGE_KEY}:${user.id || "unknown"}`;
    try {
      localStorage.setItem(storageKey, tab);
    } catch {
      // Ignore storage write failures.
    }
  }, [tab, user?.id, user?.is_admin]);

  // ─── Core data fetch ─────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [storiesRes, usersRes, paymentsRes, pricingRes, childProfilesRes, failedImageRes] =
        await Promise.allSettled([
          getDocs(collection(db, "stories")),
          getDocs(collection(db, "user_profile")),
          getDocs(query(collection(db, "payments"), orderBy("created_at", "desc"))),
          getDoc(doc(db, "pricing", "public")),
          getDocs(collection(db, "child_profiles")),
          getDocs(collection(db, "_failed_image_generation")),
        ]);

      const storiesSnap = storiesRes.status === "fulfilled" ? storiesRes.value : null;
      const usersSnap = usersRes.status === "fulfilled" ? usersRes.value : null;
      const paymentsSnap = paymentsRes.status === "fulfilled" ? paymentsRes.value : null;
      const childProfilesSnap = childProfilesRes.status === "fulfilled" ? childProfilesRes.value : null;
      const failedImageSnap = failedImageRes.status === "fulfilled" ? failedImageRes.value : null;

      const allStories = storiesSnap ? storiesSnap.docs.map((d) => d.data()) : [];
      const storyRows = storiesSnap ? storiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
      const userRows = usersSnap ? usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
      const emailMap = userRows.reduce((acc: Record<string, string>, u: any) => {
        acc[u.id] = u.email || "";
        return acc;
      }, {});
      const allPayments = paymentsSnap ? paymentsSnap.docs.map((d) => d.data()) : [];
      const totalRevenue = allPayments
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      setStats({
        total_users: usersSnap?.size ?? 0,
        total_stories: allStories.length,
        completed_stories: allStories.filter((s) => s.status === "completed").length,
        total_revenue: totalRevenue,
        pending_jobs: 0,
        processing_jobs: 0,
      });
      setPayments(allPayments);
      setStories(storyRows);
      setUserEmailById(emailMap);

      const sortedUsers = userRows.sort((a: any, b: any) =>
        (a.email || "").localeCompare(b.email || "")
      );
      setUserProfiles(sortedUsers);

      const cpMap: Record<string, any[]> = {};
      if (childProfilesSnap) {
        childProfilesSnap.docs.forEach((d) => {
          const cp = { id: d.id, ...d.data() };
          const uid = (cp as any).user_id || "";
          if (!cpMap[uid]) cpMap[uid] = [];
          cpMap[uid].push(cp);
        });
      }
      setChildProfilesByUser(cpMap);

      const failedRows = failedImageSnap
        ? failedImageSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => {
              const aTs = toDateValue(a.last_failed_at)?.getTime() ?? 0;
              const bTs = toDateValue(b.last_failed_at)?.getTime() ?? 0;
              return bTs - aTs;
            })
        : [];
      setFailedImageItems(failedRows);

      const hasAnyFailure =
        storiesRes.status === "rejected" ||
        usersRes.status === "rejected" ||
        paymentsRes.status === "rejected" ||
        pricingRes.status === "rejected" ||
        childProfilesRes.status === "rejected" ||
        failedImageRes.status === "rejected";
      if (hasAnyFailure) {
        toast.error("Some admin sections could not be loaded. Partial data shown.");
      }
    } catch {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  // ─── Tab switcher ─────────────────────────────────────────────────────────────

  const switchTab = (tabId: string) => {
    setTab(tabId);
    if (tabId === "costs" && !costReport) fetchCosts();
    if (tabId === "whitelist") fetchWhitelistData();
    if (tabId === "coupons") fetchCoupons();
    if (tabId === "failed-image-generation") fetchFailedImageGenerations();
    if (tabId === "contacts") fetchContacts();
    if (tabId === "refund-requests") fetchRefundRequests();
  };

  // ─── Computed data ───────────────────────────────────────────────────────────

  const visibleStories = stories
    .filter((s: any) => {
      const status = String(s.status || "");
      return (
        !!s.pdf_url ||
        [
          "draft_ready", "approved", "generating_scenes", "generating_images",
          "creating_pdf", "scenes_failed", "failed", "completed",
        ].includes(status)
      );
    })
    .sort((a: any, b: any) => {
      const aTs = toDateValue(a.created_at)?.getTime() ?? 0;
      const bTs = toDateValue(b.created_at)?.getTime() ?? 0;
      return bTs - aTs;
    });

  // ─── Stories handlers ────────────────────────────────────────────────────────

  const fetchStoryPages = async (storyId: string) => {
    if (storyPagesByStory[storyId]) return;
    try {
      const snap = await getDocs(
        query(collection(db, "stories", storyId, "pages"), orderBy("page", "asc"))
      );
      setStoryPagesByStory((prev) => ({
        ...prev,
        [storyId]: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      }));
    } catch {
      toast.error("Failed to load story pages");
    }
  };

  const handleStoryRetryPage = async (storyId: string, pageId: string) => {
    setRetryingStoryPageId(pageId);
    setStoryPagesByStory((prev) => ({
      ...prev,
      [storyId]: (prev[storyId] ?? []).map((p) =>
        p.id === pageId
          ? {
              ...p,
              status: "pending",
              image_url: null,
              jpeg_url: null,
              image_generation_qa_status: "retry_queued",
              image_generation_qa_warning: "",
              image_generation_qa_attempts: [],
              image_generation_required_visual_elements: [],
              last_image_generation_error: "",
            }
          : p
      ),
    }));
    try {
      const fns = getFunctions(undefined, "asia-south1");
      await httpsCallable(fns, "adminRetryPageImage")({ storyId, pageId });
      toast.success("Page re-queued for generation");
      const unsub = onSnapshot(doc(db, "stories", storyId, "pages", pageId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setStoryPagesByStory((prev) => ({
          ...prev,
          [storyId]: (prev[storyId] ?? []).map((p) =>
            p.id === pageId ? { ...p, ...data, id: pageId } : p
          ),
        }));
        if (data.status === "completed" || data.status === "failed" || data.image_url || data.jpeg_url) {
          setRetryingStoryPageId(null);
          unsub();
        }
      });
    } catch (e: any) {
      toast.error(e?.message || "Retry failed");
      setRetryingStoryPageId(null);
    }
  };

  const handleStoryRegeneratePdf = async (storyId: string) => {
    setRegeneratingPdfForStory(storyId);
    try {
      const fns = getFunctions(undefined, "asia-south1");
      await httpsCallable(fns, "adminRetryPdf")({ storyId });
      toast.success("PDF regeneration queued — refreshing when ready");
      let attempts = 0;
      const poll = async () => {
        attempts++;
        const storySnap = await getDoc(doc(db, "stories", storyId));
        const pdfUrl: string = storySnap.data()?.pdf_url ?? "";
        const prev = stories.find((s: any) => s.id === storyId)?.pdf_url ?? "";
        if (pdfUrl && pdfUrl !== prev) {
          setStories((prev) =>
            prev.map((s: any) => (s.id === storyId ? { ...s, pdf_url: pdfUrl } : s))
          );
          toast.success("PDF is ready");
        } else if (attempts < 24) {
          setTimeout(poll, 5000);
        }
      };
      setTimeout(poll, 5000);
    } catch (e: any) {
      toast.error(e?.message || "PDF regeneration failed");
    } finally {
      setRegeneratingPdfForStory(null);
    }
  };

  // ─── Failed images handlers ──────────────────────────────────────────────────

  const fetchFailedImageGenerations = async () => {
    setLoadingFailedImages(true);
    try {
      const snap = await getDocs(collection(db, "_failed_image_generation"));
      setFailedImageItems(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => {
            const aTs = toDateValue(a.last_failed_at)?.getTime() ?? 0;
            const bTs = toDateValue(b.last_failed_at)?.getTime() ?? 0;
            return bTs - aTs;
          })
      );
    } catch {
      toast.error("Failed to load failed image generation items");
    } finally {
      setLoadingFailedImages(false);
    }
  };

  const handleRetryFailedImage = async (failedDocId: string) => {
    setRetryingFailedDocId(failedDocId);
    try {
      const fns = getFunctions(undefined, "asia-south1");
      await httpsCallable<{ failedDocId: string }, { status: string }>(
        fns,
        "adminRetryFailedImageGeneration"
      )({ failedDocId });
      toast.success("Failed image task re-queued");
      await fetchFailedImageGenerations();
    } catch (e: any) {
      toast.error(e?.message || "Retry failed");
    } finally {
      setRetryingFailedDocId(null);
    }
  };

  // ─── Refund handlers ─────────────────────────────────────────────────────────

  const handleRefund = async (_paymentId: string) => {
    toast.info("Refund processing is not available in this version.");
  };

  const fetchRefundRequests = async () => {
    setLoadingRefunds(true);
    try {
      const snap = await getDocs(
        query(collection(db, "refund_requests"), orderBy("created_at", "desc"))
      );
      setRefundRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error("Failed to load refund requests");
    } finally {
      setLoadingRefunds(false);
    }
  };

  const fetchRefundStoryPages = async (storyId: string) => {
    if (refundPagesByStory[storyId]) return;
    try {
      const [pagesSnap, storySnap] = await Promise.all([
        getDocs(query(collection(db, "stories", storyId, "pages"), orderBy("page", "asc"))),
        getDoc(doc(db, "stories", storyId)),
      ]);
      setRefundPagesByStory((prev) => ({
        ...prev,
        [storyId]: pagesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      }));
      const pdfUrl: string = storySnap.data()?.pdf_url ?? "";
      if (pdfUrl) setRefundStoryPdfByStory((prev) => ({ ...prev, [storyId]: pdfUrl }));
    } catch {
      toast.error("Failed to load story pages");
    }
  };

  const handleRefundRetryPage = async (storyId: string, pageId: string) => {
    setRetryingRefundPageId(pageId);
    setRefundPagesByStory((prev) => ({
      ...prev,
      [storyId]: (prev[storyId] ?? []).map((p) =>
        p.id === pageId
          ? {
              ...p,
              status: "pending",
              image_url: null,
              jpeg_url: null,
              image_generation_qa_status: "retry_queued",
              image_generation_qa_warning: "",
              image_generation_qa_attempts: [],
              image_generation_required_visual_elements: [],
              last_image_generation_error: "",
            }
          : p
      ),
    }));
    try {
      const fns = getFunctions(undefined, "asia-south1");
      await httpsCallable(fns, "adminRetryPageImage")({ storyId, pageId });
      toast.success("Page re-queued for generation");
      const unsub = onSnapshot(doc(db, "stories", storyId, "pages", pageId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setRefundPagesByStory((prev) => ({
          ...prev,
          [storyId]: (prev[storyId] ?? []).map((p) =>
            p.id === pageId ? { ...p, ...data, id: pageId } : p
          ),
        }));
        if (data.status === "completed" || data.status === "failed" || data.image_url || data.jpeg_url) {
          setRetryingRefundPageId(null);
          unsub();
        }
      });
    } catch (e: any) {
      toast.error(e?.message || "Retry failed");
      setRetryingRefundPageId(null);
    }
  };

  const handleRefundRegeneratePdf = async (storyId: string) => {
    setRegeneratingPdfForStory(storyId);
    try {
      const fns = getFunctions(undefined, "asia-south1");
      await httpsCallable(fns, "adminRetryPdf")({ storyId });
      toast.success("PDF regeneration queued — refresh the link once it's ready");
      let attempts = 0;
      const poll = async () => {
        attempts++;
        const storySnap = await getDoc(doc(db, "stories", storyId));
        const pdfUrl: string = storySnap.data()?.pdf_url ?? "";
        const prevUrl = refundStoryPdfByStory[storyId] ?? "";
        if (pdfUrl && pdfUrl !== prevUrl) {
          setRefundStoryPdfByStory((prev) => ({ ...prev, [storyId]: pdfUrl }));
          toast.success("PDF is ready — review the link below");
        } else if (attempts < 24) {
          setTimeout(poll, 5000);
        }
      };
      setTimeout(poll, 5000);
    } catch (e: any) {
      toast.error(e?.message || "PDF regeneration failed");
    } finally {
      setRegeneratingPdfForStory(null);
    }
  };

  const handleIssueRefund = async (refundRequestId: string) => {
    if (!window.confirm("Issue a full Razorpay refund for this payment? This cannot be undone."))
      return;
    setIssuingRefund(refundRequestId);
    try {
      const fns = getFunctions(undefined, "asia-south1");
      const result = await httpsCallable<
        { refundRequestId: string },
        { success: boolean; razorpayRefundId: unknown }
      >(fns, "adminIssueRefund")({ refundRequestId });
      toast.success(`Refund issued — Razorpay ID: ${result.data.razorpayRefundId}`);
      setRefundRequests((prev) =>
        prev.map((r) => (r.id === refundRequestId ? { ...r, status: "refunded" } : r))
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to issue refund");
    } finally {
      setIssuingRefund(null);
    }
  };

  const handleCloseRefundRequest = async (refundRequestId: string) => {
    if (!window.confirm("Close this refund request without issuing a refund?")) return;
    setClosingRefundRequest(refundRequestId);
    try {
      const fns = getFunctions(undefined, "asia-south1");
      await httpsCallable<{ refundRequestId: string }, { success: boolean }>(
        fns,
        "adminCloseRefundRequest"
      )({ refundRequestId });
      toast.success("Refund request closed");
      setRefundRequests((prev) =>
        prev.map((r) => (r.id === refundRequestId ? { ...r, status: "closed" } : r))
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to close refund request");
    } finally {
      setClosingRefundRequest(null);
    }
  };

  const handleSendCorrectionEmail = async (storyId: string) => {
    setSendingCorrectionEmail(storyId);
    try {
      const fns = getFunctions(undefined, "asia-south1");
      const result = await httpsCallable<
        { storyId: string },
        { success: boolean; userEmail: string }
      >(fns, "adminSendCorrectionEmail")({ storyId });
      toast.success(`Correction email sent to ${result.data.userEmail}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send correction email");
    } finally {
      setSendingCorrectionEmail(null);
    }
  };

  const handleSavePageText = async (storyId: string, page: any) => {
    const key = `${storyId}:${page.id}`;
    const newText = pageTextEdits[key] ?? "";
    setSavingPageTextId(page.id);
    try {
      const fns = getFunctions(undefined, "asia-south1");
      const payload: Record<string, string> = { storyId, pageId: page.id, text: newText };
      if (page.page === 0) {
        const lines = newText.split("\n");
        payload.coverTitle = lines[0] ?? "";
        payload.coverSubtitle = lines.slice(1).join("\n");
      }
      await httpsCallable(fns, "adminUpdatePageText")(payload);
      setRefundPagesByStory((prev) => ({
        ...prev,
        [storyId]: prev[storyId].map((p) =>
          p.id === page.id
            ? {
                ...p,
                text: newText,
                ...(page.page === 0
                  ? {
                      cover_title: newText.split("\n")[0] ?? "",
                      cover_subtitle: newText.split("\n").slice(1).join("\n"),
                    }
                  : {}),
              }
            : p
        ),
      }));
      setEditingPageId(null);
      toast.success("Page text updated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update page text");
    } finally {
      setSavingPageTextId(null);
    }
  };

  // ─── Contacts handlers ───────────────────────────────────────────────────────

  const fetchContacts = async () => {
    setLoadingContacts(true);
    try {
      const snap = await getDocs(
        query(collection(db, "contacts"), orderBy("created_at", "desc"))
      );
      setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error("Failed to load contact queries");
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    setDeletingContactId(contactId);
    try {
      await deleteDoc(doc(db, "contacts", contactId));
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      toast.success("Contact query deleted");
    } catch {
      toast.error("Failed to delete contact query");
    } finally {
      setDeletingContactId(null);
    }
  };

  // ─── Coupons handlers ────────────────────────────────────────────────────────

  const fetchCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const snap = await getDocs(
        query(collection(db, "discount_coupons"), orderBy("created_at", "desc"))
      );
      setCoupons(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error("Failed to load coupons");
    } finally {
      setLoadingCoupons(false);
    }
  };

  const handleAddCoupon = async () => {
    const code = couponCodeInput.trim().toUpperCase();
    const allowedUsage = Number(couponUsageInput);
    const discountPercent = Number(couponDiscountInput);

    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
      toast.error("Coupon code must be 3-30 chars (A-Z, 0-9, _ or -)");
      return;
    }
    if (!Number.isInteger(allowedUsage) || allowedUsage <= 0) {
      toast.error("Allowed usage must be a positive whole number");
      return;
    }
    if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
      toast.error("Discount % must be more than 0 and up to 100");
      return;
    }

    setAddingCoupon(true);
    try {
      const couponRef = doc(db, "discount_coupons", code);
      const existing = await getDoc(couponRef);
      if (existing.exists()) {
        toast.error("Coupon code already exists");
        return;
      }
      await setDoc(couponRef, {
        code,
        active: true,
        discount_percent: Number(discountPercent.toFixed(2)),
        initial_uses: allowedUsage,
        remaining_uses: allowedUsage,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: user?.id || "",
      });
      setCouponCodeInput("");
      setCouponUsageInput("");
      setCouponDiscountInput("");
      toast.success("Coupon added");
      await fetchCoupons();
    } catch {
      toast.error("Failed to add coupon");
    } finally {
      setAddingCoupon(false);
    }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    setDeletingCoupon(couponId);
    try {
      await deleteDoc(doc(db, "discount_coupons", couponId));
      setCoupons((prev) => prev.filter((c) => c.id !== couponId));
      toast.success("Coupon removed");
    } catch {
      toast.error("Failed to remove coupon");
    } finally {
      setDeletingCoupon(null);
    }
  };

  // ─── Whitelist handlers ──────────────────────────────────────────────────────

  const fetchWhitelistData = async () => {
    setLoadingWhitelist(true);
    try {
      const [usersSnap, whitelistSnap] = await Promise.all([
        getDocs(collection(db, "user_profile")),
        getDocs(collection(db, "beta_whitelist")),
      ]);
      setAllUsers(
        usersSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) =>
            (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase())
          )
      );
      const map: Record<string, any> = {};
      whitelistSnap.docs.forEach((d) => {
        map[d.id] = d.data();
      });
      setWhitelistMap(map);
    } catch {
      toast.error("Failed to load whitelist data");
    } finally {
      setLoadingWhitelist(false);
    }
  };

  const handleToggleWhitelist = async (u: any, enabled: boolean) => {
    const userId = u.uid || u.id;
    if (!userId) return;
    setSavingWhitelistUser(userId);
    try {
      const emailLower = (u.email || "").trim().toLowerCase();
      const emailKey = emailLower ? `email:${emailLower}` : "";
      if (enabled) {
        await setDoc(
          doc(db, "beta_whitelist", userId),
          {
            user_id: userId,
            email: u.email || "",
            email_lower: emailLower,
            name: u.name || "",
            enabled: true,
            added_at: new Date().toISOString(),
            added_by: user?.id || "",
          },
          { merge: true }
        );
      } else {
        const deletes: Promise<void>[] = [
          deleteDoc(doc(db, "beta_whitelist", userId)) as Promise<void>,
        ];
        if (emailKey)
          deletes.push(deleteDoc(doc(db, "beta_whitelist", emailKey)) as Promise<void>);
        await Promise.all(deletes);
      }
      setWhitelistMap((prev) => {
        if (enabled) {
          return {
            ...prev,
            [userId]: {
              ...(prev[userId] ?? {}),
              user_id: userId,
              email: u.email || "",
              email_lower: emailLower,
              name: u.name || "",
              enabled: true,
            },
          };
        }
        const next = { ...prev };
        delete next[userId];
        if (emailKey) delete next[emailKey];
        return next;
      });
      toast.success(enabled ? "User whitelisted" : "User removed from whitelist");
    } catch {
      toast.error("Failed to update whitelist");
    } finally {
      setSavingWhitelistUser(null);
    }
  };

  const handleAddWhitelistEmail = async () => {
    const emailLower = whitelistEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      toast.error("Enter a valid email");
      return;
    }
    const key = `email:${emailLower}`;
    setAddingWhitelistEmail(true);
    try {
      await setDoc(
        doc(db, "beta_whitelist", key),
        {
          email: emailLower,
          email_lower: emailLower,
          enabled: true,
          added_at: new Date().toISOString(),
          added_by: user?.id || "",
        },
        { merge: true }
      );
      setWhitelistMap((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? {}), email: emailLower, email_lower: emailLower, enabled: true },
      }));
      setWhitelistEmail("");
      toast.success("Email added to whitelist");
    } catch {
      toast.error("Failed to add email");
    } finally {
      setAddingWhitelistEmail(false);
    }
  };

  const handleRemoveWhitelistEmail = async (key: string) => {
    try {
      await deleteDoc(doc(db, "beta_whitelist", key));
      setWhitelistMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.success("Email removed from whitelist");
    } catch {
      toast.error("Failed to remove email");
    }
  };

  // ─── Costs handlers ──────────────────────────────────────────────────────────

  const fetchCosts = async () => {
    setLoadingCosts(true);
    try {
      const fns = getFunctions(undefined, "asia-south1");
      const result: any = await httpsCallable(fns, "getAdminCostReport")({});
      setCostReport(result.data);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load cost report");
    } finally {
      setLoadingCosts(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-[#3730A3]" strokeWidth={2} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Header */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FDFBF7]/80 border-b border-[#F3E8FF]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="text-[#1E1B4B]/60 hover:text-[#1E1B4B]"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
            </button>
            <h1 className="text-xl font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
              Admin Panel
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={fetchAll}
            className="rounded-full border-[#F3E8FF]"
            data-testid="btn-admin-refresh"
          >
            <RefreshCw className="w-4 h-4 mr-2" strokeWidth={2} />
            Refresh
          </Button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 h-fit">
            <Card className="rounded-2xl border-2 border-[#F3E8FF]">
              <CardContent className="p-3">
                <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider px-2 py-1 mb-1">
                  Admin Sections
                </p>
                <div className="space-y-1">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      data-testid={`admin-tab-${t.id}`}
                      onClick={() => switchTab(t.id)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                        tab === t.id
                          ? "bg-[#1E1B4B] text-white"
                          : "text-[#1E1B4B]/70 hover:bg-[#F3E8FF]/60"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="h-px bg-[#F3E8FF] my-3" />

                <div className="space-y-1">
                  <button
                    onClick={() => navigate("/admin/models")}
                    className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition-all text-[#3730A3]/80 hover:bg-[#3730A3]/10 flex items-center gap-2"
                  >
                    <Bot className="w-4 h-4" strokeWidth={2.5} />
                    Models
                  </button>
                  <button
                    onClick={() => navigate("/admin/pricing")}
                    className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition-all text-[#FF9F1C]/90 hover:bg-[#FF9F1C]/10 flex items-center gap-2"
                  >
                    <IndianRupee className="w-4 h-4" strokeWidth={2.5} />
                    Pricing
                  </button>
                </div>
              </CardContent>
            </Card>
          </aside>

          {/* Tab content */}
          <div>
            {tab === "overview" && stats && <AdminOverviewTab stats={stats} />}

            {tab === "users" && (
              <AdminUsersTab
                userProfiles={userProfiles}
                childProfilesByUser={childProfilesByUser}
                userSearch={userSearch}
                setUserSearch={setUserSearch}
                stories={stories}
                expandedUser={expandedUser}
                setExpandedUser={setExpandedUser}
              />
            )}

            {tab === "stories" && (
              <AdminStoriesTab
                visibleStories={visibleStories}
                expandedStoryId={expandedStoryId}
                setExpandedStoryId={setExpandedStoryId}
                storyPagesByStory={storyPagesByStory}
                fetchStoryPages={fetchStoryPages}
                handleStoryRetryPage={handleStoryRetryPage}
                handleStoryRegeneratePdf={handleStoryRegeneratePdf}
                regeneratingPdfForStory={regeneratingPdfForStory}
                retryingStoryPageId={retryingStoryPageId}
                userEmailById={userEmailById}
                setLightbox={setLightbox}
              />
            )}

            {tab === "failed-image-generation" && (
              <AdminFailedImagesTab
                failedImageItems={failedImageItems}
                loadingFailedImages={loadingFailedImages}
                fetchFailedImageGenerations={fetchFailedImageGenerations}
                handleRetryFailedImage={handleRetryFailedImage}
                retryingFailedDocId={retryingFailedDocId}
              />
            )}

            {tab === "refund-requests" && (
              <AdminRefundRequestsTab
                refundRequests={refundRequests}
                loadingRefunds={loadingRefunds}
                fetchRefundRequests={fetchRefundRequests}
                expandedRefundId={expandedRefundId}
                setExpandedRefundId={setExpandedRefundId}
                refundPagesByStory={refundPagesByStory}
                fetchRefundStoryPages={fetchRefundStoryPages}
                refundStoryPdfByStory={refundStoryPdfByStory}
                handleRefundRetryPage={handleRefundRetryPage}
                retryingRefundPageId={retryingRefundPageId}
                handleRefundRegeneratePdf={handleRefundRegeneratePdf}
                regeneratingPdfForStory={regeneratingPdfForStory}
                handleSendCorrectionEmail={handleSendCorrectionEmail}
                sendingCorrectionEmail={sendingCorrectionEmail}
                handleIssueRefund={handleIssueRefund}
                issuingRefund={issuingRefund}
                handleCloseRefundRequest={handleCloseRefundRequest}
                closingRefundRequest={closingRefundRequest}
                handleSavePageText={handleSavePageText}
                pageTextEdits={pageTextEdits}
                setPageTextEdits={setPageTextEdits}
                editingPageId={editingPageId}
                setEditingPageId={setEditingPageId}
                savingPageTextId={savingPageTextId}
                setLightbox={setLightbox}
              />
            )}

            {tab === "contacts" && (
              <AdminContactsTab
                contacts={contacts}
                loadingContacts={loadingContacts}
                fetchContacts={fetchContacts}
                handleDeleteContact={handleDeleteContact}
                deletingContactId={deletingContactId}
              />
            )}

            {tab === "whitelist" && (
              <AdminWhitelistTab
                allUsers={allUsers}
                whitelistMap={whitelistMap}
                loadingWhitelist={loadingWhitelist}
                whitelistSearch={whitelistSearch}
                setWhitelistSearch={setWhitelistSearch}
                savingWhitelistUser={savingWhitelistUser}
                whitelistEmail={whitelistEmail}
                setWhitelistEmail={setWhitelistEmail}
                addingWhitelistEmail={addingWhitelistEmail}
                fetchWhitelistData={fetchWhitelistData}
                handleToggleWhitelist={handleToggleWhitelist}
                handleAddWhitelistEmail={handleAddWhitelistEmail}
                handleRemoveWhitelistEmail={handleRemoveWhitelistEmail}
              />
            )}

            {tab === "coupons" && (
              <AdminCouponsTab
                coupons={coupons}
                loadingCoupons={loadingCoupons}
                fetchCoupons={fetchCoupons}
                couponCodeInput={couponCodeInput}
                setCouponCodeInput={setCouponCodeInput}
                couponDiscountInput={couponDiscountInput}
                setCouponDiscountInput={setCouponDiscountInput}
                couponUsageInput={couponUsageInput}
                setCouponUsageInput={setCouponUsageInput}
                addingCoupon={addingCoupon}
                handleAddCoupon={handleAddCoupon}
                handleDeleteCoupon={handleDeleteCoupon}
                deletingCoupon={deletingCoupon}
              />
            )}

            {tab === "payments" && (
              <AdminPaymentsTab payments={payments} handleRefund={handleRefund} />
            )}

            {tab === "costs" && (
              <AdminCostsTab
                costReport={costReport}
                loadingCosts={loadingCosts}
                fetchCosts={fetchCosts}
                setCostReport={setCostReport}
                expandedUser={expandedUser}
                setExpandedUser={setExpandedUser}
              />
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[999] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
          <div
            className="flex flex-col w-fit max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.url}
              alt={lightbox.label}
              className={`w-auto max-w-[90vw] object-contain shadow-2xl block ${
                lightbox.text ? "rounded-t-2xl" : "rounded-2xl"
              }`}
              style={{ maxHeight: lightbox.text ? "72vh" : "90vh" }}
            />
            {lightbox.text && (
              <div className="rounded-b-2xl bg-black/75 px-4 py-3 max-h-[18vh] overflow-y-auto w-full">
                <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1">
                  {lightbox.label}
                </p>
                <p className="font-story text-base text-white leading-relaxed whitespace-pre-wrap break-words">
                  {lightbox.text}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
