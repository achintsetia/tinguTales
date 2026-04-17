import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "../context/AuthContext";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "../components/ui/dropdown-menu";
import {
  BookOpen, Plus, LogOut, Sparkles, Clock, CheckCircle,
  AlertCircle, Trash2, User, ChevronDown,
  Shield, Receipt
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

  const fetchStories = async () => {
    try {
      const res = await axios.get(`${API}/stories`);
      setStories(res.data);
    } catch (e) {
      console.error("Failed to fetch stories:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  const DRAFT_STATUSES = ["drafting", "draft_ready", "draft_failed"];

  useEffect(() => {
    const hasActive = stories.some(
      (s) => !DRAFT_STATUSES.includes(s.status) && s.status !== "completed" && s.status !== "failed"
    );
    if (!hasActive) return;
    const interval = setInterval(fetchStories, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories]);

  const visibleStories = stories.filter((s) => !DRAFT_STATUSES.includes(s.status));

  const handleDelete = async (storyId) => {
    try {
      await axios.delete(`${API}/stories/${storyId}`);
      toast.success("Story deleted");
      setStories((prev) => prev.filter((s) => s.story_id !== storyId));
    } catch {
      toast.error("Failed to delete story");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    toast.info("Preparing export... This may take a moment.");
    try {
      const response = await axios.get(`${API}/export`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      const name = user?.name?.replace(/\s+/g, "_") || "user";
      a.download = `tingu_tales_${name}_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded!");
    } catch (e) {
      toast.error("Export failed");
      console.error("Export error:", e);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".zip")) {
      toast.error("Please select a .zip file");
      return;
    }
    setImporting(true);
    toast.info("Importing data...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API}/import`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const imp = res.data.imported;
      toast.success(`Imported ${imp.profiles} profiles, ${imp.stories} stories, ${imp.files} files`);
      fetchStories();
    } catch (e) {
      toast.error("Import failed");
      console.error("Import error:", e);
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
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
            <img src="/logo-icon.svg" alt="Tingu Tales" className="w-9 h-9" />
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
                <DropdownMenuItem
                  data-testid="btn-payment-history"
                  onClick={() => navigate("/payments")}
                  className="rounded-xl cursor-pointer gap-2 py-2.5 text-[#1E1B4B] focus:bg-[#FF9F1C]/10 focus:text-[#1E1B4B]"
                >
                  <Receipt className="w-4 h-4 text-[#FF9F1C]" strokeWidth={2} />
                  Payment History
                </DropdownMenuItem>
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-12 gap-4">
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
                : `${activeStories.length} storybook${activeStories.length !== 1 ? "s" : ""} created`}
            </p>
          </div>
          <Button
            data-testid="btn-create-story"
            onClick={() => {
              localStorage.removeItem("tingu_wizard_state");
              navigate("/create");
            }}
            className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold px-8 min-h-[56px] text-lg shadow-lg hover:shadow-xl transition-all"
          >
            <Plus className="w-5 h-5 mr-2" strokeWidth={2.5} />
            New Story
          </Button>
        </div>

        {/* Stories Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="rounded-3xl border-2 border-[#F3E8FF] overflow-hidden animate-shimmer">
                <div className="aspect-[3/4] bg-[#F3E8FF]/50" />
                <CardContent className="p-6">
                  <div className="h-5 bg-[#F3E8FF] rounded-full w-3/4 mb-3" />
                  <div className="h-4 bg-[#F3E8FF] rounded-full w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : stories.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[#FF9F1C]/10 flex items-center justify-center animate-float">
              <BookOpen className="w-12 h-12 text-[#FF9F1C]" strokeWidth={2} />
            </div>
            <h3
              className="text-xl sm:text-2xl font-medium text-[#1E1B4B] mb-3"
              style={{ fontFamily: "Fredoka" }}
            >
              No stories yet
            </h3>
            <p className="text-[#1E1B4B]/60 mb-8 max-w-sm mx-auto">
              Create a personalized storybook for your child in their favorite language.
            </p>
            <Button
              data-testid="btn-create-story-empty"
              onClick={() => {
                localStorage.removeItem("tingu_wizard_state");
                navigate("/create");
              }}
              className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold px-8 min-h-[56px] text-lg"
            >
              <Sparkles className="w-5 h-5 mr-2" strokeWidth={2.5} />
              Create First Story
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleStories.map((story) => {
              const statusInfo = getStatusInfo(story.status);
              const StatusIcon = statusInfo.icon;
              const isActive = story.status !== "completed" && story.status !== "failed";
              return (
                <Card
                  key={story.story_id}
                  data-testid={`story-card-${story.story_id}`}
                  className="rounded-3xl border-2 border-[#F3E8FF] overflow-hidden card-hover cursor-pointer group"
                  onClick={() => navigate(`/story/${story.story_id}`)}
                >
                  {/* Cover Image */}
                  <div className="aspect-[3/4] bg-gradient-to-br from-[#3730A3]/10 to-[#FF9F1C]/10 relative overflow-hidden">
                    {story.cover_image_url ? (
                      <img
                        src={`${API}/files/${story.cover_image_url}`}
                        alt={story.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {isActive ? (
                          <div className="text-center">
                            <Sparkles className="w-10 h-10 text-[#FF9F1C] mx-auto mb-2 animate-float" strokeWidth={2} />
                            <p className="text-sm text-[#1E1B4B]/50">Creating magic...</p>
                          </div>
                        ) : (
                          <BookOpen className="w-16 h-16 text-[#F3E8FF]" strokeWidth={1.5} />
                        )}
                      </div>
                    )}
                    {/* Status Badge */}
                    <div className="absolute top-3 right-3">
                      <Badge className={`${statusInfo.color} rounded-full px-3 py-1 text-xs font-semibold border-0`}>
                        <StatusIcon className="w-3 h-3 mr-1" strokeWidth={2.5} />
                        {statusInfo.label}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-6">
                    <h3
                      className="font-native text-lg font-medium text-[#1E1B4B] mb-1 truncate"
                      style={{ fontFamily: "Fredoka" }}
                    >
                      {story.title || "Untitled Story"}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-[#1E1B4B]/50">
                      <span>{story.child_name}</span>
                      <span>&#183;</span>
                      <span>{story.language}</span>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-xs text-[#1E1B4B]/40">
                        {new Date(story.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`btn-delete-story-${story.story_id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(story.story_id);
                        }}
                        className="rounded-full text-[#1E1B4B]/30 hover:text-[#E76F51] hover:bg-[#E76F51]/10 h-8 w-8 p-0"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={2} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
