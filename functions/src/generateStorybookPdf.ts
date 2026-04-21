import * as logger from "firebase-functions/logger";
import {onTaskDispatched} from "firebase-functions/v2/tasks";
import {FieldValue} from "firebase-admin/firestore";
import {PDFDocument} from "pdf-lib";
import {v4 as uuidv4} from "uuid";
import {admin, db, bucket} from "./admin.js";
import {sendPdfReadyEmail} from "./emailService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PdfTaskPayload {
  storyId: string;
  userId: string;
  totalPages: number;
  /** When true, suppress the PDF-ready email (e.g. admin-triggered regeneration). */
  skipEmail?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a buffer to Storage with a download token, return the public Firebase download URL.
 * @param {string} filePath - The destination path in Cloud Storage.
 * @param {Buffer} data - The file contents to upload.
 * @param {string} contentType - MIME type of the file.
 * @return {Promise<string>} Public Firebase Storage download URL.
 */
async function saveWithDownloadUrl(
  filePath: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const token = uuidv4();
  await bucket.file(filePath).save(data, {
    contentType,
    metadata: {
      metadata: {firebaseStorageDownloadTokens: token},
      cacheControl: "public, max-age=86400",
    },
  });
  const encodedPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF generation task handler
// ─────────────────────────────────────────────────────────────────────────────

export const generateStorybookPdf = onTaskDispatched<PdfTaskPayload>(
  {
    retryConfig: {
      maxAttempts: 2,
      minBackoffSeconds: 30,
    },
    rateLimits: {
      maxConcurrentDispatches: 2,
    },
    region: "asia-south1",
    timeoutSeconds: 540, // 9 minutes — large PDFs with many images take time
    memory: "2GiB",
  },
  async (request) => {
    const {storyId, userId, totalPages} = request.data;

    logger.info(`[generateStorybookPdf] START storyId=${storyId} userId=${userId} totalPages=${totalPages}`);

    // Load all page docs from subcollection, sorted by page index
    const pagesSnap = await db
      .collection("stories")
      .doc(storyId)
      .collection("pages")
      .orderBy("page")
      .get();

    if (pagesSnap.empty) {
      throw new Error(`No pages found for story ${storyId}`);
    }

    type PageDoc = {
      id: string;
      page: number;
      image_url?: string;
      jpeg_url?: string;
      status?: string;
    };

    const pageDocs = (pagesSnap.docs
      .map((d) => ({id: d.id, ...d.data()})) as PageDoc[])
      .sort((a, b) => (a.page ?? 0) - (b.page ?? 0));

    // Download all page JPEGs in parallel (fall back to PNG if no JPEG)
    logger.info(`[generateStorybookPdf] downloading ${pageDocs.length} page images`);

    const imageBuffers = await Promise.all(
      pageDocs.map(async (pageDoc) => {
        const imgPath = `${userId}/${storyId}/pages/${pageDoc.page}/image.jpg`;
        const pngPath = `${userId}/${storyId}/pages/${pageDoc.page}/image.png`;

        // Try JPEG first, fall back to PNG
        for (const path of [imgPath, pngPath]) {
          try {
            const [buf] = await bucket.file(path).download();
            return {pageIndex: pageDoc.page, buffer: buf, isJpeg: path.endsWith(".jpg")};
          } catch {
            // try next
          }
        }
        logger.warn(`[generateStorybookPdf] missing image for page ${pageDoc.page}, using empty page`);
        return {pageIndex: pageDoc.page, buffer: null, isJpeg: false};
      })
    );

    // Build PDF — A4 portrait (595 × 842 pt) scaled to 3:4 book proportions (630 × 840 pt)
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`Story ${storyId}`);
    pdfDoc.setCreationDate(new Date());

    const PAGE_W = 630;
    const PAGE_H = 840;

    for (const {pageIndex, buffer, isJpeg} of imageBuffers) {
      const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

      if (!buffer) {
        // Blank page placeholder
        logger.warn(`[generateStorybookPdf] blank placeholder for page ${pageIndex}`);
        continue;
      }

      try {
        const embeddedImage = isJpeg ?
          await pdfDoc.embedJpg(buffer) :
          await pdfDoc.embedPng(buffer);

        // Scale image to fill the page while preserving aspect ratio
        const imgAspect = embeddedImage.width / embeddedImage.height;
        const pageAspect = PAGE_W / PAGE_H;

        let drawW: number;
        let drawH: number;
        if (imgAspect > pageAspect) {
          // Image is wider — fit height, crop sides visually (centred)
          drawH = PAGE_H;
          drawW = PAGE_H * imgAspect;
        } else {
          // Image is taller — fit width, crop top/bottom (centred)
          drawW = PAGE_W;
          drawH = PAGE_W / imgAspect;
        }

        const x = (PAGE_W - drawW) / 2;
        const y = (PAGE_H - drawH) / 2;

        page.drawImage(embeddedImage, {x, y, width: drawW, height: drawH});
      } catch (imgErr) {
        logger.error(`[generateStorybookPdf] failed to embed image for page ${pageIndex}`, imgErr);
        // Continue — blank page already added above
      }
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    logger.info(`[generateStorybookPdf] PDF generated — ${(pdfBuffer.length / 1024).toFixed(0)} KB`);

    // Save PDF to GCS: {userId}/{storyId}/storybook.pdf
    const pdfPath = `${userId}/${storyId}/storybook.pdf`;
    const pdfUrl = await saveWithDownloadUrl(pdfPath, pdfBuffer, "application/pdf");
    logger.info(`[generateStorybookPdf] PDF saved to ${pdfPath}`);

    // Build pages array from subcollection docs (for story.pages on the story document)
    const storyPagesSummary = pageDocs.map((p) => ({
      page_number: p.page,
      image_url: p.image_url ?? null,
      jpeg_url: p.jpeg_url ?? null,
      status: p.status ?? "completed",
    }));

    // Mark story as completed with pdf_url and denormalised pages array
    await db.collection("stories").doc(storyId).update({
      status: "completed",
      pdf_url: pdfUrl,
      pages: storyPagesSummary,
      updated_at: FieldValue.serverTimestamp(),
    });

    // Send PDF-ready email to the user (best-effort, non-fatal)
    // Skipped when the PDF was regenerated by an admin (they will send the correction email manually).
    if (!request.data.skipEmail) {
      try {
        const storySnap = await db.collection("stories").doc(storyId).get();
        const story = storySnap.data() ?? {};
        const authUser = await admin.auth().getUser(userId);
        const userEmail = authUser.email ?? "";
        const coverPage = storyPagesSummary.find((p) => p.page_number === 0);
        const coverImageUrl = coverPage?.jpeg_url || coverPage?.image_url || null;
        if (userEmail) {
          await sendPdfReadyEmail({
            userEmail,
            storyTitle: story.title ?? "Your Storybook",
            childName: story.child_name ?? "your child",
            pdfUrl,
            storyId,
            coverImageUrl,
          });
        }
      } catch (emailErr) {
        logger.warn("[generateStorybookPdf] PDF-ready email failed (non-fatal)", emailErr);
      }
    } else {
      logger.info(`[generateStorybookPdf] skipEmail=true — PDF-ready email suppressed for story ${storyId}`);
    }

    logger.info(`[generateStorybookPdf] DONE storyId=${storyId} — status=completed`);
  }
);
