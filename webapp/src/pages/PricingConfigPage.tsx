import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { ArrowLeft, Save, Plus, Trash2, IndianRupee, BookOpen } from "lucide-react";

interface PricingTier {
  pages: number;
  price: number;
  enabled: boolean;
}

export default function PricingConfigPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New tier form
  const [newPages, setNewPages] = useState("");
  const [newPrice, setNewPrice] = useState("");

  useEffect(() => {
    if (!user?.is_admin) {
      navigate("/dashboard", { replace: true });
      return;
    }
    loadPricing();
  }, [user, navigate]);

  const loadPricing = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "pricing", "public"));
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.tiers)) {
          setTiers((data.tiers as PricingTier[]).sort((a, b) => a.pages - b.pages));
          return;
        }
      }

      // One-time fallback: migrate legacy settings/pricing doc to pricing/public.
      const legacySnap = await getDoc(doc(db, "settings", "pricing"));
      if (legacySnap.exists()) {
        const legacyData = legacySnap.data();
        if (Array.isArray(legacyData.tiers)) {
          const sorted = (legacyData.tiers as PricingTier[]).sort((a, b) => a.pages - b.pages);
          setTiers(sorted);
          await setDoc(doc(db, "pricing", "public"), { tiers: sorted }, { merge: true });
          return;
        }
      }

      // If pricing/public doesn't exist yet, create it so the collection is visible in Firestore.
      await setDoc(doc(db, "pricing", "public"), {
        tiers: [],
        payments_enabled: false,
      }, { merge: true });

      setTiers([]);
    } catch {
      toast.error("Failed to load pricing config");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validate — no duplicate page counts, all prices > 0
    const pages = tiers.map((t) => t.pages);
    if (new Set(pages).size !== pages.length) {
      toast.error("Duplicate page counts detected");
      return;
    }
    if (tiers.some((t) => t.price <= 0 || !Number.isFinite(t.price))) {
      toast.error("All prices must be greater than 0");
      return;
    }
    if (tiers.length === 0) {
      toast.error("Add at least one pricing tier");
      return;
    }
    setSaving(true);
    try {
      const sorted = [...tiers].sort((a, b) => a.pages - b.pages);
      await setDoc(doc(db, "pricing", "public"), { tiers: sorted }, { merge: true });
      setTiers(sorted);
      toast.success("Pricing saved");
    } catch {
      toast.error("Failed to save pricing");
    } finally {
      setSaving(false);
    }
  };

  const handlePriceChange = (index: number, value: string) => {
    const parsed = parseFloat(value);
    setTiers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, price: isNaN(parsed) ? 0 : parsed } : t))
    );
  };

  const handleToggle = (index: number) => {
    setTiers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const handleDelete = (index: number) => {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddTier = () => {
    const pages = parseInt(newPages, 10);
    const price = parseFloat(newPrice);
    if (!pages || pages < 1 || pages > 100) {
      toast.error("Page count must be between 1 and 100");
      return;
    }
    if (!price || price <= 0) {
      toast.error("Price must be greater than 0");
      return;
    }
    if (tiers.some((t) => t.pages === pages)) {
      toast.error(`A tier for ${pages} pages already exists`);
      return;
    }
    setTiers((prev) => [...prev, { pages, price, enabled: true }]);
    setNewPages("");
    setNewPrice("");
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Header */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FDFBF7]/80 border-b border-[#F3E8FF]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/admin")} className="text-[#1E1B4B]/60 hover:text-[#1E1B4B]">
              <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
            </button>
            <IndianRupee className="w-5 h-5 text-[#FF9F1C]" strokeWidth={2.5} />
            <h1 className="text-xl font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
              Pricing Config
            </h1>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-[#2A9D8F] hover:bg-[#238f82] text-white font-bold px-6"
          >
            <Save className="w-4 h-4 mr-2" strokeWidth={2.5} />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Info banner */}
        <Card className="rounded-2xl border-2 border-[#FF9F1C]/30 bg-[#FF9F1C]/5">
          <CardContent className="p-4 flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-[#FF9F1C] flex-shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <p className="text-sm font-semibold text-[#1E1B4B]">Per-book pricing by page count</p>
              <p className="text-xs text-[#1E1B4B]/60 mt-0.5">
                Set the price (₹) charged per storybook based on the number of pages selected by the user.
                Disabled tiers will not be shown as options during story creation.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Pricing tiers */}
        <Card className="rounded-2xl border-2 border-[#F3E8FF]">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-xl bg-[#F3E8FF]/50 animate-shimmer" />
                ))}
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_1fr_80px_40px] gap-4 px-5 py-3 border-b border-[#F3E8FF] text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider">
                  <span>Pages</span>
                  <span>Price (₹)</span>
                  <span className="text-center">Enabled</span>
                  <span />
                </div>

                {tiers.length === 0 ? (
                  <p className="text-center py-10 text-sm text-[#1E1B4B]/40">No tiers configured</p>
                ) : (
                  tiers.map((tier, i) => (
                    <div
                      key={tier.pages}
                      className={`grid grid-cols-[1fr_1fr_80px_40px] gap-4 items-center px-5 py-3.5 border-b border-[#F3E8FF]/60 last:border-b-0 ${
                        !tier.enabled ? "opacity-50" : ""
                      }`}
                    >
                      {/* Pages label */}
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#3730A3]/10 flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-4 h-4 text-[#3730A3]" strokeWidth={2} />
                        </div>
                        <span className="font-semibold text-[#1E1B4B] text-sm">{tier.pages} pages</span>
                      </div>

                      {/* Price input */}
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1E1B4B]/40 text-sm font-medium">₹</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={tier.price}
                          onChange={(e) => handlePriceChange(i, e.target.value)}
                          className="w-full pl-7 pr-3 py-2 rounded-xl border-2 border-[#F3E8FF] focus:border-[#3730A3]/40 focus:outline-none text-sm font-semibold text-[#1E1B4B] bg-white"
                        />
                      </div>

                      {/* Enable toggle */}
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleToggle(i)}
                          className={`w-11 h-6 rounded-full transition-colors ${
                            tier.enabled ? "bg-[#2A9D8F]" : "bg-[#1E1B4B]/20"
                          }`}
                        >
                          <span
                            className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform mx-0.5 ${
                              tier.enabled ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(i)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#1E1B4B]/30 hover:text-[#E76F51] hover:bg-[#E76F51]/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </div>
                  ))
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Add new tier */}
        <Card className="rounded-2xl border-2 border-dashed border-[#F3E8FF]">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase tracking-wider mb-3">Add Tier</p>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-[#1E1B4B]/60 mb-1 block">Page Count</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  placeholder="e.g. 24"
                  value={newPages}
                  onChange={(e) => setNewPages(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-[#F3E8FF] focus:border-[#3730A3]/40 focus:outline-none text-sm text-[#1E1B4B] bg-white"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-[#1E1B4B]/60 mb-1 block">Price (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1E1B4B]/40 text-sm">₹</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g. 299"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border-2 border-[#F3E8FF] focus:border-[#3730A3]/40 focus:outline-none text-sm text-[#1E1B4B] bg-white"
                  />
                </div>
              </div>
              <Button
                onClick={handleAddTier}
                className="rounded-xl bg-[#3730A3] hover:bg-[#2d2888] text-white font-bold px-4 h-10"
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {tiers.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...tiers]
              .filter((t) => t.enabled)
              .sort((a, b) => a.pages - b.pages)
              .map((t) => (
                <Card key={t.pages} className="rounded-2xl border-2 border-[#F3E8FF]">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs font-bold text-[#1E1B4B]/40 uppercase mb-1">{t.pages} pages</p>
                    <p className="text-2xl font-bold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                      ₹{t.price}
                    </p>
                    <p className="text-[10px] text-[#1E1B4B]/40 mt-0.5">
                      ₹{(t.price / t.pages).toFixed(1)}/page
                    </p>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
