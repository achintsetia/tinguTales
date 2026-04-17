import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

type AuthMode = "signin" | "signup";

interface FirebaseError {
  code?: string;
}

function getErrorMessage(error: unknown): string {
  const code = (error as FirebaseError)?.code;
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    default:
      return "Something went wrong. Please try again.";
  }
}

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, loginWithEmail, signupWithEmail } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const reset = () => {
    setEmail("");
    setPassword("");
    setName("");
    setError("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError("");
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      await login();
      handleClose();
    } catch (e) {
      const msg = getErrorMessage(e);
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "signup" && !name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        await loginWithEmail(email, password);
      } else {
        await signupWithEmail(email, password, name.trim());
      }
      handleClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm bg-[#FDFBF7] rounded-3xl p-8 shadow-2xl border-2 border-[#F3E8FF]">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-[#F3E8FF] transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-[#1E1B4B]/50" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <img src="/logo-icon.svg" alt="" className="w-8 h-8" />
          <span
            className="text-xl font-semibold text-[#1E1B4B]"
            style={{ fontFamily: "Fredoka" }}
          >
            Tingu <span className="text-[#FF9F1C]">Tales</span>
          </span>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-2xl bg-[#F3E8FF] p-1 mb-6">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                mode === m
                  ? "bg-white text-[#1E1B4B] shadow-sm"
                  : "text-[#1E1B4B]/50 hover:text-[#1E1B4B]"
              }`}
            >
              {m === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Google button */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border-2 border-[#F3E8FF] bg-white hover:bg-[#F3E8FF] transition-colors text-sm font-semibold text-[#1E1B4B] disabled:opacity-50"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[#F3E8FF]" />
          <span className="text-xs text-[#1E1B4B]/40 font-medium">or</span>
          <div className="flex-1 h-px bg-[#F3E8FF]" />
        </div>

        {/* Email / password form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <Input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-2xl border-2 border-[#F3E8FF] h-12 px-4 focus-visible:ring-[#FF9F1C] bg-white"
              required
              disabled={loading}
              autoComplete="name"
            />
          )}
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-2xl border-2 border-[#F3E8FF] h-12 px-4 focus-visible:ring-[#FF9F1C] bg-white"
            required
            disabled={loading}
            autoComplete={mode === "signin" ? "email" : "new-password"}
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-2xl border-2 border-[#F3E8FF] h-12 px-4 focus-visible:ring-[#FF9F1C] bg-white"
            required
            minLength={6}
            disabled={loading}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />

          {error && (
            <p className="text-sm text-[#E76F51] font-medium text-center">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold h-12 text-base"
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
