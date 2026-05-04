import sharp from "sharp";
import type {PageImageTaskPayload} from "./_pageImageCore.js";

interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DetectedRegion extends Region {
  confidence: number;
  meanLuma: number;
  useFallbackBox: boolean;
}

interface TextLayerSpec extends Region {
  text: string;
  align: "left" | "center";
  font: string;
}

interface OverlayResult {
  imageBuffer: Buffer;
  region: DetectedRegion;
}

const MIN_FONT_SIZE = 22;
const MAX_FONT_SIZE = 36;

/**
 * Rounds a dimension while keeping it at least one pixel.
 * @param {number} value - Raw dimension.
 * @return {number} Rounded dimension.
 */
function round(value: number): number {
  return Math.max(1, Math.round(value));
}

/**
 * Escapes text for Sharp/Pango markup.
 * @param {string} text - Raw text.
 * @return {string} Escaped markup text.
 */
function escapeMarkup(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Checks whether this page should receive deterministic text overlay.
 * @param {PageImageTaskPayload} payload - Page image task payload.
 * @return {boolean} Whether story text should be rendered.
 */
function hasTextToRender(payload: PageImageTaskPayload): boolean {
  return payload.pageType === "story" && payload.text.trim().length > 0;
}

/**
 * Builds the fixed bottom caption region for story text.
 * @param {PageImageTaskPayload} payload - Page image task payload.
 * @param {number} width - Image width.
 * @param {number} height - Image height.
 * @return {DetectedRegion} Caption region.
 */
function buildCaptionRegion(
  payload: PageImageTaskPayload,
  width: number,
  height: number
): DetectedRegion {
  const textLength = payload.text.trim().length;
  const heightPct = textLength > 150 ? 0.28 : textLength > 100 ? 0.25 : textLength > 70 ? 0.22 : 0.18;
  const regionHeight = round(height * heightPct);

  return {
    left: 0,
    top: height - regionHeight,
    width,
    height: regionHeight,
    confidence: 1,
    meanLuma: 255,
    useFallbackBox: true,
  };
}

/**
 * Creates the fixed caption panel.
 * @param {Region} region - Text region.
 * @return {Buffer} SVG buffer.
 */
function buildCaptionPanelSvg(region: Region): Buffer {
  const svg =
    `<svg width="${region.width}" height="${region.height}" xmlns="http://www.w3.org/2000/svg">` +
    "<defs>" +
    "<linearGradient id=\"paper\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">" +
    "<stop offset=\"0\" stop-color=\"rgba(255,252,242,0.97)\"/>" +
    "<stop offset=\"1\" stop-color=\"rgba(255,244,219,0.96)\"/>" +
    "</linearGradient>" +
    "</defs>" +
    `<rect x="0" y="0" width="${region.width}" height="${region.height}" ` +
    "fill=\"url(#paper)\"/>" +
    `<rect x="0" y="0" width="${region.width}" height="5" fill="rgba(158,105,42,0.34)"/>` +
    `<rect x="0" y="8" width="${region.width}" height="1.5" fill="rgba(255,255,255,0.58)"/>` +
    "</svg>";

  return Buffer.from(svg);
}

/**
 * Checks whether the text is mostly Latin-script.
 * @param {string} text - Story text.
 * @return {boolean} Whether a Latin display font is appropriate.
 */
function isMostlyLatinText(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true;

  const latinLetters = text.match(/[A-Za-z]/g) ?? [];
  return latinLetters.length / letters.length >= 0.72;
}

/**
 * Estimates wrapped line count for font sizing.
 * @param {string} text - Text to estimate.
 * @param {number} maxCharsPerLine - Estimated characters per line.
 * @return {number} Estimated line count.
 */
function estimateLineCount(text: string, maxCharsPerLine: number): number {
  const paragraphs = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (paragraphs.length === 0) return 1;

  return paragraphs.reduce((total, paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let lines = 1;
    let currentLength = 0;

    for (const word of words) {
      if (word.length > maxCharsPerLine) {
        lines += Math.max(Math.ceil(word.length / maxCharsPerLine) - 1, 0);
        currentLength = word.length % maxCharsPerLine;
        continue;
      }

      const nextLength = currentLength === 0 ? word.length : currentLength + 1 + word.length;
      if (nextLength > maxCharsPerLine) {
        lines++;
        currentLength = word.length;
      } else {
        currentLength = nextLength;
      }
    }

    return total + lines;
  }, 0);
}

/**
 * Chooses a font size that fits the text inside the caption panel.
 * @param {string} text - Story text.
 * @param {number} width - Available text width.
 * @param {number} height - Available text height.
 * @return {number} Font size.
 */
function chooseFontSize(text: string, width: number, height: number): number {
  for (let fontSize = MAX_FONT_SIZE; fontSize >= MIN_FONT_SIZE; fontSize -= 2) {
    const widthFactor = isMostlyLatinText(text) ? 0.58 : 0.62;
    const maxCharsPerLine = Math.max(8, Math.floor(width / (fontSize * widthFactor)));
    const lineCount = estimateLineCount(text, maxCharsPerLine);
    if (lineCount * fontSize * 1.22 <= height) {
      return fontSize;
    }
  }

  return MIN_FONT_SIZE;
}

/**
 * Builds a child-friendly Pango font descriptor.
 * @param {string} text - Story text.
 * @param {number} fontSize - Font size.
 * @param {boolean} isLongText - Whether the text needs a lighter weight.
 * @return {string} Pango font descriptor.
 */
function buildStoryFont(text: string, fontSize: number): string {
  if (isMostlyLatinText(text)) {
    return `Comic Sans MS Bold ${fontSize}`;
  }

  return `Sans Bold ${fontSize}`;
}

/**
 * Builds Sharp text overlays for the chosen text region.
 * @param {PageImageTaskPayload} payload - Page image task payload.
 * @param {DetectedRegion} region - Detected text region.
 * @return {TextLayerSpec[]} Text layer specifications.
 */
function buildTextLayers(
  payload: PageImageTaskPayload,
  region: DetectedRegion
): TextLayerSpec[] {
  const padX = round(region.width * 0.08);
  const padY = round(region.height * 0.10);
  const innerLeft = region.left + padX;
  const innerTop = region.top + padY;
  const innerWidth = Math.max(region.width - padX * 2, 1);
  const innerHeight = Math.max(region.height - padY * 2, 1);
  const text = payload.text.trim();
  const fontSize = chooseFontSize(text, innerWidth, innerHeight);
  const isLongText = text.length > 80;

  return [{
    text,
    left: innerLeft,
    top: innerTop,
    width: innerWidth,
    height: innerHeight,
    align: isLongText ? "left" : "center",
    font: buildStoryFont(text, fontSize),
  }];
}

/**
 * Wraps escaped text in a colored Pango span.
 * @param {string} text - Raw text.
 * @param {string} textColor - Text color.
 * @return {string} Pango markup.
 */
function buildTextMarkup(text: string, textColor: string): string {
  return `<span foreground="${textColor}">${escapeMarkup(text)}</span>`;
}

/**
 * Renders story text onto a generated page image deterministically.
 * @param {Buffer} imageBuffer - Generated page image.
 * @param {PageImageTaskPayload} payload - Page image task payload.
 * @return {Promise<OverlayResult>} Composited image and chosen region.
 */
export async function renderDeterministicPageText(
  imageBuffer: Buffer,
  payload: PageImageTaskPayload
): Promise<OverlayResult> {
  if (!hasTextToRender(payload)) {
    return {
      imageBuffer,
      region: {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        confidence: 1,
        meanLuma: 255,
        useFallbackBox: false,
      },
    };
  }

  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 768;
  const height = metadata.height ?? 1024;
  const region = buildCaptionRegion(payload, width, height);
  const textColor = "#312111";
  const shadowColor = "#D6BE8D";
  const layers = buildTextLayers(payload, region);

  const composites: sharp.OverlayOptions[] = [{
    input: buildCaptionPanelSvg(region),
    left: region.left,
    top: region.top,
  }];

  for (const layer of layers) {
    composites.push({
      input: {
        text: {
          text: buildTextMarkup(layer.text, shadowColor),
          font: layer.font,
          width: Math.max(layer.width, 1),
          height: Math.max(layer.height, 1),
          align: layer.align,
          rgba: true,
        },
      },
      left: layer.left + 2,
      top: layer.top + 2,
    });

    composites.push({
      input: {
        text: {
          text: buildTextMarkup(layer.text, textColor),
          font: layer.font,
          width: Math.max(layer.width, 1),
          height: Math.max(layer.height, 1),
          align: layer.align,
          rgba: true,
        },
      },
      left: layer.left,
      top: layer.top,
    });
  }

  const output = await sharp(imageBuffer)
    .composite(composites)
    .png()
    .toBuffer();

  return {imageBuffer: output, region};
}
