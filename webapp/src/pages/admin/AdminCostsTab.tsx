import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

interface AdminCostsTabProps {
  costReport: any;
  loadingCosts: boolean;
  fetchCosts: () => void;
  setCostReport: (v: any) => void;
  expandedUser: string | null;
  setExpandedUser: (v: string | null) => void;
}

export default function AdminCostsTab({
  costReport,
  loadingCosts,
  fetchCosts,
  setCostReport,
  expandedUser,
  setExpandedUser,
}: AdminCostsTabProps) {
  return (
    <div data-testid="admin-costs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p
            className="text-sm font-semibold text-[#1E1B4B]"
            style={{ fontFamily: "Fredoka" }}
          >
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
          onClick={() => {
            setCostReport(null);
            fetchCosts();
          }}
          disabled={loadingCosts}
          className="rounded-full border-[#F3E8FF]"
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loadingCosts ? "animate-spin" : ""}`}
            strokeWidth={2}
          />
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
          <Card className="rounded-2xl border-2 border-[#F3E8FF] mb-5">
            <CardContent className="p-5 flex flex-wrap gap-6">
              <div>
                <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-1">
                  Total Users
                </p>
                <p
                  className="text-2xl font-bold text-[#1E1B4B]"
                  style={{ fontFamily: "Fredoka" }}
                >
                  {costReport.users.length}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-1">
                  Total Cost (USD)
                </p>
                <p
                  className="text-2xl font-bold text-[#1E1B4B]"
                  style={{ fontFamily: "Fredoka" }}
                >
                  ${costReport.users
                    .reduce((s: number, u: any) => s + u.totalCostUsd, 0)
                    .toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-1">
                  Total Cost (INR)
                </p>
                <p
                  className="text-2xl font-bold text-[#FF9F1C]"
                  style={{ fontFamily: "Fredoka" }}
                >
                  ₹{costReport.users
                    .reduce((s: number, u: any) => s + u.totalCostInr, 0)
                    .toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {costReport.users.map((u: any) => (
              <div
                key={u.userId}
                className="bg-white rounded-xl border-2 border-[#F3E8FF] overflow-hidden"
              >
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#FDFBF7] transition-colors"
                  onClick={() =>
                    setExpandedUser(expandedUser === u.userId ? null : u.userId)
                  }
                >
                  <div className="w-8 h-8 rounded-full bg-[#F3E8FF] flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-[#3730A3]">
                      {(u.email?.[0] ?? "?").toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1E1B4B] truncate">{u.email}</p>
                    <p className="text-xs text-[#1E1B4B]/40 font-mono truncate">
                      {u.userId.slice(0, 16)}…
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-[#FF9F1C]">
                      ₹{u.totalCostInr.toFixed(3)}
                    </p>
                    <p className="text-xs text-[#1E1B4B]/40">${u.totalCostUsd.toFixed(5)}</p>
                  </div>
                  {expandedUser === u.userId ? (
                    <ChevronUp className="w-4 h-4 text-[#1E1B4B]/30 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#1E1B4B]/30 flex-shrink-0" />
                  )}
                </button>

                {expandedUser === u.userId && (
                  <div className="border-t border-[#F3E8FF] px-4 pb-4 pt-3 space-y-2">
                    <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-2">
                      Task Breakdown
                    </p>
                    {Object.entries(u.byTask).map(([task, val]: any) => (
                      <div key={task} className="flex items-center gap-2 text-sm">
                        <Badge className="bg-[#3730A3]/10 text-[#3730A3] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                          {task}
                        </Badge>
                        <span className="text-[#1E1B4B]/50 text-xs">
                          {val.tokens.toLocaleString()} tokens
                        </span>
                        <span className="flex-1" />
                        <span className="text-xs text-[#1E1B4B]/40">${val.costUsd.toFixed(6)}</span>
                        <span className="text-xs font-semibold text-[#FF9F1C]">
                          ₹{val.costInr.toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 rounded-xl bg-[#F3E8FF]/40 text-xs text-[#1E1B4B]/50 space-y-1">
            <p className="font-semibold text-[#1E1B4B]/60">Pricing sources</p>
            <p>
              Gemini: gemini-2.5-flash $0.30/$2.50 per 1M in/out · avatar gen $0.10/$30.00 per 1M
              in/out
            </p>
            <p>
              Sarvam: sarvam-30b $0.40/$1.60 per 1M in/out · transliteration $0.005 per 1K chars
            </p>
            <p>USD → INR at ₹96 (fixed reference rate)</p>
          </div>
        </>
      )}
    </div>
  );
}
