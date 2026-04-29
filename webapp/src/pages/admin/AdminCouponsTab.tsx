import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { RefreshCw, Trash2 } from "lucide-react";

interface AdminCouponsTabProps {
  coupons: any[];
  loadingCoupons: boolean;
  fetchCoupons: () => void;
  couponCodeInput: string;
  setCouponCodeInput: (v: string) => void;
  couponDiscountInput: string;
  setCouponDiscountInput: (v: string) => void;
  couponUsageInput: string;
  setCouponUsageInput: (v: string) => void;
  addingCoupon: boolean;
  handleAddCoupon: () => void;
  handleDeleteCoupon: (id: string) => void;
  deletingCoupon: string | null;
}

export default function AdminCouponsTab({
  coupons,
  loadingCoupons,
  fetchCoupons,
  couponCodeInput,
  setCouponCodeInput,
  couponDiscountInput,
  setCouponDiscountInput,
  couponUsageInput,
  setCouponUsageInput,
  addingCoupon,
  handleAddCoupon,
  handleDeleteCoupon,
  deletingCoupon,
}: AdminCouponsTabProps) {
  return (
    <div data-testid="admin-coupons">
      <Card className="rounded-2xl border-2 border-[#F3E8FF] mb-4">
        <CardContent className="p-4">
          <p
            className="text-sm font-semibold text-[#1E1B4B] mb-3"
            style={{ fontFamily: "Fredoka" }}
          >
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
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loadingCoupons ? "animate-spin" : ""}`}
            strokeWidth={2}
          />
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
                  Remaining:{" "}
                  <span className="font-semibold text-[#1E1B4B]">
                    {Number(c.remaining_uses ?? 0)}
                  </span>
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
  );
}
