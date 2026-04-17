import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth, API } from "../context/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      const hash = window.location.hash;
      const sessionId = new URLSearchParams(hash.substring(1)).get("session_id");

      if (!sessionId) {
        navigate("/", { replace: true });
        return;
      }

      try {
        const response = await axios.post(`${API}/auth/session`, {
          session_id: sessionId,
        });
        const userData = response.data;

        // Store session token in localStorage for auth
        if (userData.session_token) {
          localStorage.setItem("session_token", userData.session_token);
        }

        setUser(userData);
        navigate("/dashboard", { replace: true, state: { user: userData } });
      } catch (error) {
        console.error("Auth callback error:", error);
        navigate("/", { replace: true });
      }
    };

    processAuth();
  }, [navigate, setUser]);

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
