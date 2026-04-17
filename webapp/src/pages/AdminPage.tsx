import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "../context/AuthContext";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import {
  ArrowLeft, Trash2, RefreshCw, DollarSign, Users, BookOpen,
  Activity, AlertCircle, CheckCircle, Clock, Sparkles, Undo2
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
      const [statsRes, jobsRes, paymentsRes, settingsRes] = await Promise.all([
        axios.get(`${API}/admin/stats`),
        axios.get(`${API}/admin/jobs`),
        axios.get(`${API}/admin/payments`),
        axios.get(`${API}/settings/public`),
      ]);
      setStats(statsRes.data);
      setJobs(jobsRes.data);
      setPayments(paymentsRes.data);
      setPaymentsEnabled(settingsRes.data.payments_enabled);
    } catch (e) {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePayments = async (checked) => {
    setTogglingPayments(true);
    try {
      await axios.put(`${API}/admin/settings`, { payments_enabled: checked });
      setPaymentsEnabled(checked);
      toast.success(checked ? "Payments enabled" : "Payments disabled — users can create stories for free");
    } catch (e) {
      toast.error("Failed to update setting");
    } finally {
      setTogglingPayments(false);
    }
  };

  const handleClearStale = async () => {
    try {
      const res = await axios.delete(`${API}/admin/jobs/stale`);
      toast.success(`Cleared ${res.data.deleted_jobs} jobs, failed ${res.data.stuck_stories_failed} stuck stories`);
      fetchAll();
    } catch (e) {
      toast.error("Failed to clear stale jobs");
    }
  };

  const handleRefund = async (paymentId) => {
    if (!window.confirm(`Refund payment ${paymentId}?`)) return;
    try {
      await axios.post(`${API}/admin/refund`, { payment_id: paymentId });
      toast.success("Refund initiated");
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Refund failed");
    }
  };

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "jobs", label: "Jobs" },
    { id: "payments", label: "Payments" },
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
              onClick={() => setTab(t.id)}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                tab === t.id
                  ? "bg-[#1E1B4B] text-white"
                  : "bg-white text-[#1E1B4B]/60 border-2 border-[#F3E8FF] hover:border-[#1E1B4B]/20"
              }`}
            >
              {t.label}
            </button>
          ))}
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
      </div>
    </div>
  );
}
