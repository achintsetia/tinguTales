import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Undo2 } from "lucide-react";
import { PAY_STATUS_COLORS, toDisplayDate } from "./_adminUtils";

interface AdminPaymentsTabProps {
  payments: any[];
  handleRefund: (paymentId: string) => void;
}

export default function AdminPaymentsTab({ payments, handleRefund }: AdminPaymentsTabProps) {
  return (
    <div data-testid="admin-payments">
      <p className="text-sm text-[#1E1B4B]/50 mb-4">{payments.length} total payments</p>
      <div className="space-y-2">
        {payments.length === 0 ? (
          <p className="text-center py-12 text-[#1E1B4B]/40">No payments yet</p>
        ) : (
          payments.map((p, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-4 rounded-xl bg-white border-2 border-[#F3E8FF]"
            >
              <Badge
                className={`${
                  PAY_STATUS_COLORS[p.status] || ""
                } rounded-full px-2.5 py-0.5 text-xs font-semibold border-0`}
              >
                {p.status}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1E1B4B]">
                  ₹{p.amount} — {p.page_count} pages
                </p>
                {!!p.discount_amount && (
                  <p className="text-xs text-[#2A9D8F]">
                    Discount: ₹{p.discount_amount}
                    {p.coupon_code ? ` (${p.coupon_code})` : ""}
                    {p.discount_percent ? ` · ${p.discount_percent}%` : ""}
                  </p>
                )}
                <p className="text-xs text-[#1E1B4B]/40 font-mono truncate">{p.order_id}</p>
              </div>
              <span className="text-xs text-[#1E1B4B]/30">{toDisplayDate(p.created_at)}</span>
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
  );
}
