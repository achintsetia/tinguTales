import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";
import { collection, query, where, onSnapshot, getDoc, getDocs, deleteDoc, doc as firestoreDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "../components/ui/dropdown-menu";
import {
  BookOpen, Plus, LogOut, Sparkles, Clock, CheckCircle,
  AlertCircle, Trash2, User, ChevronDown,
  Shield, Receipt, Upload, CreditCard, ShieldCheck,
  FileText, Play, RefreshCw
} from "lucide-react";

const STATUS_MAP = {
  generating: { label: "Generating...", color: "bg-[#FF9F1C]/15 text-[#FF9F1C]", icon: Clock },
  understanding_input: { label: "Understanding...", color: "bg-[#FF9F1C]/15 text-[#FF9F1C]", icon: Clock },
  planning_story: { label: "Planning...", color: "bg-[#FF9F1C]/15 text-[#FF9F1C]", icon: Clock },
  writing_story: { label: "Writing...", color: "bg-[#3730A3]/15 text-[#3730A3]", icon: Clock },
  quality_check: { label: "Checking...", color: "bg-[#2A9D8F]/15 text-[#2A9D8F]", icon: Clock },
  creating_scenes: { label: "Illustrating...", color: "bg-[#E76F51]/15 text-[#E76F51]", icon: Clock },
  generating_images: { label: "Drawing...", color: "bg-[#FF9F1C]/15 text-[#FF9F1C]", icon: Sparkles },
  completed: { label: "Ready", color: "bg-[#2A9D8F]/15 text-[#2A9D8F]", icon: CheckCircle },
  failed: { label: "Failed", color: "bg-[#E76F51]/15 text-[#E76F51]", icon: AlertCircle },
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("stories");
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const profilesSubscribedRef = useRef(false);

  // Storage-scanned uploads
  const [uploads, setUploads] = useState<{path: string; filename: string; downloadUrl: string; updatedAt: string}[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [deletingUpload, setDeletingUpload] = useState<string | null>(null);
  const [pendingDeleteUpload, setPendingDeleteUpload] = useState<{path: string; filename: string} | null>(null);
  const [pendingDeleteStory, setPendingDeleteStory] = useState<{storyId: string; title: string} | null>(null);
  const [deletingStory, setDeletingStory] = useState(false);
  const [exporting] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);

  const fetchStories = () => {}; // replaced by Firestore onSnapshot below

  const fetchPayments = async () => {
    if (payments.length > 0) return;
    setLoadingPayments(true);
    try {
      const q = query(collection(db, "payments"), where("user_id", "==", user?.id));
      const snap = await getDocs(q);
      const list = snap.docs
        .map((d) => d.data())
        .sort((a, b) => {
          const ta = a.created_at?.toMillis?.() ?? new Date(a.created_at ?? 0).getTime();
          const tb = b.created_at?.toMillis?.() ?? new Date(b.created_at ?? 0).getTime();
          return tb - ta;
        });
      setPayments(list);
    } catch (e) {
      console.error("Failed to fetch payments:", e);
    } finally {
      setLoadingPayments(false);
    }
  };

  // Subscribe to child profiles (for selecting in story wizard)
  useEffect(() => {
    if (!user?.id || profilesSubscribedRef.current) return;
    profilesSubscribedRef.current = true;
    const q = query(collection(db, "child_profiles"), where("user_id", "==", user.id));
    const unsub = onSnapshot(q, (snap) => {
      setProfiles(snap.docs.map((d) => d.data()));
      setLoadingProfiles(false);
    }, () => setLoadingProfiles(false));
    return () => unsub();
  }, [user?.id]);

  const openCreateWizard = () => {
    localStorage.removeItem("tingu_wizard_state");
    navigate("/create");
  };

  const fetchUploads = useCallback(async () => {
    setLoadingUploads(true);
    try {
      const fn = httpsCallable<unknown, {uploads: typeof uploads}>(functions, "getUserUploads");
      const result = await fn({});
      setUploads(result.data.uploads);
    } catch (e) {
      console.error("Failed to fetch uploads:", e);
      toast.error("Could not load uploads");
    } finally {
      setLoadingUploads(false);
    }
  }, []);

  const confirmDeleteStorageUpload = async () => {
    if (!pendingDeleteUpload) return;
    const { path } = pendingDeleteUpload;
    setPendingDeleteUpload(null);
    setDeletingUpload(path);
    try {
      const fn = httpsCallable(functions, "deleteUserUpload");
      await fn({ path });
      setUploads((prev) => prev.filter((u) => u.path !== path));
      toast.success("Upload deleted");
    } catch (e) {
      console.error("Delete upload failed:", e);
      toast.error("Failed to delete upload");
    } finally {
      setDeletingUpload(null);
    }
  };

  const handleDeleteStorageUpload = (path: string, filename: string) => {
    setPendingDeleteUpload({ path, filename });
  };

  // Subscribe to stories from Firestore
  useEffect(() => {
    if (!user?.id) return;
    const q = query(collection(db, "stories"), where("user_id", "==", user.id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs
          .map((d) => ({ ...d.data(), story_id: d.id }))
          .sort((a: any, b: any) => {
            const ta = a.created_at?.toMillis?.() ?? new Date(a.created_at ?? 0).getTime();
            const tb = b.created_at?.toMillis?.() ?? new Date(b.created_at ?? 0).getTime();
            return tb - ta;
          });
        setStories(all);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user?.id]);

  const DRAFT_STATUSES = ["drafting", "draft_ready", "draft_failed"];

  const visibleStories = stories.filter((s) => !DRAFT_STATUSES.includes(s.status));

  const draftStories = stories.filter((s) => DRAFT_STATUSES.includes(s.status));

  const handleDelete = async (storyId: string) => {
    setDeletingStory(true);
    try {
      const deleteFn = httpsCallable(functions, "deleteStory");
      await deleteFn({ storyId });
      toast.success("Story deleted");
      setPendingDeleteStory(null);
    } catch {
      toast.error("Failed to delete story");
    } finally {
      setDeletingStory(false);
    }
  };

  const handleDeleteDraft = async (storyId: string) => {
    try {
      await deleteDoc(firestoreDoc(db, "stories", storyId));
      toast.success("Draft deleted");
      try {
        const raw = localStorage.getItem("tingu_wizard_state");
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.draftStoryId === storyId) localStorage.removeItem("tingu_wizard_state");
        }
      } catch { /* ignore */ }
    } catch {
      toast.error("Failed to delete draft");
    }
  };

  // isRetry=true: delete the failed doc and re-open wizard at step 4 so it regenerates
  const handleResumeDraft = async (storyId: string, isRetry = false) => {
    try {
      const snap = await getDoc(firestoreDoc(db, "stories", storyId));
      if (!snap.exists()) { toast.error("Draft not found"); return; }
      const data = snap.data();
      if (isRetry) {
        await deleteDoc(firestoreDoc(db, "stories", storyId)).catch(() => {});
      }
      const wizardState = {
        step: isRetry ? 4 : 5,
        profileId: data.profile_id || null,
        langCode: data.language_code || "en",
        interests: data.interests || [],
        pageCount: data.page_count || 8,
        customIncident: data.custom_incident || "",
        nativeChildName: "",
        draftStoryId: isRetry ? null : storyId,
        draftTitle: isRetry ? "" : (data.title || ""),
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem("tingu_wizard_state", JSON.stringify(wizardState));
      navigate("/create");
    } catch {
      toast.error("Could not load draft");
    }
  };

  const handleExport = async () => {
    toast.info("Export is not available in this version.");
  };

  const handleImport = async (_e) => {
    toast.info("Import is not available in this version.");
  };

  const handleDeleteProfile = async (e: React.MouseEvent, profileId: string, photoUrl: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this child profile and its avatar?")) return;
    try {
      if (photoUrl) {
        const fn = httpsCallable(functions, "deleteUserUpload");
        try { await fn({ path: photoUrl }); } catch { /* ignore if already gone */ }
      }
      const { deleteDoc, doc: firestoreDoc } = await import("firebase/firestore");
      await deleteDoc(firestoreDoc(db, "child_profiles", profileId));
      toast.success("Profile deleted");
    } catch {
      toast.error("Failed to delete profile");
    }
  };

  const getStatusInfo = (status) => STATUS_MAP[status] || STATUS_MAP.generating;

  const activeStories = visibleStories.filter((s) => s.status !== "failed");

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Header */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FDFBF7]/80 border-b border-[#F3E8FF]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/dashboard")}>
            <img src="/favicon.png" alt="Tingu Tales" className="w-9 h-9" />
            <span className="text-2xl font-semibold tracking-tight text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
              Tingu <span className="text-[#FF9F1C]">Tales</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="btn-profile-menu"
                  className="flex items-center gap-2 rounded-full px-3 py-2 hover:bg-[#F3E8FF] transition-colors"
                >
                  {user?.picture ? (
                    <img src={user.picture} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#3730A3]/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-[#3730A3]" strokeWidth={2.5} />
                    </div>
                  )}
                  <span className="text-sm text-[#1E1B4B] font-medium hidden sm:block">{user?.name}</span>
                  <ChevronDown className="w-4 h-4 text-[#1E1B4B]/40" strokeWidth={2} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl border-2 border-[#F3E8FF] p-1">
                <div className="px-3 py-2 text-xs text-[#1E1B4B]/40 font-medium">
                  {user?.email}
                </div>
                <DropdownMenuSeparator className="bg-[#F3E8FF]" />
                {user?.is_admin && (
                  <DropdownMenuItem
                    data-testid="btn-admin-panel"
                    onClick={() => navigate("/admin")}
                    className="rounded-xl cursor-pointer gap-2 py-2.5 text-[#1E1B4B] focus:bg-[#FF9F1C]/10 focus:text-[#1E1B4B]"
                  >
                    <Shield className="w-4 h-4 text-[#E76F51]" strokeWidth={2} />
                    Admin Panel
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-[#F3E8FF]" />
                <DropdownMenuItem
                  data-testid="btn-logout"
                  onClick={logout}
                  className="rounded-xl cursor-pointer gap-2 py-2.5 text-[#E76F51] focus:bg-[#E76F51]/10 focus:text-[#E76F51]"
                >
                  <LogOut className="w-4 h-4" strokeWidth={2} />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Welcome + CTA */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1
              className="text-4xl sm:text-5xl tracking-tight font-semibold text-[#1E1B4B] mb-2"
              style={{ fontFamily: "Fredoka" }}
              data-testid="dashboard-heading"
            >
              My Stories
            </h1>
            <p className="text-[#1E1B4B]/60">
              {stories.length === 0
                ? "Create your first magical storybook!"
                : `${activeStories.length} storybook${activeStories.length !== 1 ? "s" : ""} created${draftStories.length > 0 ? ` · ${draftStories.length} draft${draftStories.length !== 1 ? "s" : ""}` : ""}`}
            </p>
          </div>
          <Button
            data-testid="btn-create-story"
            onClick={openCreateWizard}
            className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold px-8 min-h-[56px] text-lg shadow-lg hover:shadow-xl transition-all"
          >
            <Plus className="w-5 h-5 mr-2" strokeWidth={2.5} />
            New Story
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-[#F3E8FF] pb-0">
          {[
            { id: "stories", label: "My Stories", icon: BookOpen },
            { id: "payments", label: "Payments", icon: CreditCard },
            { id: "uploads", label: "My Uploads", icon: Upload },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id);
                if (id === "payments") fetchPayments();
                if (id === "uploads") fetchUploads();
              }}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px ${
                activeTab === id
                  ? "border-[#FF9F1C] text-[#1E1B4B]"
                  : "border-transparent text-[#1E1B4B]/40 hover:text-[#1E1B4B]/70"
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={2.5} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Stories Tab ── */}
        {activeTab === "stories" && (
          loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-3xl border-2 border-[#F3E8FF] overflow-hidden animate-shimmer">
                  <div className="aspect-[3/4] bg-[#F3E8FF]/50" />
                  <div className="p-6"><div className="h-5 bg-[#F3E8FF] rounded-full w-3/4 mb-3" /><div className="h-4 bg-[#F3E8FF] rounded-full w-1/2" /></div>
                </div>
              ))}
            </div>
          ) : (draftStories.length === 0 && visibleStories.length === 0) ? (
            <div className="text-center py-24">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[#FF9F1C]/10 flex items-center justify-center animate-float">
                <BookOpen className="w-12 h-12 text-[#FF9F1C]" strokeWidth={2} />
              </div>
              <h3 className="text-xl sm:text-2xl font-medium text-[#1E1B4B] mb-3" style={{ fontFamily: "Fredoka" }}>
                No stories yet
              </h3>
              <p className="text-[#1E1B4B]/60 mb-8 max-w-sm mx-auto">
                Create a personalized storybook for your child in their favorite language.
              </p>
              <Button
                data-testid="btn-create-story-empty"
                onClick={openCreateWizard}
                className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold px-8 min-h-[56px] text-lg"
              >
                <Sparkles className="w-5 h-5 mr-2" strokeWidth={2.5} />
                Create First Story
              </Button>
            </div>
          ) : (
            <>
              {/* ── Published / in-progress stories ── */}
              {visibleStories.length > 0 && (
                <div className="mb-10">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {visibleStories.map((story) => {
                      const statusInfo = getStatusInfo(story.status);
                      const StatusIcon = statusInfo.icon;
                      const isActive = story.status !== "completed" && story.status !== "failed";
                      return (
                        <Card
                          key={story.story_id}
                          data-testid={`story-card-${story.story_id}`}
                          className="rounded-2xl border-2 border-[#F3E8FF] overflow-hidden card-hover cursor-pointer group"
                          onClick={() => navigate(`/story/${story.story_id}`)}
                        >
                          <div className="aspect-[3/4] bg-gradient-to-br from-[#3730A3]/10 to-[#FF9F1C]/10 relative overflow-hidden">
                            {story.cover_image_url ? (
                              <img
                                src={story.cover_image_url}
                                alt={story.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                {isActive ? (
                                  <div className="text-center">
                                    <Sparkles className="w-8 h-8 text-[#FF9F1C] mx-auto mb-1 animate-float" strokeWidth={2} />
                                    <p className="text-xs text-[#1E1B4B]/50">Creating...</p>
                                  </div>
                                ) : (
                                  <BookOpen className="w-10 h-10 text-[#F3E8FF]" strokeWidth={1.5} />
                                )}
                              </div>
                            )}
                            <div className="absolute top-2 right-2">
                              <Badge variant="default" className={`${statusInfo.color} rounded-full px-2 py-0.5 text-[10px] font-semibold border-0`}>
                                <StatusIcon className="w-2.5 h-2.5 mr-1" strokeWidth={2.5} />
                                {statusInfo.label}
                              </Badge>
                            </div>
                          </div>
                          <CardContent className="p-3">
                            <h3 className="font-native text-sm font-medium text-[#1E1B4B] truncate" style={{ fontFamily: "Fredoka" }}>
                              {story.title || "Untitled Story"}
                            </h3>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-xs text-[#1E1B4B]/40 truncate">{story.child_name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`btn-delete-story-${story.story_id}`}
                                onClick={(e) => { e.stopPropagation(); setPendingDeleteStory({ storyId: story.story_id, title: story.title || "Untitled Story" }); }}
                                className="rounded-full text-[#1E1B4B]/30 hover:text-[#E76F51] hover:bg-[#E76F51]/10 h-7 w-7 p-0 flex-shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                              </Button>
                            </div>
                            {(story.language || story.created_at) && (
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {story.language && (
                                  <span className="text-[10px] text-[#3730A3]/60 bg-[#3730A3]/8 rounded-full px-2 py-0.5 truncate max-w-[90px]">
                                    {story.language}
                                  </span>
                                )}
                                {story.created_at && (
                                  <span className="text-[10px] text-[#1E1B4B]/35 flex items-center gap-0.5">
                                    <Clock className="w-2.5 h-2.5" strokeWidth={2} />
                                    {(() => {
                                      const d = story.created_at?.toDate?.() ?? new Date(story.created_at);
                                      return isNaN(d.getTime()) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
                                    })()}
                                  </span>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Draft stories ── */}
              {draftStories.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-base font-semibold text-[#1E1B4B] mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#FF9F1C]" strokeWidth={2.5} />
                    Drafts
                    <span className="text-xs font-normal text-[#1E1B4B]/40">{draftStories.length}</span>
                  </h2>
                  <div className="space-y-3">
                    {draftStories.map((story) => {
                      const isGenerating = story.status === "drafting";
                      const isReady = story.status === "draft_ready";
                      const isFailed = story.status === "draft_failed";
                      return (
                        <div
                          key={story.story_id}
                          className="flex items-center gap-4 p-4 rounded-2xl bg-white border-2 border-dashed border-[#FF9F1C]/30"
                        >
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isFailed ? "bg-[#E76F51]/10" : "bg-[#FF9F1C]/10"
                          }`}>
                            {isGenerating && <Sparkles className="w-5 h-5 text-[#FF9F1C] animate-float" strokeWidth={2} />}
                            {isReady && <FileText className="w-5 h-5 text-[#FF9F1C]" strokeWidth={2} />}
                            {isFailed && <AlertCircle className="w-5 h-5 text-[#E76F51]" strokeWidth={2} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[#1E1B4B] truncate text-sm" style={{ fontFamily: "Fredoka" }}>
                              {story.title || "Draft Story"}
                            </p>
                            <p className="text-xs text-[#1E1B4B]/50 mt-0.5">
                              {story.child_name} · {story.language}
                            </p>
                            <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isReady ? "bg-[#2A9D8F]/15 text-[#2A9D8F]" :
                              isFailed ? "bg-[#E76F51]/15 text-[#E76F51]" :
                              "bg-[#FF9F1C]/15 text-[#FF9F1C]"
                            }`}>
                              {isGenerating ? "Generating..." : isReady ? "Ready to Review" : "Failed"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isReady && (
                              <Button
                                size="sm"
                                onClick={() => handleResumeDraft(story.story_id)}
                                className="rounded-full bg-[#3730A3] hover:bg-[#2d2888] text-white text-xs font-bold h-8 px-3 gap-1.5"
                              >
                                <Play className="w-3 h-3 fill-white" strokeWidth={0} />
                                Resume
                              </Button>
                            )}
                            {isFailed && (
                              <Button
                                size="sm"
                                onClick={() => handleResumeDraft(story.story_id, true)}
                                className="rounded-full bg-[#E76F51]/10 hover:bg-[#E76F51]/20 text-[#E76F51] text-xs font-bold h-8 px-3 gap-1.5"
                              >
                                <RefreshCw className="w-3 h-3" strokeWidth={2.5} />
                                Retry
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDraft(story.story_id)}
                              className="rounded-full text-[#1E1B4B]/30 hover:text-[#E76F51] hover:bg-[#E76F51]/10 h-8 w-8 p-0"
                            >
                              <Trash2 className="w-4 h-4" strokeWidth={2} />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </>
          )
        )}

        {/* ── Payments Tab ── */}
        {activeTab === "payments" && (
          loadingPayments ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-[#F3E8FF]/50 animate-shimmer" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-16">
              <Receipt className="w-12 h-12 text-[#F3E8FF] mx-auto mb-4" strokeWidth={1.5} />
              <h3 className="text-lg font-medium text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>No payments yet</h3>
              <p className="text-sm text-[#1E1B4B]/50 mt-1">Your payment history will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payments.map((p, i) => {
                const PAY_STATUS: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
                  created: { bg: "bg-[#FF9F1C]/15", text: "text-[#FF9F1C]", icon: Clock },
                  paid:    { bg: "bg-[#2A9D8F]/15", text: "text-[#2A9D8F]", icon: CheckCircle },
                  failed:  { bg: "bg-[#E76F51]/15", text: "text-[#E76F51]", icon: AlertCircle },
                  refunded:{ bg: "bg-[#3730A3]/15", text: "text-[#3730A3]", icon: Receipt },
                };
                const s = PAY_STATUS[p.status] || PAY_STATUS.created;
                const SIcon = s.icon;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-4 p-5 rounded-2xl bg-white border-2 border-[#F3E8FF]"
                  >
                    <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                      <SIcon className={`w-5 h-5 ${s.text}`} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>₹{p.amount}</p>
                        <Badge variant="default" className={`${s.bg} ${s.text} rounded-full px-2 py-0.5 text-[10px] font-bold border-0 uppercase`}>
                          {p.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-[#1E1B4B]/50">
                        {p.page_count} pages
                        {p.story_id && (
                          <button
                            onClick={() => navigate(`/story/${p.story_id}`)}
                            className="ml-2 text-[#3730A3] hover:text-[#FF9F1C] underline"
                          >
                            View Story
                          </button>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-[#1E1B4B]/40">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}
                      </p>
                      <p className="text-[10px] text-[#1E1B4B]/25 font-mono mt-0.5">{p.order_id?.slice(0, 20)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── My Uploads Tab ── */}
        {activeTab === "uploads" && (
          loadingUploads ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="aspect-square rounded-2xl bg-[#F3E8FF]/50 animate-shimmer" />
              ))}
            </div>
          ) : uploads.length === 0 ? (
            <div className="text-center py-16">
              <Upload className="w-12 h-12 text-[#F3E8FF] mx-auto mb-4" strokeWidth={1.5} />
              <h3 className="text-lg font-medium text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>No uploads yet</h3>
              <p className="text-sm text-[#1E1B4B]/50 mt-1">Photos you upload when creating a child profile will appear here</p>
              <Button
                onClick={openCreateWizard}
                className="mt-6 rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold"
              >
                <Plus className="w-4 h-4 mr-1.5" strokeWidth={2.5} />
                Create Profile
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#1E1B4B]/50 mb-4">{uploads.length} photo{uploads.length !== 1 ? "s" : ""} in your storage</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {uploads.map((u) => {
                  const isDeleting = deletingUpload === u.path;
                  return (
                    <div key={u.path} className="relative group rounded-2xl overflow-hidden border-2 border-[#F3E8FF] bg-[#F3E8FF]/30 aspect-square">
                      <img
                        src={u.downloadUrl}
                        alt={u.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />

                      {/* Overlay on hover */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 rounded-2xl" />

                      {/* Filename — bottom */}
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                        <p className="text-white text-[10px] font-medium truncate">{u.filename}</p>
                      </div>

                      {/* Delete button — top-right, shown on hover */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                          disabled={isDeleting}
                          onClick={() => handleDeleteStorageUpload(u.path, u.filename)}
                          className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow text-[#E76F51] hover:bg-white transition-colors disabled:opacity-50"
                          title="Delete photo"
                        >
                          {isDeleting ? (
                            <Sparkles className="w-4 h-4 animate-spin" strokeWidth={2} />
                          ) : (
                            <Trash2 className="w-4 h-4" strokeWidth={2} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )
        )}
      </div>

      {/* ── Delete Story Confirmation Modal ── */}
      <Dialog open={!!pendingDeleteStory} onOpenChange={(open) => { if (!open && !deletingStory) setPendingDeleteStory(null); }}>
        <DialogContent className="rounded-3xl border-2 border-[#F3E8FF] max-w-sm p-0 overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-[#E76F51] via-[#FF9F1C] to-[#3730A3]" />
          <div className="px-6 pt-5 pb-6">
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-2xl bg-[#E76F51]/10 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-[#E76F51]" strokeWidth={2} />
                </div>
                <DialogTitle className="text-lg text-[#1E1B4B] leading-tight" style={{ fontFamily: "Fredoka" }}>
                  Delete this story?
                </DialogTitle>
              </div>
              {pendingDeleteStory && (
                <p className="text-sm text-[#1E1B4B]/50 pl-1 truncate">"{pendingDeleteStory.title}"</p>
              )}
            </DialogHeader>
            <p className="text-sm text-[#1E1B4B]/60 leading-relaxed mb-5">
              This will permanently delete the storybook, all its illustrations, and the PDF. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingDeleteStory(null)}
                disabled={deletingStory}
                className="flex-1 rounded-2xl border-2 border-[#F3E8FF] py-2.5 text-sm font-semibold text-[#1E1B4B]/60 hover:bg-[#F3E8FF]/50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => pendingDeleteStory && handleDelete(pendingDeleteStory.storyId)}
                disabled={deletingStory}
                className="flex-1 rounded-2xl bg-[#E76F51] hover:bg-[#d4623f] py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-60"
              >
                {deletingStory ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Upload Confirmation Modal ── */}
      <Dialog open={!!pendingDeleteUpload} onOpenChange={(open) => { if (!open) setPendingDeleteUpload(null); }}>
        <DialogContent className="rounded-3xl border-2 border-[#F3E8FF] max-w-sm p-0 overflow-hidden">
          {/* Top accent bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-[#3730A3] via-[#2A9D8F] to-[#FF9F1C]" />

          <div className="px-6 pt-5 pb-6">
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-2xl bg-[#E76F51]/10 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-[#E76F51]" strokeWidth={2} />
                </div>
                <DialogTitle className="text-lg text-[#1E1B4B] leading-tight" style={{ fontFamily: "Fredoka" }}>
                  Delete this photo?
                </DialogTitle>
              </div>
              {pendingDeleteUpload && (
                <p className="text-xs text-[#1E1B4B]/40 font-mono truncate pl-1">{pendingDeleteUpload.filename}</p>
              )}
            </DialogHeader>

            {/* Privacy notice */}
            <div className="rounded-2xl bg-[#2A9D8F]/8 border border-[#2A9D8F]/20 p-4 mb-5">
              <div className="flex gap-3">
                <ShieldCheck className="w-5 h-5 text-[#2A9D8F] flex-shrink-0 mt-0.5" strokeWidth={2} />
                <div>
                  <p className="text-sm font-semibold text-[#2A9D8F] mb-1">Your child's privacy matters</p>
                  <p className="text-xs text-[#1E1B4B]/60 leading-relaxed">
                    We never share or use children's photos beyond generating their avatar.
                    Even if you don't delete this photo,{" "}
                    <span className="font-semibold text-[#1E1B4B]/80">
                      we automatically delete all uploaded photos within 30 days
                    </span>{" "}
                    of upload.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setPendingDeleteUpload(null)}
                className="flex-1 rounded-2xl border-2 border-[#F3E8FF] py-2.5 text-sm font-semibold text-[#1E1B4B]/60 hover:bg-[#F3E8FF]/50 transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={confirmDeleteStorageUpload}
                className="flex-1 rounded-2xl bg-[#E76F51] hover:bg-[#d4623f] py-2.5 text-sm font-bold text-white transition-colors"
              >
                Delete now
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
