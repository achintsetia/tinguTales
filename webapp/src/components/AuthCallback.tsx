import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="text-center animate-fade-in-up">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#FF9F1C]/20 flex items-center justify-center animate-float">
          <svg className="w-8 h-8 text-[#FF9F1C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <p className="text-lg text-[#1E1B4B] font-medium" style={{ fontFamily: 'Fredoka' }}>
          Opening your storybook...
        </p>
      </div>
    </div>
  );
}
