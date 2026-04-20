import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, orderBy, where } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Input } from "../components/ui/input";
import {
  ArrowLeft, Trash2, RefreshCw, DollarSign, Users, BookOpen,
  Activity, Undo2, Bot, ChevronDown, ChevronUp, IndianRupee, User, Baby, Search, Mail, AlertCircle
} from "lucide-react";

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

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [stories, setStories] = useState<any[]>([]);
  const [userEmailById, setUserEmailById] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  const [costReport, setCostReport] = useState<any>(null);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Whitelist tab state
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [whitelistMap, setWhitelistMap] = useState<Record<string, any>>({});
  const [loadingWhitelist, setLoadingWhitelist] = useState(false);
  const [whitelistSearch, setWhitelistSearch] = useState("");
  const [savingWhitelistUser, setSavingWhitelistUser] = useState<string | null>(null);
  const [whitelistEmail, setWhitelistEmail] = useState("");
  const [addingWhitelistEmail, setAddingWhitelistEmail] = useState(false);

  // Users tab state
  const [userProfiles, setUserProfiles] = useState<any[]>([]);
  const [childProfilesByUser, setChildProfilesByUser] = useState<Record<string, any[]>>({});
  const [userSearch, setUserSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Failed image generation tab state
  const [failedImageItems, setFailedImageItems] = useState<any[]>([]);
  const [loadingFailedImages, setLoadingFailedImages] = useState(false);
  const [retryingFailedDocId, setRetryingFailedDocId] = useState<string | null>(null);

  // Contacts tab state
  const [contacts, setContacts] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);

  // Refund requests tab state
  const [refundRequests, setRefundRequests] = useState<any[]>([]);
  const [loadingRefunds, setLoadingRefunds] = useState(false);
  const [expandedRefundId, setExpandedRefundId] = useState<string | null>(null);
  const [refundPagesByStory, setRefundPagesByStory] = useState<Record<string, any[]>>({});
  const [retryingRefundPageId, setRetryingRefundPageId] = useState<string | null>(null);
  const [regeneratingPdfForStory, setRegeneratingPdfForStory] = useState<string | null>(null);

  // Coupons tab state
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [couponUsageInput, setCouponUsageInput] = useState("");
  const [couponDiscountInput, setCouponDiscountInput] = useState("");
  const [addingCoupon, setAddingCoupon] = useState(false);
  const [deletingCoupon, setDeletingCoupon] = useState<string | null>(null);

  useEffect(() => {
    // Wait until auth state is resolved to avoid redirecting admins during initial load.
    if (!user) return;
    if (!user.is_admin) {
      navigate("/dashboard", { replace: true });
      return;
    }
    fetchAll();
  }, [user?.id, user?.is_admin, navigate]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [storiesRes, usersRes, paymentsRes, pricingRes, childProfilesRes, failedImageRes] = await Promise.allSettled([
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
      // Users tab data
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

      const failedRows = failedImageSnap ? failedImageSnap.docs
        .map((d) => ({id: d.id, ...d.data()}))
        .sort((a: any, b: any) => {
          const aTs = toDateValue(a.last_failed_at)?.getTime() ?? 0;
          const bTs = toDateValue(b.last_failed_at)?.getTime() ?? 0;
          return bTs - aTs;
        }) : [];
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
    } catch (e) {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  const fetchFailedImageGenerations = async () => {
    setLoadingFailedImages(true);
    try {
      const snap = await getDocs(collection(db, "_failed_image_generation"));
      const rows = snap.docs
        .map((d) => ({id: d.id, ...d.data()}))
        .sort((a: any, b: any) => {
          const aTs = toDateValue(a.last_failed_at)?.getTime() ?? 0;
          const bTs = toDateValue(b.last_failed_at)?.getTime() ?? 0;
          return bTs - aTs;
        });
      setFailedImageItems(rows);
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
      const retryFn = httpsCallable<{failedDocId: string}, {status: string}>(fns, "adminRetryFailedImageGeneration");
      await retryFn({failedDocId});
      toast.success("Failed image task re-queued");
      await fetchFailedImageGenerations();
    } catch (e: any) {
      toast.error(e?.message || "Retry failed");
    } finally {
      setRetryingFailedDocId(null);
    }
  };

  const handleRefund = async (_paymentId) => {
    toast.info("Refund processing is not available in this version.");
  };

  const fetchCosts = async () => {
    setLoadingCosts(true);
    try {
      const fns = getFunctions(undefined, "asia-south1");
      const getAdminCostReport = httpsCallable(fns, "getAdminCostReport");
      const result: any = await getAdminCostReport({});
      setCostReport(result.data);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load cost report");
    } finally {
      setLoadingCosts(false);
    }
  };

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

  const switchTab = (tabId: string) => {
    setTab(tabId);
    if (tabId === "costs" && !costReport) fetchCosts();
    if (tabId === "whitelist") fetchWhitelistData();
    if (tabId === "coupons") fetchCoupons();
    if (tabId === "failed-image-generation") fetchFailedImageGenerations();
    if (tabId === "contacts") fetchContacts();
    if (tabId === "refund-requests") fetchRefundRequests();
  };

  useEffect(() => {
    if (!user?.is_admin) return;
    const storageKey = `${ADMIN_TAB_STORAGE_KEY}:${user.id || "unknown"}`;
    try {
      const savedTab = localStorage.getItem(storageKey) || "overview";
      if (ADMIN_TAB_IDS.includes(savedTab as typeof ADMIN_TAB_IDS[number])) {
        setTab(savedTab);
      }
    } catch {
      // Some browsers/privacy modes can block localStorage access.
      setTab("overview");
    }
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

  const toDateValue = (raw: any): Date | null => {
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

  const toDisplayDate = (raw: any) => {
    const d = toDateValue(raw);
    return d ? d.toLocaleString("en-IN", {dateStyle: "short", timeStyle: "short"}) : "";
  };

  const visibleStories = stories
    .filter((s: any) => {
      const status = String(s.status || "");
      return (
        !!s.pdf_url ||
        [
          "approved",
          "generating_scenes",
          "generating_images",
          "creating_pdf",
          "scenes_failed",
          "failed",
          "completed",
        ].includes(status)
      );
    })
    .sort((a: any, b: any) => {
      const aTs = toDateValue(a.created_at)?.getTime() ?? 0;
      const bTs = toDateValue(b.created_at)?.getTime() ?? 0;
      return bTs - aTs;
    });

  const getStoryCoverThumbnail = (story: any) => {
    if (story?.cover_image_url) return story.cover_image_url;
    if (Array.isArray(story?.pages) && story.pages.length > 0) {
      const coverPage = story.pages.find((p: any) => p?.page === 0) || story.pages[0];
      return coverPage?.image_url || "";
    }
    return "";
  };

  const fetchCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const snap = await getDocs(query(collection(db, "discount_coupons"), orderBy("created_at", "desc")));
      setCoupons(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error("Failed to load coupons");
    } finally {
      setLoadingCoupons(false);
    }
  };

  const fetchContacts = async () => {
    setLoadingContacts(true);
    try {
      const snap = await getDocs(query(collection(db, "contacts"), orderBy("created_at", "desc")));
      setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error("Failed to load contact queries");
    } finally {
      setLoadingContacts(false);
    }
  };

  const fetchRefundRequests = async () => {
    setLoadingRefunds(true);
    try {
      const snap = await getDocs(query(collection(db, "refund_requests"), orderBy("created_at", "desc")));
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
      const snap = await getDocs(
        query(collection(db, "stories", storyId, "pages"), orderBy("page", "asc"))
      );
      const pages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRefundPagesByStory((prev) => ({ ...prev, [storyId]: pages }));
    } catch {
      toast.error("Failed to load story pages");
    }
  };

  const handleRefundRetryPage = async (storyId: string, pageId: string) => {
    setRetryingRefundPageId(pageId);
    try {
      const fns = getFunctions(undefined, "asia-south1");
      const retryFn = httpsCallable(fns, "adminRetryPageImage");
      await retryFn({ storyId, pageId });
      toast.success("Page re-queued for generation");
      // Refresh pages for this story
      setRefundPagesByStory((prev) => { const next = { ...prev }; delete next[storyId]; return next; });
      await fetchRefundStoryPages(storyId);
    } catch (e: any) {
      toast.error(e?.message || "Retry failed");
    } finally {
      setRetryingRefundPageId(null);
    }
  };

  const handleRefundRegeneratePdf = async (storyId: string) => {
    setRegeneratingPdfForStory(storyId);
    try {
      const fns = getFunctions(undefined, "asia-south1");
      const retryFn = httpsCallable(fns, "adminRetryPdf");
      await retryFn({ storyId });
      toast.success("PDF regeneration queued — new PDF will replace the old one");
    } catch (e: any) {
      toast.error(e?.message || "PDF regeneration failed");
    } finally {
      setRegeneratingPdfForStory(null);
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

  const fetchWhitelistData = async () => {
    setLoadingWhitelist(true);
    try {
      const [usersSnap, whitelistSnap] = await Promise.all([
        getDocs(collection(db, "user_profile")),
        getDocs(collection(db, "beta_whitelist")),
      ]);

      const users = usersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const aName = (a.name ?? "").toLowerCase();
          const bName = (b.name ?? "").toLowerCase();
          return aName.localeCompare(bName);
        });

      const map: Record<string, any> = {};
      whitelistSnap.docs.forEach((d) => {
        map[d.id] = d.data();
      });

      setAllUsers(users);
      setWhitelistMap(map);
    } catch (e) {
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
        await setDoc(doc(db, "beta_whitelist", userId), {
          user_id: userId,
          email: u.email || "",
          email_lower: emailLower,
          name: u.name || "",
          enabled: true,
          added_at: new Date().toISOString(),
          added_by: user?.id || "",
        }, { merge: true });
      } else {
        const deletes: Promise<void>[] = [deleteDoc(doc(db, "beta_whitelist", userId)) as Promise<void>];
        if (emailKey) deletes.push(deleteDoc(doc(db, "beta_whitelist", emailKey)) as Promise<void>);
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
    } catch (e) {
      toast.error("Failed to update whitelist");
    } finally {
      setSavingWhitelistUser(null);
    }
  };

  const normalizeEmail = (email: string) => email.trim().toLowerCase();

  const handleAddWhitelistEmail = async () => {
    const emailLower = normalizeEmail(whitelistEmail);
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower);
    if (!isValid) {
      toast.error("Enter a valid email");
      return;
    }

    const key = `email:${emailLower}`;
    setAddingWhitelistEmail(true);
    try {
      await setDoc(doc(db, "beta_whitelist", key), {
        email: emailLower,
        email_lower: emailLower,
        enabled: true,
        added_at: new Date().toISOString(),
        added_by: user?.id || "",
      }, { merge: true });

      setWhitelistMap((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] ?? {}),
          email: emailLower,
          email_lower: emailLower,
          enabled: true,
        },
      }));
      setWhitelistEmail("");
      toast.success("Email added to whitelist");
    } catch (e) {
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
    } catch (e) {
      toast.error("Failed to remove email");
    }
  };

  const PAGE_STATUS_COLORS: Record<string, string> = {
    pending: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
    processing: "bg-[#3730A3]/15 text-[#3730A3]",
    completed: "bg-[#2A9D8F]/15 text-[#2A9D8F]",
    failed: "bg-[#E76F51]/15 text-[#E76F51]",
  };

  const STORY_STATUS_COLORS: Record<string, string> = {
    approved: "bg-[#3730A3]/15 text-[#3730A3]",
    generating_scenes: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
    generating_images: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
    creating_pdf: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
    completed: "bg-[#2A9D8F]/15 text-[#2A9D8F]",
    scenes_failed: "bg-[#E76F51]/15 text-[#E76F51]",
    failed: "bg-[#E76F51]/15 text-[#E76F51]",
  };

  const JOB_STATUS_COLORS = {
    pending: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
    processing: "bg-[#3730A3]/15 text-[#3730A3]",
    done: "bg-[#2A9D8F]/15 text-[#2A9D8F]",
    failed: "bg-[#E76F51]/15 text-[#E76F51]",
  };

  const PAY_STATUS_COLORS = {
    created: "bg-[#FF9F1C]/15 text-[#FF9F1C]",
    paid: "bg-[#2A9D8F]/15 text-[#2A9D8F]",
    failed: "bg-[#E76F51]/15 text-[#E76F51]",
    refunded: "bg-[#3730A3]/15 text-[#3730A3]",
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Header */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FDFBF7]/80 border-b border-[#F3E8FF]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/dashboard")} className="text-[#1E1B4B]/60 hover:text-[#1E1B4B]">
              <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
            </button>
            <h1 className="text-xl font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
              Admin Panel
            </h1>
          </div>
          <Button variant="outline" onClick={fetchAll} className="rounded-full border-[#F3E8FF]" data-testid="btn-admin-refresh">
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

          {/* Content */}
          <div>

        {/* Overview Tab */}
        {tab === "overview" && stats && (
          <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="admin-stats">
            {[
              { label: "Users", value: stats.total_users, icon: Users, color: "#3730A3" },
              { label: "Stories", value: `${stats.completed_stories}/${stats.total_stories}`, icon: BookOpen, color: "#2A9D8F" },
              { label: "Revenue", value: `₹${stats.total_revenue}`, icon: DollarSign, color: "#FF9F1C" },
              { label: "Queue", value: `${stats.pending_jobs}P / ${stats.processing_jobs}R`, icon: Activity, color: "#E76F51" },
            ].map((s) => (
              <Card key={s.label} className="rounded-2xl border-2 border-[#F3E8FF]">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <s.icon className="w-4 h-4" style={{ color: s.color }} strokeWidth={2.5} />
                    <span className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider">{s.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

        </>
        )}

        {/* Users Tab */}
        {tab === "users" && (
          <div>
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1E1B4B]/30" strokeWidth={2} />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-[#F3E8FF] text-sm text-[#1E1B4B] placeholder:text-[#1E1B4B]/30 focus:outline-none focus:border-[#3730A3]/30 bg-white"
              />
            </div>
            <div className="space-y-3">
              {userProfiles
                .filter((u: any) => {
                  const q = userSearch.toLowerCase();
                  return !q ||
                    (u.email || "").toLowerCase().includes(q) ||
                    (u.name || "").toLowerCase().includes(q);
                })
                .map((u: any) => {
                  const uid = u.uid || u.id;
                  const children = childProfilesByUser[uid] || [];
                  const storyCount = stories.filter((s: any) => s.user_id === uid).length;
                  const isExpanded = expandedUser === uid;
                  return (
                    <div key={uid} className="rounded-2xl border-2 border-[#F3E8FF] bg-white overflow-hidden">
                      <button
                        className="w-full flex items-center gap-4 p-4 text-left hover:bg-[#F3E8FF]/30 transition-colors"
                        onClick={() => setExpandedUser(isExpanded ? null : uid)}
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#3730A3]/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-[#3730A3]/60" strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1E1B4B] truncate" style={{ fontFamily: "Fredoka" }}>
                            {u.name || "(no name)"}
                          </p>
                          <p className="text-xs text-[#1E1B4B]/50 truncate">{u.email || "—"}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 text-right">
                          <div className="text-xs text-[#1E1B4B]/40">
                            <span className="font-semibold text-[#1E1B4B]/60">{storyCount}</span> stories
                          </div>
                          <div className="text-xs text-[#1E1B4B]/40">
                            <span className="font-semibold text-[#1E1B4B]/60">{children.length}</span> profiles
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-[#1E1B4B]/30" strokeWidth={2} />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[#1E1B4B]/30" strokeWidth={2} />
                          )}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t-2 border-[#F3E8FF] px-4 py-3 space-y-2 bg-[#F3E8FF]/20">
                          <p className="text-[10px] font-semibold text-[#1E1B4B]/40 uppercase tracking-wider mb-1">Child Profiles</p>
                          {children.length === 0 ? (
                            <p className="text-xs text-[#1E1B4B]/40 italic">No child profiles</p>
                          ) : (
                            children.map((cp: any) => (
                              <div key={cp.id} className="flex items-center gap-3 p-2 rounded-xl bg-white border border-[#F3E8FF]">
                                {cp.avatar_url ? (
                                  <img src={cp.avatar_url} alt={cp.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-[#FF9F1C]/10 flex items-center justify-center flex-shrink-0">
                                    <Baby className="w-4 h-4 text-[#FF9F1C]" strokeWidth={2} />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-[#1E1B4B] truncate">{cp.name}</p>
                                  <p className="text-[10px] text-[#1E1B4B]/40">
                                    Age {cp.age}{cp.gender ? ` · ${cp.gender}` : ""}
                                  </p>
                                </div>
                              </div>
                            ))
                          )}
                          <p className="text-[10px] font-semibold text-[#1E1B4B]/40 uppercase tracking-wider mt-2 mb-1">User ID</p>
                          <p className="text-[10px] font-mono text-[#1E1B4B]/40 break-all">{uid}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              {userProfiles.length === 0 && (
                <div className="text-center py-16">
                  <Users className="w-12 h-12 text-[#F3E8FF] mx-auto mb-4" strokeWidth={1.5} />
                  <p className="text-sm text-[#1E1B4B]/50">No users found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tasks Tab */}
        {tab === "whitelist" && (
          <div data-testid="admin-whitelist">
            <Card className="rounded-2xl border-2 border-[#F3E8FF] mb-4">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-[#1E1B4B] mb-2" style={{ fontFamily: "Fredoka" }}>
                  Add Email To Whitelist
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={whitelistEmail}
                    onChange={(e) => setWhitelistEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="rounded-full border-[#F3E8FF]"
                  />
                  <Button
                    onClick={handleAddWhitelistEmail}
                    disabled={addingWhitelistEmail}
                    className="rounded-full bg-[#2A9D8F] hover:bg-[#248679] text-white"
                  >
                    {addingWhitelistEmail ? "Adding…" : "Add"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <p className="text-sm text-[#1E1B4B]/50">
                  Beta users who can create child profiles and stories
                </p>
                <p className="text-xs text-[#1E1B4B]/40 mt-0.5">
                  Whitelisted: {Object.keys(whitelistMap).length} / {allUsers.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={whitelistSearch}
                  onChange={(e) => setWhitelistSearch(e.target.value)}
                  placeholder="Search name or email"
                  className="w-[220px] rounded-full border-[#F3E8FF]"
                />
                <Button
                  variant="outline"
                  onClick={fetchWhitelistData}
                  disabled={loadingWhitelist}
                  className="rounded-full border-[#F3E8FF]"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loadingWhitelist ? "animate-spin" : ""}`} strokeWidth={2} />
                  Refresh
                </Button>
              </div>
            </div>

            {loadingWhitelist && (
              <div className="flex items-center justify-center py-12 text-[#1E1B4B]/40">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Loading whitelist…
              </div>
            )}

            {!loadingWhitelist && (
              <div className="space-y-2">
                {allUsers
                  .filter((u: any) => {
                    const needle = whitelistSearch.trim().toLowerCase();
                    if (!needle) return true;
                    return (`${u.name || ""} ${u.email || ""}`).toLowerCase().includes(needle);
                  })
                  .map((u: any) => {
                    const uid = u.uid || u.id;
                    const emailKey = u.email ? `email:${String(u.email).trim().toLowerCase()}` : "";
                    const isAdminUser = u.is_admin === true;
                    const isWhitelisted = isAdminUser || !!whitelistMap[uid] || (!!emailKey && !!whitelistMap[emailKey]);
                    return (
                      <Card key={uid} className="rounded-2xl border-2 border-[#F3E8FF]">
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#F3E8FF] flex items-center justify-center text-xs font-bold text-[#3730A3]">
                            {(u.name?.[0] || u.email?.[0] || "?").toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#1E1B4B] truncate">{u.name || "Unnamed user"}</p>
                            <p className="text-xs text-[#1E1B4B]/40 truncate">{u.email || uid}</p>
                          </div>
                          {isAdminUser && (
                            <Badge className="bg-[#3730A3]/15 text-[#3730A3] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                              Admin
                            </Badge>
                          )}
                          {!isAdminUser && isWhitelisted && (
                            <Badge className="bg-[#2A9D8F]/15 text-[#2A9D8F] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                              Whitelisted
                            </Badge>
                          )}
                          {!isAdminUser && !isWhitelisted && (
                            <Badge className="bg-[#E76F51]/15 text-[#E76F51] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                              Blocked
                            </Badge>
                          )}
                          <Switch
                            checked={isWhitelisted}
                            disabled={isAdminUser || savingWhitelistUser === uid}
                            onCheckedChange={(checked) => handleToggleWhitelist(u, checked)}
                          />
                        </CardContent>
                      </Card>
                    );
                  })}

                {Object.entries(whitelistMap)
                  .filter(([key]) => key.startsWith("email:"))
                  .map(([key, val]: any) => (
                    <Card key={key} className="rounded-2xl border-2 border-[#F3E8FF] bg-[#FDFBF7]">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#2A9D8F]/10 flex items-center justify-center text-xs font-bold text-[#2A9D8F]">
                          @
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1E1B4B] truncate">{val.email || key.replace("email:", "")}</p>
                          <p className="text-xs text-[#1E1B4B]/40 truncate">Manual email whitelist</p>
                        </div>
                        <Badge className="bg-[#2A9D8F]/15 text-[#2A9D8F] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                          Whitelisted
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveWhitelistEmail(key)}
                          className="rounded-full text-[#E76F51] hover:bg-[#E76F51]/10"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={2} />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Stories Tab */}
        {tab === "stories" && (
          <div data-testid="admin-stories">
            <p className="text-sm text-[#1E1B4B]/50 mb-4">{visibleStories.length} story(s) including in-progress</p>
            <div className="space-y-2">
              {visibleStories.length === 0 ? (
                <p className="text-center py-12 text-[#1E1B4B]/40">No stories found in progress or completed states</p>
              ) : (
                visibleStories.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-3 p-4 rounded-xl bg-white border-2 border-[#F3E8FF]">
                    <div className="w-14 h-18 rounded-lg overflow-hidden bg-gradient-to-br from-[#3730A3]/10 to-[#FF9F1C]/10 flex-shrink-0">
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
                    <Badge className={`${STORY_STATUS_COLORS[s.status] || "bg-[#2A9D8F]/15 text-[#2A9D8F]"} rounded-full px-2.5 py-0.5 text-xs font-semibold border-0`}>
                      {s.status || "completed"}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1E1B4B] truncate">{s.title || "Untitled Story"}</p>
                      <p className="text-xs text-[#1E1B4B]/50 truncate">
                        {userEmailById[s.user_id] || s.user_email || "Unknown user"}
                      </p>
                      <p className="text-xs text-[#1E1B4B]/40">
                        {toDisplayDate(s.created_at)}
                      </p>
                    </div>
                    {s.pdf_url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(s.pdf_url, "_blank")}
                        className="rounded-full border-[#3730A3]/30 text-[#3730A3] hover:bg-[#3730A3]/10 text-xs"
                      >
                        Open PDF
                      </Button>
                    ) : (
                      <span className="text-xs text-[#1E1B4B]/35">PDF not ready</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Failed Image Generation Tab */}
        {tab === "failed-image-generation" && (
          <div data-testid="admin-failed-image-generation">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-[#1E1B4B]/50">{failedImageItems.length} failed item(s)</p>
              <Button
                variant="outline"
                onClick={fetchFailedImageGenerations}
                disabled={loadingFailedImages}
                className="rounded-full border-[#F3E8FF]"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingFailedImages ? "animate-spin" : ""}`} strokeWidth={2} />
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
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${retryingFailedDocId === item.id ? "animate-spin" : ""}`} strokeWidth={2} />
                        {retryingFailedDocId === item.id ? "Retrying…" : "Retry"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Refund Requests Tab */}
        {tab === "refund-requests" && (
          <div data-testid="admin-refund-requests">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-[#1E1B4B]/50">{refundRequests.length} refund request(s)</p>
              <Button
                variant="outline"
                onClick={fetchRefundRequests}
                disabled={loadingRefunds}
                className="rounded-full border-[#F3E8FF]"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingRefunds ? "animate-spin" : ""}`} strokeWidth={2} />
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
                    <div key={r.id} className="rounded-2xl border-2 border-[#F3E8FF] bg-white overflow-hidden">
                      {/* Header row */}
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
                          <Badge className="bg-[#E76F51]/15 text-[#E76F51] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                            {r.status || "pending"}
                          </Badge>
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4 text-[#1E1B4B]/30 mt-2" />
                            : <ChevronDown className="w-4 h-4 text-[#1E1B4B]/30 mt-2" />}
                        </div>
                      </button>

                      {/* Expanded: full issue + pages */}
                      {isExpanded && (
                        <div className="border-t-2 border-[#F3E8FF] px-4 pt-4 pb-5 bg-[#FDFBF7]">
                          {/* Full issue text */}
                          <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-2">Issue Description</p>
                          <p className="text-sm text-[#1E1B4B]/80 whitespace-pre-wrap break-words mb-5 p-3 rounded-xl bg-white border border-[#F3E8FF]">
                            {r.issue}
                          </p>

                          {/* Story details */}
                          <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-2">
                            Story ID: <span className="font-mono normal-case">{storyId}</span>
                          </p>

                          {/* Pages grid */}
                          <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-3">Story Pages</p>
                          {pages.length === 0 ? (
                            <p className="text-xs text-[#1E1B4B]/40 mb-4">Loading pages…</p>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-5">
                              {pages.map((page: any) => {
                                const imgUrl = page.jpeg_url || page.image_url || null;
                                const pageLabel = page.page === 0 ? "Cover" :
                                  page.page === pages.length - 1 ? "Back" : `Pg ${page.page}`;
                                const pageStatus = page.status || "unknown";
                                return (
                                  <div key={page.id} className="flex flex-col gap-1.5">
                                    <div className="rounded-xl overflow-hidden bg-[#F3E8FF] aspect-[3/4] relative">
                                      {imgUrl ? (
                                        <img
                                          src={imgUrl}
                                          alt={pageLabel}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <BookOpen className="w-6 h-6 text-[#1E1B4B]/20" strokeWidth={1.5} />
                                        </div>
                                      )}
                                      <div className="absolute top-1 left-1">
                                        <span className="text-[9px] font-bold bg-black/50 text-white rounded px-1 py-0.5">{pageLabel}</span>
                                      </div>
                                    </div>
                                    <Badge className={`${PAGE_STATUS_COLORS[pageStatus] || "bg-[#1E1B4B]/10 text-[#1E1B4B]/50"} border-0 rounded-full px-2 py-0 text-[10px] font-semibold self-start`}>
                                      {pageStatus}
                                    </Badge>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={retryingRefundPageId === page.id}
                                      onClick={() => handleRefundRetryPage(storyId, page.id)}
                                      className="rounded-full text-xs border-[#3730A3]/30 text-[#3730A3] hover:bg-[#3730A3]/10 h-7 px-3"
                                    >
                                      <RefreshCw className={`w-3 h-3 mr-1 ${retryingRefundPageId === page.id ? "animate-spin" : ""}`} strokeWidth={2} />
                                      {retryingRefundPageId === page.id ? "Retrying…" : "Retry"}
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Generate PDF button */}
                          <div className="flex items-center gap-3 pt-3 border-t border-[#F3E8FF]">
                            <Button
                              onClick={() => handleRefundRegeneratePdf(storyId)}
                              disabled={regeneratingPdfForStory === storyId}
                              className="rounded-full bg-[#3730A3] hover:bg-[#2e278f] text-white font-semibold gap-2"
                            >
                              <RefreshCw className={`w-4 h-4 ${regeneratingPdfForStory === storyId ? "animate-spin" : ""}`} strokeWidth={2.5} />
                              {regeneratingPdfForStory === storyId ? "Queuing PDF…" : "Generate PDF"}
                            </Button>
                            <p className="text-xs text-[#1E1B4B]/40">
                              Regenerates and replaces the existing PDF for this story.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Contacts Tab */}
        {tab === "contacts" && (
          <div data-testid="admin-contacts">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-[#1E1B4B]/50">{contacts.length} contact quer(y/ies)</p>
              <Button
                variant="outline"
                onClick={fetchContacts}
                disabled={loadingContacts}
                className="rounded-full border-[#F3E8FF]"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingContacts ? "animate-spin" : ""}`} strokeWidth={2} />
                Refresh
              </Button>
            </div>

            {loadingContacts ? (
              <div className="flex items-center justify-center py-10 text-[#1E1B4B]/40">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Loading contact queries...
              </div>
            ) : contacts.length === 0 ? (
              <p className="text-center py-10 text-[#1E1B4B]/40">No contact queries yet</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((c: any) => (
                  <Card key={c.id} className="rounded-2xl border-2 border-[#F3E8FF]">
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#3730A3]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Mail className="w-4 h-4 text-[#3730A3]" strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1E1B4B]">{c.name || "Unknown"}</p>
                        <p className="text-xs text-[#1E1B4B]/55">{c.email || "-"} · {c.phone_number || "-"}</p>
                        <p className="text-xs text-[#1E1B4B]/40 mt-0.5">{toDisplayDate(c.created_at)}</p>
                        <p className="text-sm text-[#1E1B4B]/80 mt-2 whitespace-pre-wrap break-words">{c.query || "-"}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteContact(c.id)}
                        disabled={deletingContactId === c.id}
                        className="rounded-full border-[#E76F51]/30 text-[#E76F51] hover:bg-[#E76F51]/10 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" strokeWidth={2} />
                        {deletingContactId === c.id ? "Deleting..." : "Delete"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "coupons" && (
          <div data-testid="admin-coupons">
            <Card className="rounded-2xl border-2 border-[#F3E8FF] mb-4">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-[#1E1B4B] mb-3" style={{ fontFamily: "Fredoka" }}>
                  Add Discount Coupon
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px_auto] gap-2">
                  <Input
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value)}
                    placeholder="Coupon code (e.g. SUMMER50)"
                    className="rounded-full border-[#F3E8FF]"
                  />
                  <Input
                    value={couponDiscountInput}
                    onChange={(e) => setCouponDiscountInput(e.target.value)}
                    placeholder="Discount %"
                    type="number"
                    min={1}
                    max={100}
                    step="0.01"
                    className="rounded-full border-[#F3E8FF]"
                  />
                  <Input
                    value={couponUsageInput}
                    onChange={(e) => setCouponUsageInput(e.target.value)}
                    placeholder="Allowed usage"
                    type="number"
                    min={1}
                    className="rounded-full border-[#F3E8FF]"
                  />
                  <Button
                    onClick={handleAddCoupon}
                    disabled={addingCoupon}
                    className="rounded-full bg-[#2A9D8F] hover:bg-[#238f82] text-white"
                  >
                    {addingCoupon ? "Adding…" : "Add Coupon"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-[#1E1B4B]/50">{coupons.length} coupon(s)</p>
              <Button
                variant="outline"
                onClick={fetchCoupons}
                disabled={loadingCoupons}
                className="rounded-full border-[#F3E8FF]"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingCoupons ? "animate-spin" : ""}`} strokeWidth={2} />
                Refresh
              </Button>
            </div>

            {loadingCoupons ? (
              <div className="flex items-center justify-center py-10 text-[#1E1B4B]/40">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Loading coupons…
              </div>
            ) : coupons.length === 0 ? (
              <p className="text-center py-10 text-[#1E1B4B]/40">No coupons configured</p>
            ) : (
              <div className="space-y-2">
                {coupons.map((c: any) => (
                  <Card key={c.id} className="rounded-2xl border-2 border-[#F3E8FF]">
                    <CardContent className="p-4 flex items-center gap-3">
                      <Badge className="bg-[#3730A3]/15 text-[#3730A3] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                        {c.code || c.id}
                      </Badge>
                      <Badge className="bg-[#2A9D8F]/15 text-[#2A9D8F] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                        {Number(c.discount_percent ?? 0)}% off
                      </Badge>
                      <p className="text-sm text-[#1E1B4B]/70">
                        Remaining: <span className="font-semibold text-[#1E1B4B]">{Number(c.remaining_uses ?? 0)}</span>
                      </p>
                      <p className="text-xs text-[#1E1B4B]/40">/ Initial: {Number(c.initial_uses ?? 0)}</p>
                      <span className="flex-1" />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteCoupon(c.id)}
                        disabled={deletingCoupon === c.id}
                        className="rounded-full border-[#E76F51]/30 text-[#E76F51] hover:bg-[#E76F51]/10 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" strokeWidth={2} />
                        {deletingCoupon === c.id ? "Removing…" : "Remove"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Payments Tab */}
        {tab === "payments" && (
          <div data-testid="admin-payments">
            <p className="text-sm text-[#1E1B4B]/50 mb-4">{payments.length} total payments</p>
            <div className="space-y-2">
              {payments.length === 0 ? (
                <p className="text-center py-12 text-[#1E1B4B]/40">No payments yet</p>
              ) : (
                payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-white border-2 border-[#F3E8FF]">
                    <Badge className={`${PAY_STATUS_COLORS[p.status] || ""} rounded-full px-2.5 py-0.5 text-xs font-semibold border-0`}>
                      {p.status}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1E1B4B]">₹{p.amount} — {p.page_count} pages</p>
                      {!!p.discount_amount && (
                        <p className="text-xs text-[#2A9D8F]">
                          Discount: ₹{p.discount_amount}
                          {p.coupon_code ? ` (${p.coupon_code})` : ""}
                          {p.discount_percent ? ` · ${p.discount_percent}%` : ""}
                        </p>
                      )}
                      <p className="text-xs text-[#1E1B4B]/40 font-mono truncate">{p.order_id}</p>
                    </div>
                    <span className="text-xs text-[#1E1B4B]/30">
                      {toDisplayDate(p.created_at)}
                    </span>
                    {p.status === "paid" && (
                      <Button
                        data-testid={`btn-refund-${p.payment_id}`}
                        variant="outline"
                        size="sm"
                        onClick={() => handleRefund(p.payment_id)}
                        className="rounded-full border-[#E76F51]/30 text-[#E76F51] hover:bg-[#E76F51]/10 text-xs h-8"
                      >
                        <Undo2 className="w-3 h-3 mr-1" strokeWidth={2.5} />
                        Refund
                      </Button>
                    )}
                    {p.status === "refunded" && (
                      <span className="text-xs text-[#3730A3] font-medium">Refunded</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Costs Tab */}
        {tab === "costs" && (
          <div data-testid="admin-costs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                  API Cost per User
                </p>
                {costReport && (
                  <p className="text-xs text-[#1E1B4B]/40 mt-0.5">
                    Rate: $1 = ₹{costReport.usdToInr} &nbsp;·&nbsp; Pricing as of {costReport.pricingAsOf}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => { setCostReport(null); fetchCosts(); }}
                disabled={loadingCosts}
                className="rounded-full border-[#F3E8FF]"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingCosts ? "animate-spin" : ""}`} strokeWidth={2} />
                {loadingCosts ? "Loading…" : "Refresh"}
              </Button>
            </div>

            {loadingCosts && !costReport && (
              <div className="flex items-center justify-center py-20 text-[#1E1B4B]/40">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Fetching cost data…
              </div>
            )}

            {!loadingCosts && costReport && costReport.users.length === 0 && (
              <p className="text-center py-12 text-[#1E1B4B]/40">No usage data yet</p>
            )}

            {costReport && costReport.users.length > 0 && (
              <>
                {/* Summary card */}
                <Card className="rounded-2xl border-2 border-[#F3E8FF] mb-5">
                  <CardContent className="p-5 flex flex-wrap gap-6">
                    <div>
                      <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-1">Total Users</p>
                      <p className="text-2xl font-bold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                        {costReport.users.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-1">Total Cost (USD)</p>
                      <p className="text-2xl font-bold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                        ${costReport.users.reduce((s: number, u: any) => s + u.totalCostUsd, 0).toFixed(4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-1">Total Cost (INR)</p>
                      <p className="text-2xl font-bold text-[#FF9F1C]" style={{ fontFamily: "Fredoka" }}>
                        ₹{costReport.users.reduce((s: number, u: any) => s + u.totalCostInr, 0).toFixed(2)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Per-user rows */}
                <div className="space-y-2">
                  {costReport.users.map((u: any) => (
                    <div
                      key={u.userId}
                      className="bg-white rounded-xl border-2 border-[#F3E8FF] overflow-hidden"
                    >
                      <button
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#FDFBF7] transition-colors"
                        onClick={() => setExpandedUser(expandedUser === u.userId ? null : u.userId)}
                      >
                        <div className="w-8 h-8 rounded-full bg-[#F3E8FF] flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-[#3730A3]">
                            {(u.email?.[0] ?? "?").toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1E1B4B] truncate">{u.email}</p>
                          <p className="text-xs text-[#1E1B4B]/40 font-mono truncate">{u.userId.slice(0, 16)}…</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-[#FF9F1C]">₹{u.totalCostInr.toFixed(3)}</p>
                          <p className="text-xs text-[#1E1B4B]/40">${u.totalCostUsd.toFixed(5)}</p>
                        </div>
                        {expandedUser === u.userId
                          ? <ChevronUp className="w-4 h-4 text-[#1E1B4B]/30 flex-shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-[#1E1B4B]/30 flex-shrink-0" />
                        }
                      </button>

                      {expandedUser === u.userId && (
                        <div className="border-t border-[#F3E8FF] px-4 pb-4 pt-3 space-y-2">
                          <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-2">Task Breakdown</p>
                          {Object.entries(u.byTask).map(([task, val]: any) => (
                            <div key={task} className="flex items-center gap-2 text-sm">
                              <Badge className="bg-[#3730A3]/10 text-[#3730A3] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                                {task}
                              </Badge>
                              <span className="text-[#1E1B4B]/50 text-xs">{val.tokens.toLocaleString()} tokens</span>
                              <span className="flex-1" />
                              <span className="text-xs text-[#1E1B4B]/40">${val.costUsd.toFixed(6)}</span>
                              <span className="text-xs font-semibold text-[#FF9F1C]">₹{val.costInr.toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Pricing footnote */}
                <div className="mt-6 p-4 rounded-xl bg-[#F3E8FF]/40 text-xs text-[#1E1B4B]/50 space-y-1">
                  <p className="font-semibold text-[#1E1B4B]/60">Pricing sources</p>
                  <p>
                    Gemini: gemini-2.5-flash $0.30/$2.50 per 1M in/out · avatar gen $0.10/$30.00 per 1M in/out
                  </p>
                  <p>
                    Sarvam: sarvam-30b $0.40/$1.60 per 1M in/out · transliteration $0.005 per 1K chars
                  </p>
                  <p>USD → INR at ₹96 (fixed reference rate)</p>
                </div>
              </>
            )}
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
