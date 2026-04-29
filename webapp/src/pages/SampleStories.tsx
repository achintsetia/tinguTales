import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { ArrowLeft, BookOpen, FileText, Sparkles } from "lucide-react";
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

function getPdfEmbedUrl(pdfLink: string) {
  const separator = pdfLink.includes("#") ? "&" : "#";
  return `${pdfLink}${separator}toolbar=0&navpanes=0&download=0&print=0&view=FitH`;
}

export default function SampleStories() {
  const [stories, setStories] = useState<SampleStory[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
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

  useEffect(() => {
    if (
      stories.length > 0 &&
      (!selectedStoryId || !stories.some((story) => story.id === selectedStoryId))
    ) {
      setSelectedStoryId(stories[0].id);
    }
  }, [selectedStoryId, stories]);

  const selectedStory = stories.find((story) => story.id === selectedStoryId) ?? stories[0];

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
          ) : selectedStory ? (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-3">
                {stories.map((story, index) => {
                  const isSelected = story.id === selectedStory.id;

                  return (
                    <button
                      key={story.id}
                      type="button"
                      onClick={() => setSelectedStoryId(story.id)}
                      className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                        isSelected
                          ? "border-[#FF9F1C] bg-[#FFF7E8] shadow-sm"
                          : "border-[#F3E8FF] bg-white hover:border-[#FF9F1C]/55 hover:bg-[#FFF7E8]/55"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9F1C]/15">
                          <FileText className="h-5 w-5 text-[#FF9F1C]" strokeWidth={2.5} />
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[#2A9D8F]">
                            Story {index + 1}
                          </p>
                          <h2 className="text-lg font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                            {story.title}
                          </h2>
                          <p className="mt-1 text-sm text-[#1E1B4B]/60">
                            {isSelected ? "Currently previewing" : "Preview on this page"}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <article className="overflow-hidden rounded-3xl border-2 border-[#F3E8FF] bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b border-[#F3E8FF] bg-[#FDFBF7] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2A9D8F]">
                      PDF preview
                    </p>
                    <h2 className="text-xl font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                      {selectedStory.title}
                    </h2>
                  </div>
                  <p className="text-sm text-[#1E1B4B]/55">
                    Scroll inside the preview to read
                  </p>
                </div>
                <div className="relative h-[72vh] min-h-[520px] bg-[#F3E8FF]/35">
                  <iframe
                    key={selectedStory.id}
                    src={getPdfEmbedUrl(selectedStory.pdfLink)}
                    title={`${selectedStory.title} PDF preview`}
                    className="h-full w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </article>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
