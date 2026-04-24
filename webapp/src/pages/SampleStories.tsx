import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { ArrowLeft, BookOpen, ExternalLink, FileText, Sparkles } from "lucide-react";
import Seo from "../components/Seo";
import { Button } from "../components/ui/button";
import { db } from "../firebase";

type SampleStory = {
  id: string;
  title: string;
  pdfLink: string;
};

const SAMPLE_STORIES_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Sample Storybooks - Tingu Tales",
  url: "https://tingutales.com/sample-stories",
  description:
    "Read sample Tingu Tales PDFs and preview the illustrated, age-friendly storybooks parents can create for children.",
  isPartOf: {
    "@type": "WebSite",
    name: "Tingu Tales",
    url: "https://tingutales.com/",
  },
};

export default function SampleStories() {
  const [stories, setStories] = useState<SampleStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const loadSampleStories = async () => {
      try {
        const snapshot = await getDocs(collection(db, "sample_stories"));
        const sampleStories = [...snapshot.docs]
          .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
          .map((doc, index) => {
            const data = doc.data() as Record<string, unknown>;
            const pdfLink = typeof data.pdf_link === "string" ? data.pdf_link.trim() : "";
            const title = typeof data.title === "string" && data.title.trim()
              ? data.title.trim()
              : `Sample Story ${index + 1}`;

            return { id: doc.id, title, pdfLink };
          })
          .filter((story) => story.pdfLink.length > 0);

        setStories(sampleStories);
        setLoadError(false);
      } catch (err) {
        console.error("Failed to load sample stories", err);
        setLoadError(true);
        setStories([]);
      } finally {
        setLoading(false);
      }
    };

    void loadSampleStories();
  }, []);

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <Seo
        title="Sample Storybooks - Tingu Tales"
        description="Read sample Tingu Tales PDFs and preview the illustrated, age-friendly storybooks parents can create for children."
        canonicalUrl="https://tingutales.com/sample-stories"
        jsonLd={SAMPLE_STORIES_JSON_LD}
      />
      <nav className="sticky top-0 z-50 border-b border-[#F3E8FF] bg-[#FDFBF7]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src="/favicon.png" alt="Tingu Tales" className="h-10 w-10" />
            <span
              className="hidden text-2xl font-semibold tracking-tight text-[#1E1B4B] sm:inline"
              style={{ fontFamily: "Fredoka" }}
            >
              Tingu <span className="text-[#FF9F1C]">Tales</span>
            </span>
          </Link>
          <Button asChild variant="outline" className="rounded-full border-[#1E1B4B]/15 px-5 font-semibold text-[#1E1B4B] hover:bg-[#1E1B4B]/5">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
              Home
            </Link>
          </Button>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-16">
        <section className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#FF9F1C]/15 px-4 py-2 text-sm font-bold text-[#1E1B4B]">
            <Sparkles className="h-4 w-4 text-[#FF9F1C]" strokeWidth={2.5} />
            Read before you create
          </div>
          <h1
            className="text-4xl font-semibold tracking-tight text-[#1E1B4B] sm:text-5xl"
            style={{ fontFamily: "Fredoka" }}
          >
            Sample Storybooks
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#1E1B4B]/70 sm:text-lg">
            Browse a few finished Tingu Tales storybooks and see the kind of illustrated, age-friendly stories your child can receive.
          </p>
        </section>

        <section className="mt-12" aria-label="Sample story PDFs">
          {loading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-56 rounded-3xl bg-[#F3E8FF]/60 animate-shimmer" />
              ))}
            </div>
          ) : loadError ? (
            <div className="mx-auto max-w-xl rounded-3xl border-2 border-[#F3E8FF] bg-white p-8 text-center">
              <FileText className="mx-auto mb-4 h-12 w-12 text-[#E76F51]" strokeWidth={1.8} />
              <h2 className="text-xl font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                Could not load samples
              </h2>
              <p className="mt-2 text-[#1E1B4B]/65">
                Please try again in a moment.
              </p>
            </div>
          ) : stories.length === 0 ? (
            <div className="mx-auto max-w-xl rounded-3xl border-2 border-[#F3E8FF] bg-white p-8 text-center">
              <BookOpen className="mx-auto mb-4 h-12 w-12 text-[#FF9F1C]" strokeWidth={1.8} />
              <h2 className="text-xl font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                Samples coming soon
              </h2>
              <p className="mt-2 text-[#1E1B4B]/65">
                We are preparing sample storybooks for you to read.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {stories.map((story, index) => (
                <article
                  key={story.id}
                  className="flex min-h-64 flex-col justify-between rounded-3xl border-2 border-[#F3E8FF] bg-white p-6 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-lg"
                >
                  <div>
                    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF9F1C]/15">
                      <FileText className="h-7 w-7 text-[#FF9F1C]" strokeWidth={2.5} />
                    </div>
                    <p className="mb-2 text-sm font-bold uppercase tracking-[0.16em] text-[#2A9D8F]">
                      Story {index + 1}
                    </p>
                    <h2 className="text-2xl font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                      {story.title}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-[#1E1B4B]/65">
                      Open the PDF to read this sample storybook in a new tab.
                    </p>
                  </div>
                  <Button asChild className="mt-8 rounded-full bg-[#FF9F1C] font-bold text-[#1E1B4B] hover:bg-[#E88A12]">
                    <a href={story.pdfLink} target="_blank" rel="noopener noreferrer">
                      Read Sample
                      <ExternalLink className="h-4 w-4" strokeWidth={2.5} />
                    </a>
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
