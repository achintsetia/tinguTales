import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, getDocs, doc, getDoc, setDoc, query, orderBy } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import {
  ArrowLeft, Trash2, RefreshCw, DollarSign, Users, BookOpen,
  Activity, AlertCircle, CheckCircle, Clock, Sparkles, Undo2, Bot, ChevronDown, ChevronUp
} from "lucide-react";

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  const [togglingPayments, setTogglingPayments] = useState(false);
  const [costReport, setCostReport] = useState<any>(null);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.is_admin) {
      navigate("/dashboard", { replace: true });
      return;
    }
    fetchAll();
  }, [user, navigate]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [storiesSnap, usersSnap, paymentsSnap, settingsSnap] = await Promise.all([
        getDocs(collection(db, "stories")),
        getDocs(collection(db, "user_profile")),
        getDocs(query(collection(db, "payments"), orderBy("created_at", "desc"))),
        getDoc(doc(db, "settings", "public")),
      ]);
      const allStories = storiesSnap.docs.map((d) => d.data());
      const allPayments = paymentsSnap.docs.map((d) => d.data());
      const totalRevenue = allPayments
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      setStats({
        total_users: usersSnap.size,
        total_stories: allStories.length,
        completed_stories: allStories.filter((s) => s.status === "completed").length,
        total_revenue: totalRevenue,
        pending_jobs: 0,
        processing_jobs: 0,
      });
      setJobs([]);
      setPayments(allPayments);
      if (settingsSnap.exists()) {
        setPaymentsEnabled(settingsSnap.data().payments_enabled ?? false);
      }
    } catch (e) {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePayments = async (checked) => {
    setTogglingPayments(true);
    try {
      await setDoc(doc(db, "settings", "public"), { payments_enabled: checked }, { merge: true });
      setPaymentsEnabled(checked);
      toast.success(checked ? "Payments enabled" : "Payments disabled — users can create stories for free");
    } catch (e) {
      toast.error("Failed to update setting");
    } finally {
      setTogglingPayments(false);
    }
  };

  const handleClearStale = async () => {
    toast.info("Job queue management is not available in this version.");
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
    { id: "jobs", label: "Jobs" },
    { id: "payments", label: "Payments" },
    { id: "costs", label: "Costs" },
  ];

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
        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          {TABS.map((t) => (
            <button
              key={t.id}
              data-testid={`admin-tab-${t.id}`}
              onClick={() => {
                setTab(t.id);
                if (t.id === "costs" && !costReport) fetchCosts();
              }}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                tab === t.id
                  ? "bg-[#1E1B4B] text-white"
                  : "bg-white text-[#1E1B4B]/60 border-2 border-[#F3E8FF] hover:border-[#1E1B4B]/20"
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => navigate("/admin/models")}
            className="rounded-full px-5 py-2.5 text-sm font-semibold transition-all bg-white text-[#3730A3]/70 border-2 border-[#F3E8FF] hover:border-[#3730A3]/30 flex items-center gap-1.5"
          >
            <Bot className="w-4 h-4" strokeWidth={2.5} />
            Models
          </button>
        </div>

        {/* Overview Tab */}
        {tab === "overview" && stats && (
          <>
          {/* Payment Toggle */}
          <Card className="rounded-2xl border-2 border-[#F3E8FF] mb-6">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                  Require Payment for Stories
                </p>
                <p className="text-xs text-[#1E1B4B]/50 mt-0.5">
                  {paymentsEnabled
                    ? "Users must pay before generating illustrations"
                    : "Users can create storybooks for free"}
                </p>
              </div>
              <Switch
                data-testid="toggle-payments"
                checked={paymentsEnabled}
                onCheckedChange={handleTogglePayments}
                disabled={togglingPayments}
              />
            </CardContent>
          </Card>

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

        {/* Jobs Tab */}
        {tab === "jobs" && (
          <div data-testid="admin-jobs">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-[#1E1B4B]/50">{jobs.length} total jobs</p>
              <Button
                data-testid="btn-clear-stale"
                onClick={handleClearStale}
                variant="outline"
                className="rounded-full border-[#E76F51]/30 text-[#E76F51] hover:bg-[#E76F51]/10"
              >
                <Trash2 className="w-4 h-4 mr-2" strokeWidth={2} />
                Clear All Stale Jobs
              </Button>
            </div>
            <div className="space-y-2">
              {jobs.length === 0 ? (
                <p className="text-center py-12 text-[#1E1B4B]/40">No jobs</p>
              ) : (
                jobs.map((job, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white border-2 border-[#F3E8FF]">
                    <Badge className={`${JOB_STATUS_COLORS[job.status] || ""} rounded-full px-2.5 py-0.5 text-xs font-semibold border-0`}>
                      {job.status}
                    </Badge>
                    <span className="text-sm text-[#1E1B4B] font-mono">{job.payload?.story_id?.slice(0, 20)}</span>
                    <span className="text-xs text-[#1E1B4B]/40">{job.job_type}</span>
                    <span className="flex-1" />
                    <span className="text-xs text-[#1E1B4B]/30">
                      {job.created_at ? new Date(job.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : ""}
                    </span>
                  </div>
                ))
              )}
            </div>
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
                      <p className="text-xs text-[#1E1B4B]/40 font-mono truncate">{p.order_id}</p>
                    </div>
                    <span className="text-xs text-[#1E1B4B]/30">
                      {p.created_at ? new Date(p.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : ""}
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
                  <p>USD → INR at ₹83.5 (fixed reference rate)</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
