import { User, Baby, ChevronDown, ChevronUp, Users } from "lucide-react";
import { Search } from "lucide-react";

interface AdminUsersTabProps {
  userProfiles: any[];
  childProfilesByUser: Record<string, any[]>;
  userSearch: string;
  setUserSearch: (v: string) => void;
  stories: any[];
  expandedUser: string | null;
  setExpandedUser: (v: string | null) => void;
}

export default function AdminUsersTab({
  userProfiles,
  childProfilesByUser,
  userSearch,
  setUserSearch,
  stories,
  expandedUser,
  setExpandedUser,
}: AdminUsersTabProps) {
  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1E1B4B]/30" strokeWidth={2} />
        <input
          type="text"
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-[#F3E8FF] text-sm text-[#1E1B4B] placeholder:text-[#1E1B4B]/30 focus:outline-none focus:border-[#3730A3]/30 bg-white"
        />
      </div>
      <div className="space-y-3">
        {userProfiles
          .filter((u: any) => {
            const q = userSearch.toLowerCase();
            return (
              !q ||
              (u.email || "").toLowerCase().includes(q) ||
              (u.name || "").toLowerCase().includes(q)
            );
          })
          .map((u: any) => {
            const uid = u.uid || u.id;
            const children = childProfilesByUser[uid] || [];
            const storyCount = stories.filter((s: any) => s.user_id === uid).length;
            const isExpanded = expandedUser === uid;
            return (
              <div key={uid} className="rounded-2xl border-2 border-[#F3E8FF] bg-white overflow-hidden">
                <button
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-[#F3E8FF]/30 transition-colors"
                  onClick={() => setExpandedUser(isExpanded ? null : uid)}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#3730A3]/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-[#3730A3]/60" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1E1B4B] truncate" style={{ fontFamily: "Fredoka" }}>
                      {u.name || "(no name)"}
                    </p>
                    <p className="text-xs text-[#1E1B4B]/50 truncate">{u.email || "—"}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 text-right">
                    <div className="text-xs text-[#1E1B4B]/40">
                      <span className="font-semibold text-[#1E1B4B]/60">{storyCount}</span> stories
                    </div>
                    <div className="text-xs text-[#1E1B4B]/40">
                      <span className="font-semibold text-[#1E1B4B]/60">{children.length}</span> profiles
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[#1E1B4B]/30" strokeWidth={2} />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#1E1B4B]/30" strokeWidth={2} />
                    )}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t-2 border-[#F3E8FF] px-4 py-3 space-y-2 bg-[#F3E8FF]/20">
                    <p className="text-[10px] font-semibold text-[#1E1B4B]/40 uppercase tracking-wider mb-1">
                      Child Profiles
                    </p>
                    {children.length === 0 ? (
                      <p className="text-xs text-[#1E1B4B]/40 italic">No child profiles</p>
                    ) : (
                      children.map((cp: any) => (
                        <div
                          key={cp.id}
                          className="flex items-center gap-3 p-2 rounded-xl bg-white border border-[#F3E8FF]"
                        >
                          {cp.avatar_url ? (
                            <img
                              src={cp.avatar_url}
                              alt={cp.name}
                              className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-[#FF9F1C]/10 flex items-center justify-center flex-shrink-0">
                              <Baby className="w-4 h-4 text-[#FF9F1C]" strokeWidth={2} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[#1E1B4B] truncate">{cp.name}</p>
                            <p className="text-[10px] text-[#1E1B4B]/40">
                              Age {cp.age}
                              {cp.gender ? ` · ${cp.gender}` : ""}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <p className="text-[10px] font-semibold text-[#1E1B4B]/40 uppercase tracking-wider mt-2 mb-1">
                      User ID
                    </p>
                    <p className="text-[10px] font-mono text-[#1E1B4B]/40 break-all">{uid}</p>
                  </div>
                )}
              </div>
            );
          })}
        {userProfiles.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-[#F3E8FF] mx-auto mb-4" strokeWidth={1.5} />
            <p className="text-sm text-[#1E1B4B]/50">No users found</p>
          </div>
        )}
      </div>
    </div>
  );
}
