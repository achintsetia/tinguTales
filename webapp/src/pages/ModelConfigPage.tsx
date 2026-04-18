import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db, functions } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { ArrowLeft, RefreshCw, Save, Plus, Trash2, Bot } from "lucide-react";

interface ModelConfig {
  key: string;
  name: string;
}

interface GeminiModel {
  name: string;
  displayName: string;
  description: string;
}

const MODEL_KEY_LABELS: Record<string, string> = {
  avatar_generation_model: "Avatar Generation",
  story_illustration_model: "Story Illustration",
  story_writing_model: "Story Writing",
};

export default function ModelConfigPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [geminiModels, setGeminiModels] = useState<GeminiModel[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const [newKey, setNewKey] = useState("");
  const [newModel, setNewModel] = useState("");
  const [addingNew, setAddingNew] = useState(false);

  useEffect(() => {
    if (!user?.is_admin) {
      navigate("/dashboard", { replace: true });
      return;
    }
    loadConfigs();
    loadGeminiModels();
  }, [user, navigate]);

  const loadConfigs = async () => {
    setLoadingConfigs(true);
    try {
      const snap = await getDocs(collection(db, "models"));
      const items: ModelConfig[] = snap.docs.map((d) => ({
        key: d.id,
        name: (d.data().name as string) ?? "",
      }));
      setConfigs(items);
      const vals: Record<string, string> = {};
      items.forEach((c) => (vals[c.key] = c.name));
      setEditValues(vals);
    } catch {
      toast.error("Failed to load model configs");
    } finally {
      setLoadingConfigs(false);
    }
  };

  const loadGeminiModels = async () => {
    setLoadingModels(true);
    try {
      const fn = httpsCallable<unknown, { models: GeminiModel[] }>(
        functions,
        "listGeminiModels"
      );
      const res = await fn({});
      setGeminiModels(res.data.models);
      if (res.data.models.length > 0 && !newModel) {
        setNewModel(res.data.models[0].name);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load Gemini models";
      toast.error(msg);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async (key: string) => {
    const modelName = editValues[key];
    if (!modelName) return;
    setSaving((p) => ({ ...p, [key]: true }));
    try {
      await setDoc(doc(db, "models", key), { name: modelName }, { merge: true });
      setConfigs((prev) =>
        prev.map((c) => (c.key === key ? { ...c, name: modelName } : c))
      );
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving((p) => ({ ...p, [key]: false }));
    }
  };

  const handleDelete = async (key: string) => {
    if (!window.confirm(`Delete config "${key}"?`)) return;
    try {
      await deleteDoc(doc(db, "models", key));
      setConfigs((prev) => prev.filter((c) => c.key !== key));
      setEditValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleAdd = async () => {
    const key = newKey.trim().replace(/\s+/g, "_");
    if (!key || !newModel) return;
    setAddingNew(true);
    try {
      await setDoc(doc(db, "models", key), { name: newModel });
      setConfigs((prev) => [...prev, { key, name: newModel }]);
      setEditValues((prev) => ({ ...prev, [key]: newModel }));
      setNewKey("");
      toast.success("Added");
    } catch {
      toast.error("Failed to add");
    } finally {
      setAddingNew(false);
    }
  };

  const isDirty = (key: string) =>
    editValues[key] !== configs.find((c) => c.key === key)?.name;

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Header */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FDFBF7]/80 border-b border-[#F3E8FF]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/admin")}
              className="text-[#1E1B4B]/60 hover:text-[#1E1B4B]"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
            </button>
            <Bot className="w-5 h-5 text-[#3730A3]" strokeWidth={2.5} />
            <h1
              className="text-xl font-semibold text-[#1E1B4B]"
              style={{ fontFamily: "Fredoka" }}
            >
              Model Configuration
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={loadGeminiModels}
            disabled={loadingModels}
            className="rounded-full border-[#F3E8FF]"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loadingModels ? "animate-spin" : ""}`}
              strokeWidth={2}
            />
            Refresh Models
          </Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {loadingModels && (
          <p className="text-xs text-[#1E1B4B]/40 text-center">
            Loading available Gemini models...
          </p>
        )}

        {/* Existing configs */}
        {loadingConfigs ? (
          <p className="text-center py-12 text-[#1E1B4B]/40">Loading...</p>
        ) : configs.length === 0 ? (
          <p className="text-center py-12 text-[#1E1B4B]/40">
            No model configs yet. Add one below.
          </p>
        ) : (
          configs.map((config) => (
            <Card
              key={config.key}
              className="rounded-2xl border-2 border-[#F3E8FF]"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#3730A3] uppercase tracking-wider mb-0.5">
                      {MODEL_KEY_LABELS[config.key] ?? config.key}
                    </p>
                    <p className="text-xs text-[#1E1B4B]/40 font-mono mb-3">
                      {config.key}
                    </p>
                    <select
                      value={editValues[config.key] ?? ""}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          [config.key]: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border-2 border-[#F3E8FF] bg-white px-3 py-2 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#3730A3]/40"
                    >
                      {/* Always include current value even if not in list yet */}
                      {!geminiModels.find(
                        (m) => m.name === (editValues[config.key] ?? config.name)
                      ) && (
                        <option value={editValues[config.key] ?? config.name}>
                          {editValues[config.key] ?? config.name}
                        </option>
                      )}
                      {geminiModels.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.displayName || m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 mt-6 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleSave(config.key)}
                      disabled={!isDirty(config.key) || !!saving[config.key]}
                      className="rounded-full bg-[#1E1B4B] hover:bg-[#1E1B4B]/80 text-white text-xs h-8 px-4"
                    >
                      <Save className="w-3 h-3 mr-1.5" strokeWidth={2.5} />
                      {saving[config.key] ? "Saving..." : "Save"}
                    </Button>
                    <button
                      onClick={() => handleDelete(config.key)}
                      className="text-[#E76F51]/40 hover:text-[#E76F51] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {/* Add new config */}
        <Card className="rounded-2xl border-2 border-dashed border-[#F3E8FF]">
          <CardContent className="p-5">
            <p
              className="text-sm font-semibold text-[#1E1B4B] mb-3"
              style={{ fontFamily: "Fredoka" }}
            >
              Add Model Config
            </p>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-[#1E1B4B]/50 mb-1 block">
                  Config Key
                </label>
                <input
                  type="text"
                  placeholder="e.g. story_illustration_model"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full rounded-xl border-2 border-[#F3E8FF] bg-white px-3 py-2 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#3730A3]/40 font-mono"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-[#1E1B4B]/50 mb-1 block">
                  Model
                </label>
                <select
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  className="w-full rounded-xl border-2 border-[#F3E8FF] bg-white px-3 py-2 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#3730A3]/40"
                >
                  {geminiModels.length === 0 ? (
                    <option value="">— refresh to load models —</option>
                  ) : (
                    geminiModels.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.displayName || m.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <Button
                onClick={handleAdd}
                disabled={!newKey.trim() || !newModel || addingNew}
                className="rounded-full bg-[#2A9D8F] hover:bg-[#2A9D8F]/80 text-white h-10 px-5 shrink-0"
              >
                <Plus className="w-4 h-4 mr-1.5" strokeWidth={2.5} />
                {addingNew ? "Adding..." : "Add"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
