import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import AuthModal from "../components/AuthModal";
import { Button } from "../components/ui/button";
import { BookOpen, Sparkles, Globe, Palette, Download, Heart } from "lucide-react";
import { db } from "../firebase";
import { Analytics } from "../lib/analytics";

const FEATURES = [
  {
    icon: Globe,
    title: "9 Story Languages",
    desc: "Generate stories in English, Hindi, Kannada, Tamil, Telugu, Marathi, Bengali, Gujarati, and Malayalam",
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
  { code: "en", native: "English", name: "English" },
  { code: "hi", native: "\u0939\u093f\u0928\u094d\u0926\u0940", name: "Hindi" },
  { code: "kn", native: "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1", name: "Kannada" },
  { code: "ta", native: "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd", name: "Tamil" },
  { code: "te", native: "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41", name: "Telugu" },
  { code: "mr", native: "\u092e\u0930\u093e\u0920\u0940", name: "Marathi" },
  { code: "bn", native: "\u09ac\u09be\u0982\u09b2\u09be", name: "Bengali" },
  { code: "gu", native: "\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0", name: "Gujarati" },
  { code: "ml", native: "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02", name: "Malayalam" },
];

const FAQS = [
  {
    question: "What is Tingu Tales?",
    answer:
      "Tingu Tales is an AI storybook creator that turns your child into the hero of personalized, illustrated stories.",
  },
  {
    question: "Which languages are available?",
    answer:
      "You can create stories in 9 languages: English, Hindi, Kannada, Tamil, Telugu, Marathi, Bengali, Gujarati, and Malayalam.",
  },
  {
    question: "Can I download and print the storybook?",
    answer:
      "Yes. Every storybook can be downloaded as a PDF so you can print it, gift it, or share it with family.",
  },
  {
    question: "Is Tingu Tales suitable for young children?",
    answer:
      "Yes. The stories are designed to be warm, age-appropriate, and easy for children to enjoy with parents.",
  },
  {
    question: "How does Tingu Tales protect child privacy?",
    answer:
      "We take child privacy seriously. The uploaded child photo is deleted immediately after avatar creation, and we do not share your data with anyone.",
  },
];

const YOUTUBE_URL = "https://www.youtube.com/@TinguTalesOfficial";

function YouTubeLogo() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6 shrink-0"
      viewBox="0 0 28 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M27.42 3.12A3.49 3.49 0 0 0 24.96.66C22.78.08 14 .08 14 .08S5.22.08 3.04.66A3.49 3.49 0 0 0 .58 3.12C0 5.3 0 9.85 0 9.85s0 4.55.58 6.73a3.49 3.49 0 0 0 2.46 2.46c2.18.58 10.96.58 10.96.58s8.78 0 10.96-.58a3.49 3.49 0 0 0 2.46-2.46c.58-2.18.58-6.73.58-6.73s0-4.55-.58-6.73Z"
        fill="#FF0000"
      />
      <path d="m11.2 14.05 7.28-4.2-7.28-4.2v8.4Z" fill="white" />
    </svg>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    phoneNumber: "",
    email: "",
    query: "",
  });
  const [sampleCoverUrls, setSampleCoverUrls] = useState<string[]>([]);

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    const loadSampleCovers = async () => {
      try {
        const snapshot = await getDocs(collection(db, "sample_covers"));
        const sortedDocs = [...snapshot.docs].sort((a, b) => {
          const aNum = Number(a.id.replace(/^sample_/, ""));
          const bNum = Number(b.id.replace(/^sample_/, ""));
          if (Number.isNaN(aNum) || Number.isNaN(bNum)) return a.id.localeCompare(b.id);
          return aNum - bNum;
        });

        const urls = sortedDocs
          .map((doc) => {
            const data = doc.data() as Record<string, unknown>;
            const url = data.url;
            return typeof url === "string" ? url.trim() : "";
          })
          .filter((url) => url.length > 0)
          .slice(0, 8);

        setSampleCoverUrls(urls);
      } catch (err) {
        console.error("Failed to load sample covers", err);
        setSampleCoverUrls([]);
      }
    };

    void loadSampleCovers();
  }, []);

  const resetContactState = () => {
    setContactSubmitted(false);
    setContactSubmitting(false);
    setContactForm({
      name: "",
      phoneNumber: "",
      email: "",
      query: "",
    });
  };

  const handleSubmitContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const name = contactForm.name.trim();
    const phoneNumber = contactForm.phoneNumber.trim();
    const email = contactForm.email.trim().toLowerCase();
    const queryText = contactForm.query.trim();

    if (!name || !phoneNumber || !email || !queryText) return;

    setContactSubmitting(true);
    try {
      await addDoc(collection(db, "contacts"), {
        name,
        phone_number: phoneNumber,
        email,
        query: queryText,
        source: "landing_page",
        status: "new",
        created_at: serverTimestamp(),
      });
      Analytics.contactFormSubmitted();
      setContactSubmitted(true);
    } catch (err) {
      console.error("Failed to submit contact form", err);
      alert("Could not submit right now. Please try again in a moment.");
    } finally {
      setContactSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#FDFBF7]/80 border-b border-[#F3E8FF]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="Tingu Tales" className="w-10 h-10" />
            <span
              className="text-2xl font-semibold tracking-tight text-[#1E1B4B]"
              style={{ fontFamily: "Fredoka" }}
            >
              Tingu <span className="text-[#FF9F1C]">Tales</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              type="button"
              onClick={() => {
                resetContactState();
                setShowContactForm(true);
              }}
              variant="outline"
              className="rounded-full border-[#1E1B4B]/15 text-[#1E1B4B] hover:bg-[#1E1B4B]/5 font-semibold px-4 sm:px-6 min-h-[44px]"
            >
              Contact
            </Button>
            <Button
              data-testid="btn-google-login-nav"
              onClick={() => { Analytics.getStartedClicked(); setShowAuth(true); }}
              className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold px-6 min-h-[44px]"
            >
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center pt-20">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/landing-hero.png')" }}
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
              generated in 9 languages they understand and love.
            </p>
            <div className="flex flex-wrap gap-4 animate-fade-in-up stagger-4">
              <Button
                data-testid="btn-google-login-hero"
                onClick={() => { Analytics.getStartedClicked(); setShowAuth(true); }}
                className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold text-lg px-8 min-h-[56px] shadow-lg hover:shadow-xl transition-all"
              >
                <Sparkles className="w-5 h-5 mr-2" strokeWidth={2.5} />
                Create Your First Story
              </Button>
              <a
                href={YOUTUBE_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit Tingu Tales on YouTube"
                className="inline-flex min-h-[56px] items-center gap-2 rounded-full border border-white/25 bg-white/15 px-6 text-lg font-bold text-white backdrop-blur-sm transition-all hover:bg-white/25 hover:shadow-xl"
              >
                <YouTubeLogo />
                <span>Watch on YouTube</span>
              </a>
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

      {/* Sample Covers */}
      <section className="max-w-7xl mx-auto px-6 py-16" aria-label="Sample generated storybook covers">
        <div className="text-center mb-10">
          <span className="text-sm uppercase tracking-[0.2em] font-bold text-[#FF9F1C] mb-3 block">
            Sample covers
          </span>
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl tracking-tight font-medium text-[#1E1B4B]"
            style={{ fontFamily: "Fredoka" }}
          >
            A few storybooks our customers loved
          </h2>
        </div>

        {sampleCoverUrls.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {sampleCoverUrls.map((url, index) => (
              <article
                key={`${url}-${index}`}
                className="bg-white rounded-2xl overflow-hidden border-2 border-[#F3E8FF] shadow-sm max-w-[180px] md:max-w-[200px] mx-auto w-full"
              >
                <img
                  src={url}
                  alt={`Sample generated storybook cover ${index + 1}`}
                  className="w-full aspect-[3/4] object-contain bg-[#FDFBF7]"
                  loading="lazy"
                />
              </article>
            ))}
          </div>
        ) : (
          <p className="text-center text-[#1E1B4B]/65">
            Sample covers will appear here after you add documents like sample_0 and sample_1 in the sample_covers collection.
          </p>
        )}
      </section>

      {/* FAQ for AEO */}
      <section className="max-w-5xl mx-auto px-6 pb-24" aria-label="Frequently asked questions">
        <div className="text-center mb-12">
          <span className="text-sm uppercase tracking-[0.2em] font-bold text-[#FF9F1C] mb-4 block">
            Quick answers
          </span>
          <h2
            className="text-2xl sm:text-3xl tracking-tight font-medium text-[#1E1B4B]"
            style={{ fontFamily: "Fredoka" }}
          >
            Frequently asked questions about Tingu Tales
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FAQS.map((faq) => (
            <article key={faq.question} className="bg-white border-2 border-[#F3E8FF] rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-[#1E1B4B] mb-2">{faq.question}</h3>
              <p className="text-[#1E1B4B]/75 leading-relaxed">{faq.answer}</p>
            </article>
          ))}
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
              onClick={() => { Analytics.getStartedClicked(); setShowAuth(true); }}
              className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold text-lg px-8 min-h-[56px]"
            >
              Start Creating Now
            </Button>
          </div>
        </div>
      </section>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />

      {showContactForm && (
        <div className="fixed inset-0 z-[70] bg-[#1E1B4B]/55 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-3xl bg-white border-2 border-[#F3E8FF] shadow-2xl p-6 sm:p-8 relative">
            <button
              type="button"
              aria-label="Close contact form"
              onClick={() => setShowContactForm(false)}
              className="absolute top-4 right-4 text-[#1E1B4B]/45 hover:text-[#1E1B4B] text-2xl leading-none"
            >
              ×
            </button>

            {!contactSubmitted ? (
              <>
                <h3 className="text-2xl font-semibold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fredoka" }}>
                  Contact us
                </h3>
                <p className="text-sm text-[#1E1B4B]/60 mb-5">
                  Share your details and question. Our team will reach out soon.
                </p>

                <form className="space-y-4" onSubmit={handleSubmitContact}>
                  <input
                    type="text"
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Your name"
                    className="w-full rounded-xl border-2 border-[#F3E8FF] px-4 py-3 text-sm text-[#1E1B4B] placeholder:text-[#1E1B4B]/35 focus:outline-none focus:border-[#3730A3]/35"
                  />
                  <input
                    type="tel"
                    required
                    value={contactForm.phoneNumber}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                    placeholder="Phone number"
                    className="w-full rounded-xl border-2 border-[#F3E8FF] px-4 py-3 text-sm text-[#1E1B4B] placeholder:text-[#1E1B4B]/35 focus:outline-none focus:border-[#3730A3]/35"
                  />
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Email address"
                    className="w-full rounded-xl border-2 border-[#F3E8FF] px-4 py-3 text-sm text-[#1E1B4B] placeholder:text-[#1E1B4B]/35 focus:outline-none focus:border-[#3730A3]/35"
                  />
                  <textarea
                    required
                    rows={4}
                    value={contactForm.query}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, query: e.target.value }))}
                    placeholder="Your query"
                    className="w-full rounded-xl border-2 border-[#F3E8FF] px-4 py-3 text-sm text-[#1E1B4B] placeholder:text-[#1E1B4B]/35 focus:outline-none focus:border-[#3730A3]/35 resize-none"
                  />

                  <Button
                    type="submit"
                    disabled={contactSubmitting}
                    className="w-full rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold min-h-[48px]"
                  >
                    {contactSubmitting ? "Submitting..." : "Submit"}
                  </Button>
                </form>
              </>
            ) : (
              <div className="py-8 text-center">
                <h3 className="text-2xl font-semibold text-[#1E1B4B] mb-2" style={{ fontFamily: "Fredoka" }}>
                  Thank you!
                </h3>
                <p className="text-[#1E1B4B]/65 mb-6">
                  Our team will get back to you shortly.
                </p>
                <Button
                  type="button"
                  onClick={() => setShowContactForm(false)}
                  className="rounded-full bg-[#3730A3] hover:bg-[#2f2a8c] text-white px-8"
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#F3E8FF] py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-[#1E1B4B]/50">
          <div className="flex items-center gap-2">
            <img src="/favicon.png" alt="" className="w-6 h-6" />
            <span style={{ fontFamily: "Fredoka" }}>Tingu <span className="text-[#FF9F1C]">Tales</span></span>
          </div>
          <div className="text-right">
            <p>Made with love for little readers</p>
            <p className="mt-0.5 text-xs">
              by{" "}
              <a
                href="https://www.linkedin.com/in/achints/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#1E1B4B]/70 hover:text-[#3730A3] transition-colors"
              >
                Achint Setia
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
