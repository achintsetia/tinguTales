import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import AuthModal from "../components/AuthModal";
import { Button } from "../components/ui/button";
import { BookOpen, Sparkles, Globe, Palette, Download, Heart } from "lucide-react";

const HERO_IMAGE = "https://static.prod-images.emergentagent.com/jobs/29fd7301-9062-4a24-87a1-30ba6782dc07/images/75495906e8067d9a8d127a106ed04fefd4b7326df3ab9191be35a2a8e9850985.png";

const FEATURES = [
  {
    icon: Globe,
    title: "7 Indian Languages",
    desc: "Stories written natively in Hindi, Kannada, Tamil, Telugu, Marathi, Bengali & English",
    color: "#3730A3",
  },
  {
    icon: Sparkles,
    title: "AI-Powered Stories",
    desc: "Personalized adventures featuring your child as the hero of every tale",
    color: "#FF9F1C",
  },
  {
    icon: Palette,
    title: "Beautiful Illustrations",
    desc: "Every page brought to life with AI-generated colorful artwork",
    color: "#2A9D8F",
  },
  {
    icon: Download,
    title: "Download & Share",
    desc: "Export your storybook as PDF to print, gift, or share with family",
    color: "#E76F51",
  },
];

const LANGUAGES_PREVIEW = [
  { code: "hi", native: "\u0939\u093f\u0928\u094d\u0926\u0940", name: "Hindi" },
  { code: "kn", native: "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1", name: "Kannada" },
  { code: "ta", native: "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd", name: "Tamil" },
  { code: "te", native: "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41", name: "Telugu" },
  { code: "bn", native: "\u09ac\u09be\u0982\u09b2\u09be", name: "Bengali" },
  { code: "mr", native: "\u092e\u0930\u093e\u0920\u0940", name: "Marathi" },
  { code: "en", native: "English", name: "English" },
];

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#FDFBF7]/80 border-b border-[#F3E8FF]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-icon.svg" alt="Tingu Tales" className="w-10 h-10" />
            <span
              className="text-2xl font-semibold tracking-tight text-[#1E1B4B]"
              style={{ fontFamily: "Fredoka" }}
            >
              Tingu <span className="text-[#FF9F1C]">Tales</span>
            </span>
          </div>
          <Button
            data-testid="btn-google-login-nav"
            onClick={() => setShowAuth(true)}
            className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold px-6 min-h-[44px]"
          >
            Get Started
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center pt-20">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        />
        <div className="absolute inset-0 hero-overlay" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 w-full">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 mb-8 animate-fade-in-up">
              <Heart className="w-4 h-4 text-[#FF9F1C]" strokeWidth={2.5} />
              <span className="text-sm text-white/90 font-medium tracking-wide">
                Stories in your mother tongue
              </span>
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl tracking-tight font-semibold text-white mb-6 animate-fade-in-up stagger-2"
              style={{ fontFamily: "Fredoka" }}
            >
              Personalized Storybooks for Your Little One
            </h1>
            <p className="text-base sm:text-lg leading-relaxed text-white/85 mb-10 max-w-lg animate-fade-in-up stagger-3">
              Create magical illustrated stories featuring your child as the hero,
              written natively in Indian languages they love.
            </p>
            <div className="flex flex-wrap gap-4 animate-fade-in-up stagger-4">
              <Button
                data-testid="btn-google-login-hero"
                onClick={() => setShowAuth(true)}
                className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold text-lg px-8 min-h-[56px] shadow-lg hover:shadow-xl transition-all"
              >
                <Sparkles className="w-5 h-5 mr-2" strokeWidth={2.5} />
                Create Your First Story
              </Button>
            </div>

            {/* Language pills */}
            <div className="flex flex-wrap gap-2 mt-10 animate-fade-in-up stagger-5">
              {LANGUAGES_PREVIEW.map((lang) => (
                <span
                  key={lang.code}
                  className="font-native inline-block bg-white/12 backdrop-blur-sm text-white/90 rounded-full px-3 py-1.5 text-sm border border-white/15"
                >
                  {lang.native}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <span className="text-sm uppercase tracking-[0.2em] font-bold text-[#FF9F1C] mb-4 block">
            How it works
          </span>
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl tracking-tight font-medium text-[#1E1B4B]"
            style={{ fontFamily: "Fredoka" }}
          >
            Stories that speak their language
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="bg-white rounded-3xl p-8 border-2 border-[#F3E8FF] card-hover"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                style={{ backgroundColor: f.color + "15" }}
              >
                <f.icon className="w-7 h-7" style={{ color: f.color }} strokeWidth={2.5} />
              </div>
              <h3
                className="text-xl font-medium text-[#1E1B4B] mb-3"
                style={{ fontFamily: "Fredoka" }}
              >
                {f.title}
              </h3>
              <p className="text-[#1E1B4B]/65 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="bg-[#3730A3] rounded-3xl p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-4 left-8 w-3 h-3 bg-[#FF9F1C] rounded-full" />
            <div className="absolute top-12 right-16 w-2 h-2 bg-white rounded-full" />
            <div className="absolute bottom-8 left-1/4 w-4 h-4 bg-[#2A9D8F] rounded-full" />
            <div className="absolute bottom-16 right-1/3 w-2 h-2 bg-[#FF9F1C] rounded-full" />
          </div>
          <div className="relative z-10">
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl tracking-tight font-semibold text-white mb-4"
              style={{ fontFamily: "Fredoka" }}
            >
              Ready to create magic?
            </h2>
            <p className="text-white/75 mb-8 max-w-md mx-auto">
              Your child&apos;s personalized storybook is just a few clicks away.
            </p>
            <Button
              data-testid="btn-google-login-cta"
              onClick={() => setShowAuth(true)}
              className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold text-lg px-8 min-h-[56px]"
            >
              Start Creating Now
            </Button>
          </div>
        </div>
      </section>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />

      {/* Footer */}
      <footer className="border-t border-[#F3E8FF] py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-[#1E1B4B]/50">
          <div className="flex items-center gap-2">
            <img src="/logo-icon.svg" alt="" className="w-6 h-6" />
            <span style={{ fontFamily: "Fredoka" }}>Tingu <span className="text-[#FF9F1C]">Tales</span></span>
          </div>
          <p>Made with love for little readers</p>
        </div>
      </footer>
    </div>
  );
}
