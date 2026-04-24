export type FAQ = {
  question: string;
  answer: string;
};

export type FAQGroup = {
  title: string;
  description: string;
  faqs: FAQ[];
};

export const FAQ_GROUPS: FAQGroup[] = [
  {
    title: "Creating Stories",
    description: "How Tingu Tales turns your child into the hero of a personalized book.",
    faqs: [
      {
        question: "What is Tingu Tales?",
        answer:
          "Tingu Tales is an AI storybook creator that turns your child into the hero of personalized, illustrated stories.",
      },
      {
        question: "How does Tingu Tales create a storybook?",
        answer:
          "You choose your child's details, language, interests, and story style. Tingu Tales then creates a personalized story draft, generates illustrations, and prepares a storybook you can review and download.",
      },
      {
        question: "Is the story content matched to my child's age?",
        answer:
          "Yes. Tingu Tales adjusts the story's vocabulary, sentence length, and tone based on your child's age. For example, a story for a 3-year-old uses simpler words, shorter sentences, and gentle concepts that are easier for them to follow.",
      },
      {
        question: "Is Tingu Tales suitable for young children?",
        answer:
          "Yes. The stories are designed to be warm, age-appropriate, and easy for children to enjoy with parents.",
      },
    ],
  },
  {
    title: "Languages & Downloads",
    description: "Languages, PDFs, printing, and sharing your finished storybook.",
    faqs: [
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
        question: "Can I see examples before creating a story?",
        answer:
          "Yes. Visit the Sample Stories page to open finished PDF examples and preview the kind of illustrated storybook Tingu Tales can create.",
      },
    ],
  },
  {
    title: "Payments & Refunds",
    description: "How checkout, review, corrections, and refund requests work.",
    faqs: [
      {
        question: "When do I pay for the storybook?",
        answer:
          "Payment is collected securely through Razorpay before illustration generation starts because image generation is the expensive part of creating your book. After payment, your illustrated pages are generated.",
      },
      {
        question: "Why is payment collected before image generation?",
        answer:
          "The illustrated pages require paid AI image generation resources. Charging before illustration generation lets us create the full visual storybook while still giving you a review step after the pages are ready.",
      },
      {
        question: "How does the refund process work?",
        answer:
          "After the images are generated, you can review every page. If you notice AI image defects, submit a refund request from the review screen. Our team will review it and may correct or regenerate defective pages, resend an updated storybook link, or process an eligible refund.",
      },
      {
        question: "Can pages be corrected instead of refunded?",
        answer:
          "Yes. If defective pages are found, our team may correct or regenerate those pages and resend an updated storybook link so you can still receive the right book for your child.",
      },
    ],
  },
  {
    title: "Privacy & Safety",
    description: "How child photos and family data are handled.",
    faqs: [
      {
        question: "How does Tingu Tales protect child privacy?",
        answer:
          "We take child privacy seriously. The uploaded child photo is deleted immediately after avatar creation, and we do not share your data with anyone.",
      },
      {
        question: "Do you share my child's photo or story data?",
        answer:
          "No. Child photos are used only for avatar creation and are deleted immediately after that step. Your data is not shared with third parties.",
      },
      {
        question: "Can I contact the team before creating a story?",
        answer:
          "Yes. Use the Contact button on the homepage to send your question, and the Tingu Tales team will get back to you.",
      },
    ],
  },
];

export const HOMEPAGE_FAQS: FAQ[] = [
  FAQ_GROUPS[0].faqs[0],
  FAQ_GROUPS[1].faqs[0],
  FAQ_GROUPS[0].faqs[2],
  FAQ_GROUPS[1].faqs[1],
  FAQ_GROUPS[2].faqs[2],
  FAQ_GROUPS[3].faqs[0],
];

export const ALL_FAQS: FAQ[] = FAQ_GROUPS.flatMap((group) => group.faqs);

export function createFAQPageJsonLd(url: string, pageId: string = `${url}#faq`) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": pageId,
    url,
    mainEntity: ALL_FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}
