import os
import asyncio
import logging
from fpdf import FPDF
from storage import get_object, async_put_object

logger = logging.getLogger(__name__)


class PdfAgent:
    """Assembles all story page images into a single PDF and saves to storage.
    Since text is baked into each page image, the PDF is purely image-based
    with no separate text rendering required."""

    async def run(self, pages, story_id):
        """
        pages: list of {"page_number": int, "image_url": str, ...}
        Returns the storage path of the saved PDF, or "" on failure.
        """
        try:
            logger.info(f"[PdfAgent] Creating PDF for story {story_id} ({len(pages)} pages)")

            sorted_pages = sorted(pages, key=lambda p: p.get("page_number", 0))

            # Download all page images concurrently (non-blocking)
            async def fetch_page(page):
                image_url = page.get("image_url", "")
                if not image_url:
                    return page.get("page_number"), None, None
                try:
                    img_data, content_type = await asyncio.to_thread(get_object, image_url)
                    return page.get("page_number"), img_data, content_type
                except Exception as e:
                    logger.error(f"[PdfAgent] Could not fetch page {page.get('page_number')}: {e}")
                    return page.get("page_number"), None, None

            fetched = await asyncio.gather(*[fetch_page(p) for p in sorted_pages])

            # Assemble PDF in a thread (CPU + disk I/O)
            def build_pdf():
                pdf = FPDF(orientation="P", unit="mm", format="A4")
                pdf.set_auto_page_break(auto=False)
                for page_number, img_data, content_type in fetched:
                    pdf.add_page()
                    if img_data is None:
                        continue
                    ext = "png" if "png" in (content_type or "") else "jpg"
                    temp_path = f"/tmp/pdf_{story_id}_p{page_number}.{ext}"
                    with open(temp_path, "wb") as f:
                        f.write(img_data)
                    pdf.image(temp_path, x=0, y=0, w=210, h=297)
                    os.remove(temp_path)
                return bytes(pdf.output())

            pdf_bytes = await asyncio.to_thread(build_pdf)

            storage_path = f"tingutales/pdfs/{story_id}/storybook.pdf"
            result = await async_put_object(storage_path, pdf_bytes, "application/pdf")
            logger.info(f"[PdfAgent] PDF saved to {storage_path}")
            return result["path"]

        except Exception as e:
            logger.error(f"[PdfAgent] PDF creation failed for story {story_id}: {e}")
            return ""
