// Readers for file types that need more than a plain text read:
// PowerPoint (.pptx) text, and images / scanned PDFs read by the OpenAI model (OCR).
import JSZip from "jszip";

export const imageMime = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"
};

const decodeXml = (value) => value
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&");

const slideNumber = (name) => Number(name.match(/(\d+)\.xml$/)?.[1] || 0);

/** All text of a PowerPoint file, slide by slide (slide text + speaker notes). */
export async function extractPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = (pattern) => Object.keys(zip.files).filter((n) => pattern.test(n)).sort((a, b) => slideNumber(a) - slideNumber(b));
  const toText = (xml) => decodeXml(xml.replace(/<\/a:p>/g, "\n").replace(/<[^>]+>/g, "")).replace(/\n{2,}/g, "\n").trim();
  const notes = new Map(names(/^ppt\/notesSlides\/notesSlide\d+\.xml$/).map((n) => [slideNumber(n), n]));
  const parts = [];
  for (const name of names(/^ppt\/slides\/slide\d+\.xml$/)) {
    const number = slideNumber(name);
    let block = `SLIDE ${number}:\n${toText(await zip.files[name].async("string"))}`;
    const noteFile = notes.get(number);
    if (noteFile) {
      const noteText = toText(await zip.files[noteFile].async("string"));
      if (noteText) block += `\nNotes: ${noteText}`;
    }
    parts.push(block);
  }
  return { text: parts.join("\n\n"), slides: parts.length };
}

const OCR_INSTRUCTION = [
  "Extract ALL the text and data in this file exactly as written: headings, names, numbers, dates, and every table row by row.",
  "Write each table row on its own line with the cell values separated by ' | ', and keep the header row first.",
  "If part of it is a photo, chart or diagram without text, add one short line describing it.",
  "Output only the extracted content, nothing else."
].join(" ");

/** Reads an image or a scanned PDF with the OpenAI model. Throws on any API error (e.g. 429 no credit). */
export async function readWithAI(openai, buffer, ext, originalName) {
  if (!openai) throw new Error("AI key set nahi hai");
  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const base64 = buffer.toString("base64");
  const part = ext === ".pdf"
    ? { type: "file", file: { filename: originalName, file_data: `data:application/pdf;base64,${base64}` } }
    : { type: "image_url", image_url: { url: `data:${imageMime[ext]};base64,${base64}` } };
  const completion = await openai.chat.completions.create(
    { model, temperature: 0, messages: [{ role: "user", content: [part, { type: "text", text: OCR_INSTRUCTION }] }] },
    { timeout: 45_000, maxRetries: 0 }
  );
  return String(completion.choices[0]?.message?.content || "").trim();
}
