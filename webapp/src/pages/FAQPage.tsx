import { Link } from "react-router-dom";
import { ArrowLeft, HelpCircle, MessageCircle, Sparkles } from "lucide-react";
import Seo from "../components/Seo";
import { Button } from "../components/ui/button";
import { FAQ_GROUPS, createFAQPageJsonLd } from "../content/faqs";

const FAQ_JSON_LD = {
  ...createFAQPageJsonLd("https://tingutales.com/faq", "https://tingutales.com/faq#faq"),
  isPartOf: {
    "@type": "WebSite",
    name: "Tingu Tales",
    url: "https://tingutales.com/",
  },
};

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <Seo
        title="FAQ - Tingu Tales"
        description="Find answers about Tingu Tales story creation, age-appropriate content, Indian languages, PDFs, payments, refunds, privacy, and child photo deletion."
        canonicalUrl="https://tingutales.com/faq"
        jsonLd={FAQ_JSON_LD}
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

      <main className="mx-auto max-w-6xl px-6 py-16">
        <section className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#FF9F1C]/15 px-4 py-2 text-sm font-bold text-[#1E1B4B]">
            <Sparkles className="h-4 w-4 text-[#FF9F1C]" strokeWidth={2.5} />
            Quick answers for parents
          </div>
          <h1
            className="text-4xl font-semibold tracking-tight text-[#1E1B4B] sm:text-5xl"
            style={{ fontFamily: "Fredoka" }}
          >
            Frequently Asked Questions
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#1E1B4B]/70 sm:text-lg">
            Everything you need to know about creating a Tingu Tales storybook, from age-appropriate content to payments, refunds, privacy, and downloads.
          </p>
        </section>

        <div className="mt-14 space-y-12">
          {FAQ_GROUPS.map((group) => (
            <section key={group.title} aria-labelledby={`${group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`}>
              <div className="mb-6 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#3730A3]/10">
                  <HelpCircle className="h-6 w-6 text-[#3730A3]" strokeWidth={2.4} />
                </div>
                <div>
                  <h2
                    id={`${group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`}
                    className="text-2xl font-semibold text-[#1E1B4B]"
                    style={{ fontFamily: "Fredoka" }}
                  >
                    {group.title}
                  </h2>
                  <p className="mt-1 text-[#1E1B4B]/65">{group.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {group.faqs.map((faq) => (
                  <article key={faq.question} className="rounded-2xl border-2 border-[#F3E8FF] bg-white p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-[#1E1B4B]">{faq.question}</h3>
                    <p className="mt-3 leading-relaxed text-[#1E1B4B]/72">{faq.answer}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-16 rounded-3xl bg-[#3730A3] p-8 text-center text-white sm:p-10">
          <MessageCircle className="mx-auto mb-4 h-9 w-9 text-[#FF9F1C]" strokeWidth={2.3} />
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "Fredoka" }}>
            Still have a question?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-white/75">
            Send us your question from the homepage contact form and the Tingu Tales team will get back to you.
          </p>
          <Button asChild className="mt-6 rounded-full bg-[#FF9F1C] px-7 font-bold text-[#1E1B4B] hover:bg-[#E88A12]">
            <Link to="/">Contact us</Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
