const $ = (id) => document.getElementById(id);
let files = [];
let toastTimer;

function toast(message, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.className = "toast show" + (error ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = "toast", 3400);
}
const TOKEN_KEY = "agentSessionToken";
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
const setToken = (value) => { try { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY); } catch {} };
const authHeaders = () => { const token = getToken(); return token ? { Authorization: `Bearer ${token}` } : {}; };
function showLogin(message = "") {
  document.body.classList.add("locked");
  $("loginOverlay").hidden = false;
  $("loginError").textContent = message;
  $("loginPassword").value = "";
  setTimeout(() => $("loginPassword").focus(), 50);
}
function unlockApp() {
  document.body.classList.remove("locked");
  $("loginOverlay").hidden = true;
}
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), ...authHeaders() } });
  if (response.status === 401 && url !== "/api/login") {
    setToken("");
    showLogin("Session khatam ho gaya, dobara password likhein.");
  }
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const data = contentType.includes("application/json") ? await response.json() : { error: await response.text() };
    throw new Error(data.error || "Request fail ho gayi.");
  }
  return contentType.includes("application/json") ? response.json() : response;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function extLabel(file) {
  return (file.file_type || "file").toUpperCase().slice(0, 5);
}
function renderFiles() {
  $("navCount").textContent = files.length;
  $("statFiles").textContent = files.length;
  $("statRows").textContent = files.reduce((sum, f) => sum + Number(f.row_count || 0), 0).toLocaleString();
  if (!files.length) {
    $("fileList").innerHTML = `<div class="empty-state"><div class="empty-icon">▤</div><b>No files yet</b><p>Upload a CSV, Excel, TXT, JSON, or Markdown file to get started.</p><button class="outline-button" id="emptyUpload">＋ Choose a file</button></div>`;
    $("emptyUpload").addEventListener("click", chooseFile);
    return;
  }
  $("fileList").innerHTML = files.slice(0, 6).map(f => `<div class="file-row"><div class="file-icon">${escapeHtml(extLabel(f))}</div><div class="file-info"><b title="${escapeHtml(f.original_name)}">${escapeHtml(f.original_name)}</b><small>${Number(f.row_count || 0).toLocaleString()} rows/lines · ${new Date(f.uploaded_at).toLocaleDateString()}</small></div><button class="delete-file" title="Delete file" aria-label="Delete ${escapeHtml(f.original_name)}" data-delete="${escapeHtml(f.id)}">×</button></div>`).join("");
  document.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => deleteFile(btn.dataset.delete)));
}
async function refreshFiles() {
  const result = await api("/api/files");
  files = result.files;
  renderFiles();
}
function chooseFile() { $("fileInput").click(); }
async function uploadFile(file) {
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  toast("File upload aur analysis ho rahi hai…");
  try {
    const result = await api("/api/upload", { method: "POST", body: form });
    await refreshFiles();
    toast(`${result.file.original_name} successfully save ho gayi.`);
    $("aiHint").textContent = "Your data is ready";
  } catch (e) { toast(e.message, true); }
  $("fileInput").value = "";
}
async function deleteFile(id) {
  if (!confirm("Kya aap is saved file ko delete karna chahte hain?")) return;
  try { await api(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" }); await refreshFiles(); toast("File delete ho gayi."); }
  catch (e) { toast(e.message, true); }
}
function addMessage(text, who) {
  const wrapper = document.createElement("div");
  if (who === "user") {
    wrapper.className = "user-message";
    const p = document.createElement("p"); p.textContent = text; wrapper.appendChild(p);
  } else {
    wrapper.className = "assistant-message";
    const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = "✧";
    const body = document.createElement("div"); const b = document.createElement("b"); b.textContent = "Awais Nagar Agent";
    const p = document.createElement("p"); p.textContent = text; body.append(b, p); wrapper.append(avatar, body);
  }
  $("chatMessages").appendChild(wrapper);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}
async function askAgent(question) {
  const message = question.trim();
  if (!message) return;
  addMessage(message, "user");
  $("chatInput").value = "";
  const send = document.querySelector(".send-button");
  send.disabled = true;
  try {
    const result = await api("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    addMessage(result.answer, "assistant");
  } catch (e) { addMessage(`Maazrat, request complete nahi hui: ${e.message}`, "assistant"); }
  finally { send.disabled = false; $("chatInput").focus(); }
}
async function exportData() {
  if (!files.length) return toast("Export se pehle data file upload karein.", true);
  const format = document.querySelector('input[name="format"]:checked').value;
  const title = $("exportName").value.trim() || "my-collected-data";
  const button = $("exportButton");
  button.disabled = true; button.textContent = "Generating…";
  try {
    const response = await fetch("/api/export", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ format, title, fileIds: files.map(f => f.id) })
    });
    if (response.status === 401) { setToken(""); showLogin("Session khatam ho gaya, dobara password likhein."); }
    if (!response.ok) {
      let message = "Export create nahi ho saka.";
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${title.replace(/[^a-z0-9_-]/gi, "_")}.${format}`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Aapki export file download ho rahi hai.");
  } catch (e) { toast(e.message, true); }
  finally { button.disabled = false; button.innerHTML = 'Generate & download <span>↗</span>'; }
}
function setup() {
  ["topUpload", "heroUpload", "emptyUpload"].forEach(id => { const el = $(id); if (el) el.addEventListener("click", chooseFile); });
  $("fileInput").addEventListener("change", e => uploadFile(e.target.files[0]));
  $("exportButton").addEventListener("click", exportData);
  $("chatForm").addEventListener("submit", e => { e.preventDefault(); askAgent($("chatInput").value); });
  document.querySelectorAll(".suggestion").forEach(btn => btn.addEventListener("click", () => askAgent(btn.textContent)));
  document.querySelectorAll('input[name="format"]').forEach(input => input.addEventListener("change", () => {
    document.querySelectorAll(".format-option").forEach(label => label.classList.toggle("selected", label.contains(input)));
  }));
  $("viewAll").addEventListener("click", () => { $("filesSection").scrollIntoView({ behavior: "smooth", block: "start" }); });
  document.querySelectorAll(".nav").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach(n => n.classList.toggle("active", n === btn));
    const tab = btn.dataset.tab;
    if (tab === "files") $("filesSection").scrollIntoView({ behavior: "smooth", block: "start" });
    else if (tab === "assistant") $("assistantSection").scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  $("loginForm").addEventListener("submit", login);
  $("logoutButton").addEventListener("click", logout);
  if (getToken()) { unlockApp(); loadData(); } else showLogin();
}
function loadData() {
  api("/api/health").then(info => {
    $("serverStatus").textContent = "Server connected";
    document.querySelector(".server-status").classList.add("online");
    $("aiState").textContent = info.aiConfigured ? "Connected" : "Basic mode";
    $("aiHint").textContent = info.aiConfigured ? "AI model connected" : "Add API key for AI answers";
  }).catch(() => {
    if (!$("loginOverlay").hidden) return;
    $("serverStatus").textContent = "Server unavailable";
    $("aiHint").textContent = "Start the server to begin";
  });
  refreshFiles().catch(e => { if ($("loginOverlay").hidden) toast(e.message, true); });
}
async function login(event) {
  event.preventDefault();
  const button = $("loginButton");
  button.disabled = true; button.textContent = "Checking…"; $("loginError").textContent = "";
  try {
    const result = await api("/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("loginPassword").value })
    });
    setToken(result.token);
    unlockApp();
    loadData();
  } catch (e) {
    $("loginError").textContent = e.message;
    $("loginPassword").select();
  } finally { button.disabled = false; button.textContent = "Login"; }
}
function logout() {
  setToken("");
  files = [];
  renderFiles();
  showLogin();
}
setup();
