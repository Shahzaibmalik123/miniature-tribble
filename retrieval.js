// Helpers that let the assistant search and read ANY uploaded file.
// Pure functions (extractTerms, parseRecords, searchRecords, formatRecord) are easy to test;
// the Supabase wrappers below them fetch only the files that can match a question.

const STOP_WORDS = new Set([
  // Roman Urdu
  "mein", "main", "men", "me", "ka", "ki", "ke", "ko", "se", "hai", "hain", "hy", "ho", "hoga", "hogi", "kya", "kia",
  "kitne", "kitni", "kitna", "aur", "ya", "par", "per", "wali", "wala", "wale", "dedo", "do", "de", "dain", "den", "dena",
  "batao", "bata", "batain", "bataen", "mujhe", "mujhay", "meri", "mera", "mere", "apni", "apna", "apne", "sab", "sub",
  "tamam", "jo", "jis", "jin", "uski", "uska", "uske", "wo", "woh", "yeh", "ye", "bhi", "sirf", "nikalo", "nikal", "dikhao",
  "chahiye", "chahye", "karo", "kar", "kero", "krdo", "kardo", "tak", "liye", "lye", "wahan", "yahan", "kaun", "kon", "kis",
  // English
  "the", "and", "for", "with", "from", "show", "give", "find", "list", "all", "please", "what", "which", "who", "how",
  "many", "are", "was", "were", "is", "of", "in", "on", "to", "my", "me", "file", "files", "data", "total", "tell", "get",
  "about", "that", "this", "any", "can", "you", "have", "has", "need", "want", "look", "check", "xlsx", "pdf", "excel"
]);

/** Keywords from a question: lowercase letters/digits only, stop words removed, unique, at most 8. */
export function extractTerms(text) {
  const words = String(text ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const terms = [];
  for (const word of words) {
    if (word.length < 2 || STOP_WORDS.has(word) || terms.includes(word)) continue;
    terms.push(word);
    if (terms.length === 8) break;
  }
  return terms;
}

function chunkLines(text, size = 3) {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < lines.length; i += size) chunks.push(lines.slice(i, i + size).join(" "));
  return chunks;
}

const rowText = (row) => (row && typeof row === "object" ? Object.values(row).join(" ") : String(row ?? ""));

/** Turns one stored file (extracted_text) into searchable records: spreadsheet rows, JSON items or text chunks. */
export function parseRecords(doc) {
  const text = doc.extracted_text || "";
  const file = doc.original_name;
  const records = [];
  const push = (sheet, index, data, plain) => records.push({ file, sheet, index, data, text: plain });

  if (/^SHEET: /m.test(text)) {
    const parts = text.split(/^SHEET: (.*)$/m); // [before, sheetName, body, sheetName, body, ...]
    for (let i = 1; i < parts.length; i += 2) {
      const sheet = parts[i].trim();
      const body = (parts[i + 1] || "").trim();
      let rows = null;
      try { const parsed = JSON.parse(body); if (Array.isArray(parsed)) rows = parsed; } catch { /* truncated JSON */ }
      if (rows) rows.forEach((row, n) => push(sheet, n + 1, row && typeof row === "object" ? row : null, rowText(row)));
      else chunkLines(body).forEach((chunk, n) => push(sheet, n + 1, null, chunk));
    }
    return records;
  }
  if (doc.file_type === "json") {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        parsed.forEach((item, n) => push(null, n + 1, item && typeof item === "object" ? item : null, rowText(item)));
        return records;
      }
    } catch { /* fall through to plain text */ }
  }
  chunkLines(text).forEach((chunk, n) => push(null, n + 1, null, chunk));
  return records;
}

/** Records that contain at least one term (file name counts too), best matches first. */
export function searchRecords(docs, terms, limit = 30) {
  const hits = [];
  for (const doc of docs) {
    for (const rec of parseRecords(doc)) {
      const haystack = `${rec.file} ${rec.text}`.toLowerCase();
      let score = 0;
      for (const term of terms) if (haystack.includes(term)) score++;
      if (score) hits.push({ rec, score });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return { total: hits.length, hits: hits.slice(0, limit) };
}

const where = (rec) => `${rec.file}${rec.sheet ? " / " + rec.sheet : ""} #${rec.index}`;

/** Readable one-line text for people (empty cells hidden, auto-named columns show only the value). */
export function formatRecord(rec) {
  let body;
  if (rec.data) {
    body = Object.entries(rec.data)
      .filter(([, v]) => String(v ?? "").trim() !== "")
      .map(([k, v]) => (k.startsWith("__EMPTY") ? String(v) : `${k}: ${v}`))
      .join(" | ");
  } else body = rec.text.replace(/\s+/g, " ").trim();
  return `[${where(rec)}] ${body}`.slice(0, 700);
}

/** Compact JSON line for the AI (keeps column names, drops empty cells). */
export function formatRecordForAI(rec) {
  if (rec.data) {
    const cells = Object.fromEntries(Object.entries(rec.data).filter(([, v]) => String(v ?? "").trim() !== ""));
    return `[${where(rec)}] ${JSON.stringify(cells)}`.slice(0, 900);
  }
  return `[${where(rec)}] ${rec.text.replace(/\s+/g, " ").trim()}`.slice(0, 900);
}

const clip = (text, max = 14000) => (text.length > max ? text.slice(0, max) + "\n…(output kat diya gaya)" : text);
const COLUMNS = "id, original_name, file_type, row_count, uploaded_at, extracted_text";
const safe = (value) => String(value ?? "").replace(/[%,()*\\]/g, " ").trim();

/** Fetches only files that can match: by file name and/or by any term appearing in the stored text or name. */
export async function fetchCandidateDocs(supabase, terms, fileName = "") {
  let query = supabase.from("files").select(COLUMNS).order("uploaded_at", { ascending: false });
  const name = safe(fileName);
  if (name) query = query.ilike("original_name", `%${name}%`);
  if (terms.length) {
    const filters = terms.flatMap((t) => [`extracted_text.ilike.*${t}*`, `original_name.ilike.*${t}*`]);
    query = query.or(filters.join(","));
  }
  const { data, error } = await query.limit(40);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listFiles(supabase) {
  const { data, error } = await supabase
    .from("files").select("original_name, file_type, row_count, uploaded_at").order("uploaded_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  if (!data?.length) return "Abhi koi file upload nahi hui.";
  return data.map((f, i) => `${i + 1}. ${f.original_name} (${f.file_type}, ${f.row_count} rows/lines, ${String(f.uploaded_at).slice(0, 10)})`).join("\n");
}

async function resolveDoc(supabase, fileName) {
  const name = safe(fileName);
  if (!name) return { error: "file_name zaroori hai. Pehle list_files se naam dekhein." };
  const { data, error } = await supabase
    .from("files").select(COLUMNS).ilike("original_name", `%${name}%`).order("uploaded_at", { ascending: false }).limit(5);
  if (error) throw new Error(error.message);
  if (!data?.length) return { error: `"${fileName}" naam ki koi file nahi mili. list_files se sahi naam dekhein.` };
  const exact = data.find((f) => f.original_name.toLowerCase() === name.toLowerCase());
  if (exact) return { doc: exact };
  if (data.length > 1) return { error: `Kai files milti hain: ${data.map((f) => f.original_name).join(" ; ")}. Poora naam dein.` };
  return { doc: data[0] };
}

/** Rows N..N+count of a file (and which sheets it has) - used to see headings or browse a file. */
export async function getRows(supabase, { fileName, sheet, start = 1, count = 10 }) {
  const { doc, error } = await resolveDoc(supabase, fileName);
  if (error) return error;
  const all = parseRecords(doc);
  const sheets = [...new Set(all.map((r) => r.sheet).filter(Boolean))];
  const wanted = sheet ? all.filter((r) => r.sheet && r.sheet.toLowerCase().includes(String(sheet).toLowerCase())) : all;
  const from = Math.max(1, Number(start) || 1) - 1;
  const take = Math.min(Math.max(1, Number(count) || 10), 60);
  const slice = wanted.slice(from, from + take);
  const header = `File: ${doc.original_name}${sheets.length ? ` | sheets: ${sheets.join(", ")}` : ""} | total records: ${wanted.length}`;
  return clip(`${header}\n` + (slice.length ? slice.map(formatRecordForAI).join("\n") : "Is range mein koi record nahi."));
}

/** Plain text of a file (PDF, Word, text) in pages, for long documents. */
export async function getFileText(supabase, { fileName, offset = 0, length = 6000 }) {
  const { doc, error } = await resolveDoc(supabase, fileName);
  if (error) return error;
  const text = doc.extracted_text || "";
  const from = Math.max(0, Number(offset) || 0);
  const take = Math.min(Math.max(500, Number(length) || 6000), 12000);
  return clip(`File: ${doc.original_name} | total characters: ${text.length} | showing ${from}-${Math.min(text.length, from + take)}\n` + text.slice(from, from + take));
}

/** Keyword search across all files for the AI. */
export async function searchForAI(supabase, { terms, fileName, limit = 25 }) {
  const cleaned = extractTerms((Array.isArray(terms) ? terms : [terms]).join(" "));
  if (!cleaned.length) return "Koi sahi keyword nahi mila. Naam, roll number ya khaas lafz ke saath dobara search karein.";
  const docs = await fetchCandidateDocs(supabase, cleaned, fileName);
  const { total, hits } = searchRecords(docs, cleaned, Math.min(Math.max(1, Number(limit) || 25), 40));
  if (!hits.length) return `Keywords [${cleaned.join(", ")}] ke liye koi record nahi mila.`;
  return clip(`Keywords [${cleaned.join(", ")}]: ${total} records mile, pehle ${hits.length}:\n` + hits.map((h) => formatRecordForAI(h.rec)).join("\n"));
}

/** Answer when no AI is available: the matching rows themselves, taken from any file. */
export async function answerWithoutAI(supabase, question, reason = "") {
  const terms = extractTerms(question);
  const note = `\n\nNote: ${reason || "AI jawab abhi band hai"}, is liye yeh sirf keyword search ke natayej hain; har nateeja original file se verify kar lein.`;
  if (!terms.length) {
    return "Sawal mein koi khaas lafz nahi mila. Naam, roll number ya kisi column ka lafz likhein (jaise: \"Muhammad Nawaz ka result\").\n\nSaved files:\n" + (await listFiles(supabase));
  }
  const docs = await fetchCandidateDocs(supabase, terms);
  const { total, hits } = searchRecords(docs, terms, 15);
  if (!hits.length) {
    return `"${terms.join(", ")}" se milti-julti koi row/line nahi mili.\n\nSaved files:\n${await listFiles(supabase)}` + note;
  }
  return `"${terms.join(", ")}" ke liye ${total} milte-julte records mile (pehle ${hits.length}):\n\n` + hits.map((h) => formatRecord(h.rec)).join("\n") + note;
}

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List every uploaded file with its type, row count and upload date. Use first when the user does not name a file.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "search_records",
      description: "Search ALL uploaded files for rows/lines containing any of the keywords (names, roll numbers, subjects, words). Best matches (most keywords) come first. Use this to find specific people, numbers or facts.",
      parameters: {
        type: "object",
        properties: {
          terms: { type: "array", items: { type: "string" }, description: "Keywords to look for, e.g. [\"nawaz\", \"31324919\"]" },
          file_name: { type: "string", description: "Optional: only search files whose name contains this text" },
          limit: { type: "integer", description: "Max records to return (default 25, max 40)" }
        },
        required: ["terms"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_rows",
      description: "Read rows of one file in order (start at 1). Use it to see the heading rows/column meaning, browse a file, or count/list many rows. Also tells which sheets the file has.",
      parameters: {
        type: "object",
        properties: {
          file_name: { type: "string", description: "Full or partial file name" },
          sheet: { type: "string", description: "Optional sheet name" },
          start: { type: "integer", description: "First record number, default 1" },
          count: { type: "integer", description: "How many records, default 10, max 60" }
        },
        required: ["file_name"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_file_text",
      description: "Read the plain text of a PDF, Word or text file in pages (offset/length in characters).",
      parameters: {
        type: "object",
        properties: {
          file_name: { type: "string", description: "Full or partial file name" },
          offset: { type: "integer", description: "Start character, default 0" },
          length: { type: "integer", description: "Characters to read, default 6000, max 12000" }
        },
        required: ["file_name"],
        additionalProperties: false
      }
    }
  }
];

export async function runTool(supabase, name, args = {}) {
  try {
    if (name === "list_files") return await listFiles(supabase);
    if (name === "search_records") return await searchForAI(supabase, { terms: args.terms, fileName: args.file_name, limit: args.limit });
    if (name === "get_rows") return await getRows(supabase, { fileName: args.file_name, sheet: args.sheet, start: args.start, count: args.count });
    if (name === "get_file_text") return await getFileText(supabase, { fileName: args.file_name, offset: args.offset, length: args.length });
    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Tool error: ${e.message}`;
  }
}
