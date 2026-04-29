import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Switch } from "../../components/ui/switch";
import { Input } from "../../components/ui/input";
import { RefreshCw, Trash2 } from "lucide-react";

interface AdminWhitelistTabProps {
  allUsers: any[];
  whitelistMap: Record<string, any>;
  loadingWhitelist: boolean;
  whitelistSearch: string;
  setWhitelistSearch: (v: string) => void;
  savingWhitelistUser: string | null;
  whitelistEmail: string;
  setWhitelistEmail: (v: string) => void;
  addingWhitelistEmail: boolean;
  fetchWhitelistData: () => void;
  handleToggleWhitelist: (u: any, enabled: boolean) => void;
  handleAddWhitelistEmail: () => void;
  handleRemoveWhitelistEmail: (key: string) => void;
}

export default function AdminWhitelistTab({
  allUsers,
  whitelistMap,
  loadingWhitelist,
  whitelistSearch,
  setWhitelistSearch,
  savingWhitelistUser,
  whitelistEmail,
  setWhitelistEmail,
  addingWhitelistEmail,
  fetchWhitelistData,
  handleToggleWhitelist,
  handleAddWhitelistEmail,
  handleRemoveWhitelistEmail,
}: AdminWhitelistTabProps) {
  return (
    <div data-testid="admin-whitelist">
      <Card className="rounded-2xl border-2 border-[#F3E8FF] mb-4">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-[#1E1B4B] mb-2" style={{ fontFamily: "Fredoka" }}>
            Add Email To Whitelist
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={whitelistEmail}
              onChange={(e) => setWhitelistEmail(e.target.value)}
              placeholder="name@example.com"
              className="rounded-full border-[#F3E8FF]"
            />
            <Button
              onClick={handleAddWhitelistEmail}
              disabled={addingWhitelistEmail}
              className="rounded-full bg-[#2A9D8F] hover:bg-[#248679] text-white"
            >
              {addingWhitelistEmail ? "Adding…" : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <p className="text-sm text-[#1E1B4B]/50">
            Beta users who can create child profiles and stories
          </p>
          <p className="text-xs text-[#1E1B4B]/40 mt-0.5">
            Whitelisted: {Object.keys(whitelistMap).length} / {allUsers.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={whitelistSearch}
            onChange={(e) => setWhitelistSearch(e.target.value)}
            placeholder="Search name or email"
            className="w-[220px] rounded-full border-[#F3E8FF]"
          />
          <Button
            variant="outline"
            onClick={fetchWhitelistData}
            disabled={loadingWhitelist}
            className="rounded-full border-[#F3E8FF]"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loadingWhitelist ? "animate-spin" : ""}`}
              strokeWidth={2}
            />
            Refresh
          </Button>
        </div>
      </div>

      {loadingWhitelist && (
        <div className="flex items-center justify-center py-12 text-[#1E1B4B]/40">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading whitelist…
        </div>
      )}

      {!loadingWhitelist && (
        <div className="space-y-2">
          {allUsers
            .filter((u: any) => {
              const needle = whitelistSearch.trim().toLowerCase();
              if (!needle) return true;
              return `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(needle);
            })
            .map((u: any) => {
              const uid = u.uid || u.id;
              const emailKey = u.email ? `email:${String(u.email).trim().toLowerCase()}` : "";
              const isAdminUser = u.is_admin === true;
              const isWhitelisted =
                isAdminUser ||
                !!whitelistMap[uid] ||
                (!!emailKey && !!whitelistMap[emailKey]);
              return (
                <Card key={uid} className="rounded-2xl border-2 border-[#F3E8FF]">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#F3E8FF] flex items-center justify-center text-xs font-bold text-[#3730A3]">
                      {(u.name?.[0] || u.email?.[0] || "?").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1E1B4B] truncate">
                        {u.name || "Unnamed user"}
                      </p>
                      <p className="text-xs text-[#1E1B4B]/40 truncate">{u.email || uid}</p>
                    </div>
                    {isAdminUser && (
                      <Badge className="bg-[#3730A3]/15 text-[#3730A3] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                        Admin
                      </Badge>
                    )}
                    {!isAdminUser && isWhitelisted && (
                      <Badge className="bg-[#2A9D8F]/15 text-[#2A9D8F] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                        Whitelisted
                      </Badge>
                    )}
                    {!isAdminUser && !isWhitelisted && (
                      <Badge className="bg-[#E76F51]/15 text-[#E76F51] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                        Blocked
                      </Badge>
                    )}
                    <Switch
                      checked={isWhitelisted}
                      disabled={isAdminUser || savingWhitelistUser === uid}
                      onCheckedChange={(checked) => handleToggleWhitelist(u, checked)}
                    />
                  </CardContent>
                </Card>
              );
            })}

          {Object.entries(whitelistMap)
            .filter(([key]) => key.startsWith("email:"))
            .map(([key, val]: any) => (
              <Card key={key} className="rounded-2xl border-2 border-[#F3E8FF] bg-[#FDFBF7]">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#2A9D8F]/10 flex items-center justify-center text-xs font-bold text-[#2A9D8F]">
                    @
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1E1B4B] truncate">
                      {val.email || key.replace("email:", "")}
                    </p>
                    <p className="text-xs text-[#1E1B4B]/40 truncate">Manual email whitelist</p>
                  </div>
                  <Badge className="bg-[#2A9D8F]/15 text-[#2A9D8F] border-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                    Whitelisted
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveWhitelistEmail(key)}
                    className="rounded-full text-[#E76F51] hover:bg-[#E76F51]/10"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={2} />
                  </Button>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
