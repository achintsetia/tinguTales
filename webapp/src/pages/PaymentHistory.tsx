import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "../context/AuthContext";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ArrowLeft, Receipt, CheckCircle, Clock, AlertCircle, Undo2 } from "lucide-react";

const STATUS_COLORS = {
  created: { bg: "bg-[#FF9F1C]/15", text: "text-[#FF9F1C]", icon: Clock },
  paid: { bg: "bg-[#2A9D8F]/15", text: "text-[#2A9D8F]", icon: CheckCircle },
  failed: { bg: "bg-[#E76F51]/15", text: "text-[#E76F51]", icon: AlertCircle },
  refunded: { bg: "bg-[#3730A3]/15", text: "text-[#3730A3]", icon: Undo2 },
};

export default function PaymentHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get(`${API}/payments/history`);
        setPayments(res.data);
      } catch (e) {
        console.error("Failed to fetch payments:", e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FDFBF7]/80 border-b border-[#F3E8FF]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="text-[#1E1B4B]/60 hover:text-[#1E1B4B]">
            <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <Receipt className="w-5 h-5 text-[#FF9F1C]" strokeWidth={2.5} />
          <h1 className="text-xl font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
            Payment History
          </h1>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-[#F3E8FF]/50 animate-shimmer" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-16">
            <Receipt className="w-12 h-12 text-[#F3E8FF] mx-auto mb-4" strokeWidth={1.5} />
            <h3 className="text-lg font-medium text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
              No payments yet
            </h3>
            <p className="text-sm text-[#1E1B4B]/50 mt-1">Your payment history will appear here</p>
            <Button
              onClick={() => {
                localStorage.removeItem("tingu_wizard_state");
                navigate("/create");
              }}
              className="mt-6 rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold"
            >
              Create Your First Story
            </Button>
          </div>
        ) : (
          <div className="space-y-3" data-testid="payment-list">
            {payments.map((p, i) => {
              const s = STATUS_COLORS[p.status] || STATUS_COLORS.created;
              const StatusIcon = s.icon;
              return (
                <div
                  key={i}
                  data-testid={`payment-row-${i}`}
                  className="flex items-center gap-4 p-5 rounded-2xl bg-white border-2 border-[#F3E8FF] card-hover"
                >
                  <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                    <StatusIcon className={`w-5 h-5 ${s.text}`} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                        ₹{p.amount}
                      </p>
                      <Badge className={`${s.bg} ${s.text} rounded-full px-2 py-0.5 text-[10px] font-bold border-0 uppercase`}>
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
                      {p.created_at
                        ? new Date(p.created_at).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric",
                          })
                        : ""}
                    </p>
                    <p className="text-[10px] text-[#1E1B4B]/25 font-mono mt-0.5">
                      {p.order_id?.slice(0, 20)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
