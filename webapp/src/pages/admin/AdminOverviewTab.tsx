import { Card, CardContent } from "../../components/ui/card";
import { Users, BookOpen, DollarSign, Activity } from "lucide-react";

interface AdminOverviewTabProps {
  stats: {
    total_users: number;
    total_stories: number;
    completed_stories: number;
    total_revenue: number;
    pending_jobs: number;
    processing_jobs: number;
  };
}

export default function AdminOverviewTab({ stats }: AdminOverviewTabProps) {
  return (
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
            <p className="text-2xl font-bold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
              {s.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
