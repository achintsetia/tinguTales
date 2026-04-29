import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { RefreshCw, Mail, Trash2 } from "lucide-react";
import { toDisplayDate } from "./_adminUtils";

interface AdminContactsTabProps {
  contacts: any[];
  loadingContacts: boolean;
  fetchContacts: () => void;
  handleDeleteContact: (contactId: string) => void;
  deletingContactId: string | null;
}

export default function AdminContactsTab({
  contacts,
  loadingContacts,
  fetchContacts,
  handleDeleteContact,
  deletingContactId,
}: AdminContactsTabProps) {
  return (
    <div data-testid="admin-contacts">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#1E1B4B]/50">{contacts.length} contact quer(y/ies)</p>
        <Button
          variant="outline"
          onClick={fetchContacts}
          disabled={loadingContacts}
          className="rounded-full border-[#F3E8FF]"
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loadingContacts ? "animate-spin" : ""}`}
            strokeWidth={2}
          />
          Refresh
        </Button>
      </div>

      {loadingContacts ? (
        <div className="flex items-center justify-center py-10 text-[#1E1B4B]/40">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading contact queries...
        </div>
      ) : contacts.length === 0 ? (
        <p className="text-center py-10 text-[#1E1B4B]/40">No contact queries yet</p>
      ) : (
        <div className="space-y-2">
          {contacts.map((c: any) => (
            <Card key={c.id} className="rounded-2xl border-2 border-[#F3E8FF]">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#3730A3]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Mail className="w-4 h-4 text-[#3730A3]" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1E1B4B]">{c.name || "Unknown"}</p>
                  <p className="text-xs text-[#1E1B4B]/55">
                    {c.email || "-"} · {c.phone_number || "-"}
                  </p>
                  <p className="text-xs text-[#1E1B4B]/40 mt-0.5">{toDisplayDate(c.created_at)}</p>
                  <p className="text-sm text-[#1E1B4B]/80 mt-2 whitespace-pre-wrap break-words">
                    {c.query || "-"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteContact(c.id)}
                  disabled={deletingContactId === c.id}
                  className="rounded-full border-[#E76F51]/30 text-[#E76F51] hover:bg-[#E76F51]/10 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" strokeWidth={2} />
                  {deletingContactId === c.id ? "Deleting..." : "Delete"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
