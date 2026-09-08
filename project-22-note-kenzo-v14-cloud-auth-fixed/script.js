/* NOTE KENZO V14 — Cloud auth feedback fixed */
const editor = document.getElementById("editor");
const fileInput = document.getElementById("fileInput");
const fileNameEl = document.getElementById("fileName");
const saveStatus = document.getElementById("saveStatus");
const wordCount = document.getElementById("wordCount");
const charCount = document.getElementById("charCount");
const lineCol = document.getElementById("lineCol");
const toast = document.getElementById("toast");

const findbar = document.getElementById("findbar");
const findInput = document.getElementById("findInput");
const findCount = document.getElementById("findCount");

const fontSelect = document.getElementById("fontSelect");
const fontSizeLabel = document.getElementById("fontSizeLabel");
const wrapToggle = document.getElementById("wrapToggle");

const tabsContainer = document.getElementById("tabsContainer");
const newTabBtn = document.getElementById("newTabBtn");
const copyAllBtn = document.getElementById("copyAllBtn");

const libraryBtn = document.getElementById("libraryBtn");
const libraryDrawer = document.getElementById("libraryDrawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const closeLibraryBtn = document.getElementById("closeLibraryBtn");
const libraryList = document.getElementById("libraryList");
const librarySearch = document.getElementById("librarySearch");
const librarySubtitle = document.getElementById("librarySubtitle");
const libraryNewBtn = document.getElementById("libraryNewBtn");

const cloudBtn = document.getElementById("cloudBtn");
const cloudModal = document.getElementById("cloudModal");
const closeCloudModal = document.getElementById("closeCloudModal");
const cloudConfigWarning = document.getElementById("cloudConfigWarning");
const authForm = document.getElementById("authForm");
const loggedInPanel = document.getElementById("loggedInPanel");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const signUpBtn = document.getElementById("signUpBtn");
const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const syncNowBtn = document.getElementById("syncNowBtn");
const accountEmail = document.getElementById("accountEmail");
const authStatus = document.getElementById("authStatus");
const cloudModalInfo = document.getElementById("cloudModalInfo");

const STORAGE = {
  notes: "note_kenzo_v13_notes",
  active: "note_kenzo_v13_active",
  migratedV12: "note_kenzo_v13_migrated_v12",
  font: "project22_font",
  size: "project22_font_size",
  wrap: "project22_wrap"
};

let notes = [];
let activeNoteId = null;
let fontSize = 16;
let autosaveTimer = null;
let cloudSaveTimer = null;
let findMatches = [];
let findIndex = -1;

let supabaseClient = null;
let currentUser = null;
let cloudBusy = false;

function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "note_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}

function displayName(filename) {
  return (filename || "Untitled.txt").replace(/\.txt$/i, "");
}

function normalizeFileName(name) {
  let clean = (name || "Untitled").trim();
  if (!clean) clean = "Untitled";
  if (!clean.toLowerCase().endsWith(".txt")) clean += ".txt";
  return clean;
}

function untitledName() {
  const names = new Set(notes.map(n => displayName(n.filename).toLowerCase()));
  if (!names.has("untitled")) return "Untitled.txt";
  let i = 2;
  while (names.has(`untitled ${i}`)) i++;
  return `Untitled ${i}.txt`;
}

function nowIso() {
  return new Date().toISOString();
}

function getActiveNote() {
  return notes.find(n => n.id === activeNoteId) || null;
}

function getOpenNotes() {
  return notes.filter(n => n.open);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function saveActiveEditorState() {
  const note = getActiveNote();
  if (!note) return;
  note.content = editor.value;
  note.updatedAt = nowIso();
}

function persistLocal() {
  localStorage.setItem(STORAGE.notes, JSON.stringify(notes));
  if (activeNoteId) localStorage.setItem(STORAGE.active, activeNoteId);
  else localStorage.removeItem(STORAGE.active);
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveActiveEditorState();
    persistLocal();
    renderLibrary();
  }, 250);

  if (currentUser) {
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => syncActiveNoteToCloud(), 850);
  }
}

function newDocument() {
  saveActiveEditorState();

  const note = {
    id: uid(),
    cloudId: null,
    filename: untitledName(),
    content: "",
    savedSnapshot: "",
    open: true,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  notes.push(note);
  activeNoteId = note.id;
  editor.value = "";
  persistLocal();
  renderTabs();
  renderLibrary();
  loadActiveNote();

  if (currentUser) syncNoteToCloud(note);
  showToast("Catatan baru dibuat");
}

function loadActiveNote() {
  let note = getActiveNote();

  if (!note) {
    const open = getOpenNotes();
    if (open.length) {
      activeNoteId = open[0].id;
      note = open[0];
    } else if (notes.length) {
      notes[0].open = true;
      activeNoteId = notes[0].id;
      note = notes[0];
    } else {
      newDocument();
      return;
    }
  }

  note.open = true;
  editor.value = note.content || "";
  fileNameEl.textContent = displayName(note.filename);
  document.title = "NOTE KENZO";
  updateStats();
  updateSaveStatus();
  persistLocal();
  if (findbar.classList.contains("show")) refreshFind();
  editor.focus();
}

function renderTabs() {
  tabsContainer.innerHTML = "";

  const openNotes = getOpenNotes();

  openNotes.forEach(note => {
    const el = document.createElement("div");
    el.className = "note-tab";
    if (note.id === activeNoteId) el.classList.add("active");
    if (note.content !== note.savedSnapshot) el.classList.add("dirty");

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = displayName(note.filename);
    title.title = "Double-click untuk ubah nama";

    title.addEventListener("dblclick", e => {
      e.stopPropagation();
      if (activeNoteId !== note.id) switchNote(note.id);
      beginRename(note, el, title);
    });

    const close = document.createElement("button");
    close.className = "tab-close";
    close.type = "button";
    close.textContent = "×";
    close.title = "Tutup tab (catatan tetap ada di Catatan Saya)";
    close.addEventListener("click", e => {
      e.stopPropagation();
      closeTab(note.id);
    });

    el.addEventListener("click", () => switchNote(note.id));
    el.append(title, close);
    tabsContainer.appendChild(el);
  });

  const activeEl = tabsContainer.querySelector(".note-tab.active");
  activeEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function switchNote(id) {
  if (id === activeNoteId) return;
  saveActiveEditorState();
  activeNoteId = id;
  const note = getActiveNote();
  if (note) note.open = true;
  loadActiveNote();
  persistLocal();
  renderTabs();
  renderLibrary();
}

function closeTab(id) {
  saveActiveEditorState();

  const note = notes.find(n => n.id === id);
  if (!note) return;
  note.open = false;
  note.updatedAt = nowIso();

  if (activeNoteId === id) {
    const open = getOpenNotes();
    activeNoteId = open.length ? open[0].id : null;
  }

  persistLocal();
  renderTabs();
  renderLibrary();

  if (!activeNoteId) newDocument();
  else loadActiveNote();

  if (currentUser) syncNoteToCloud(note);
}

function beginRename(note, tabEl, titleEl) {
  tabEl.classList.add("renaming");

  const input = document.createElement("input");
  input.className = "tab-rename-input";
  input.value = displayName(note.filename);
  titleEl.replaceWith(input);

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });

  let done = false;
  const finish = save => {
    if (done) return;
    done = true;

    if (save) {
      const value = input.value.trim();
      if (value) {
        note.filename = normalizeFileName(value);
        note.updatedAt = nowIso();
        persistLocal();
        renderLibrary();
        fileNameEl.textContent = displayName(note.filename);
        if (currentUser) syncNoteToCloud(note);
      }
    }

    renderTabs();
  };

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("click", e => e.stopPropagation());
}

function renderLibrary() {
  const q = librarySearch.value.trim().toLowerCase();

  const filtered = [...notes]
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .filter(n => !q || displayName(n.filename).toLowerCase().includes(q) || (n.content || "").toLowerCase().includes(q));

  libraryList.innerHTML = "";

  if (!filtered.length) {
    libraryList.innerHTML = '<div class="library-empty">Belum ada catatan.<br>Buat catatan baru untuk mulai.</div>';
    return;
  }

  filtered.forEach(note => {
    const row = document.createElement("div");
    row.className = "library-item";
    if (note.id === activeNoteId) row.classList.add("active");

    const icon = document.createElement("div");
    icon.className = "library-note-icon";
    icon.textContent = "N";

    const main = document.createElement("div");
    main.className = "library-item-main";

    const title = document.createElement("div");
    title.className = "library-item-title";
    title.textContent = displayName(note.filename);

    const meta = document.createElement("div");
    meta.className = "library-item-meta";
    const d = new Date(note.updatedAt || Date.now());
    meta.textContent = `${note.content?.length || 0} karakter • ${d.toLocaleString("id-ID")}`;

    main.append(title, meta);

    const del = document.createElement("button");
    del.className = "library-delete";
    del.type = "button";
    del.title = "Hapus permanen";
    del.textContent = "×";
    del.addEventListener("click", async e => {
      e.stopPropagation();
      await deleteNote(note.id);
    });

    row.addEventListener("click", () => {
      saveActiveEditorState();
      note.open = true;
      activeNoteId = note.id;
      persistLocal();
      renderTabs();
      renderLibrary();
      loadActiveNote();
      closeLibrary();
    });

    row.append(icon, main, del);
    libraryList.appendChild(row);
  });
}

async function deleteNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;

  const ok = confirm(`Hapus "${displayName(note.filename)}" secara permanen?`);
  if (!ok) return;

  if (currentUser && note.cloudId && supabaseClient) {
    const { error } = await supabaseClient
      .from("notes")
      .delete()
      .eq("id", note.cloudId);
    if (error) {
      showToast("Cloud gagal menghapus catatan");
      return;
    }
  }

  notes = notes.filter(n => n.id !== id);

  if (activeNoteId === id) {
    const open = getOpenNotes();
    activeNoteId = open[0]?.id || notes[0]?.id || null;
    if (activeNoteId) {
      const next = getActiveNote();
      next.open = true;
    }
  }

  persistLocal();
  renderTabs();
  renderLibrary();

  if (!notes.length) newDocument();
  else loadActiveNote();

  showToast("Catatan dihapus");
}

function openLibrary() {
  renderLibrary();
  libraryDrawer.classList.add("show");
  drawerBackdrop.classList.add("show");
  libraryDrawer.setAttribute("aria-hidden", "false");
  setTimeout(() => librarySearch.focus(), 100);
}

function closeLibrary() {
  libraryDrawer.classList.remove("show");
  drawerBackdrop.classList.remove("show");
  libraryDrawer.setAttribute("aria-hidden", "true");
}

async function copyActiveTabContent() {
  const text = editor.value;
  if (!text) {
    showToast("Tidak ada isi untuk disalin");
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const s = editor.selectionStart;
      const e = editor.selectionEnd;
      editor.focus();
      editor.select();
      document.execCommand("copy");
      editor.setSelectionRange(s, e);
    }

    copyAllBtn.classList.add("copied");
    copyAllBtn.querySelector(".copy-label").textContent = "Tersalin";
    showToast("Semua isi berhasil disalin");
    setTimeout(() => {
      copyAllBtn.classList.remove("copied");
      copyAllBtn.querySelector(".copy-label").textContent = "Salin";
    }, 1300);
  } catch {
    showToast("Gagal menyalin");
  }
}

function updateStats() {
  const text = editor.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  wordCount.textContent = `${words} ${words === 1 ? "word" : "words"}`;
  charCount.textContent = `${text.length} ${text.length === 1 ? "character" : "characters"}`;

  const pos = editor.selectionStart;
  const before = text.slice(0, pos);
  const lines = before.split("\n");
  lineCol.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
}

function updateSaveStatus() {
  const note = getActiveNote();
  if (!note) return;

  const dirty = editor.value !== note.savedSnapshot;
  const cloudText = currentUser ? " • Cloud" : "";
  saveStatus.innerHTML = `<span class="status-dot ${dirty ? "unsaved" : ""}"></span> ${dirty ? "Autosave" : "Tersimpan"}${cloudText}`;
}

function openFile() {
  fileInput.value = "";
  fileInput.click();
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const note = {
      id: uid(),
      cloudId: null,
      filename: normalizeFileName(file.name),
      content: text,
      savedSnapshot: text,
      open: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    saveActiveEditorState();
    notes.push(note);
    activeNoteId = note.id;
    persistLocal();
    renderTabs();
    renderLibrary();
    loadActiveNote();
    if (currentUser) syncNoteToCloud(note);
    showToast(`Membuka ${displayName(file.name)}`);
  } catch {
    showToast("File gagal dibuka");
  }
});

function downloadText(filename) {
  const note = getActiveNote();
  if (!note) return;

  const finalName = normalizeFileName(filename);
  const blob = new Blob([editor.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  note.filename = finalName;
  note.content = editor.value;
  note.savedSnapshot = editor.value;
  note.updatedAt = nowIso();

  persistLocal();
  renderTabs();
  renderLibrary();
  fileNameEl.textContent = displayName(note.filename);
  updateSaveStatus();
  if (currentUser) syncNoteToCloud(note);
  showToast(`${displayName(finalName)} disimpan`);
}

function saveFile() {
  const note = getActiveNote();
  if (!note) return;
  downloadText(note.filename);
}

function saveAs() {
  const note = getActiveNote();
  if (!note) return;
  const name = prompt("Nama file:", displayName(note.filename));
  if (name === null) return;
  downloadText(name);
}

function openFind() {
  findbar.classList.add("show");
  findInput.focus();
  findInput.select();
  refreshFind();
}

function closeFind() {
  findbar.classList.remove("show");
  findMatches = [];
  findIndex = -1;
  editor.focus();
}

function refreshFind() {
  const q = findInput.value;
  findMatches = [];
  findIndex = -1;

  if (!q) {
    findCount.textContent = "0 hasil";
    return;
  }

  const text = editor.value.toLowerCase();
  const needle = q.toLowerCase();
  let start = 0;

  while (true) {
    const idx = text.indexOf(needle, start);
    if (idx === -1) break;
    findMatches.push(idx);
    start = idx + Math.max(needle.length, 1);
  }

  findCount.textContent = `${findMatches.length} hasil`;
  if (findMatches.length) {
    findIndex = 0;
    selectCurrentFind();
  }
}

function selectCurrentFind() {
  if (!findMatches.length) return;
  const start = findMatches[findIndex];
  editor.focus();
  editor.setSelectionRange(start, start + findInput.value.length);
  findCount.textContent = `${findIndex + 1}/${findMatches.length}`;
}

function moveFind(dir) {
  if (!findMatches.length) {
    refreshFind();
    return;
  }
  findIndex = (findIndex + dir + findMatches.length) % findMatches.length;
  selectCurrentFind();
}

function setFont(type) {
  const map = {
    system: '"Segoe UI", Arial, sans-serif',
    consolas: 'Consolas, "Courier New", monospace',
    mono: '"Courier New", monospace',
    serif: 'Georgia, "Times New Roman", serif'
  };
  document.documentElement.style.setProperty("--editor-font", map[type] || map.system);
  fontSelect.value = type;
  localStorage.setItem(STORAGE.font, type);
}

function setFontSize(size) {
  fontSize = Math.min(32, Math.max(10, size));
  document.documentElement.style.setProperty("--editor-size", `${fontSize}px`);
  fontSizeLabel.textContent = `${fontSize}px`;
  localStorage.setItem(STORAGE.size, String(fontSize));
}

function setWrap(enabled) {
  editor.wrap = enabled ? "soft" : "off";
  editor.style.whiteSpace = enabled ? "pre-wrap" : "pre";
  editor.style.overflowX = enabled ? "hidden" : "auto";
  wrapToggle.checked = enabled;
  localStorage.setItem(STORAGE.wrap, String(enabled));
}

function toggleFocus() {
  document.body.classList.toggle("focus");
  editor.focus();
}

function execEdit(command) {
  editor.focus();
  document.execCommand(command);
  saveActiveEditorState();
  updateStats();
  updateSaveStatus();
  scheduleAutosave();
  renderTabs();
}

function closeMenus() {
  document.querySelectorAll(".menu.open").forEach(menu => menu.classList.remove("open"));
}

/* ===== SUPABASE ===== */
function initSupabase() {
  const cfg = window.NOTE_KENZO_CONFIG || {};
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  cloudConfigWarning.hidden = configured;
  if (!configured) {
    cloudModalInfo.textContent = "Supabase belum dikonfigurasi. Aplikasi tetap bisa dipakai secara lokal.";
    librarySubtitle.textContent = "Tersimpan di browser";
    return;
  }

  if (!window.supabase?.createClient) {
    cloudModalInfo.textContent = "Library Supabase gagal dimuat.";
    return;
  }

  supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  supabaseClient.auth.getSession().then(({ data }) => {
    handleSession(data.session);
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    handleSession(session);
  });
}

async function handleSession(session) {
  currentUser = session?.user || null;

  authForm.hidden = Boolean(currentUser);
  loggedInPanel.hidden = !currentUser;

  if (currentUser) {
    accountEmail.textContent = currentUser.email || "-";
    cloudBtn.classList.add("connected");
    librarySubtitle.textContent = "Cloud Sync aktif";
    cloudModalInfo.textContent = "Catatan tersinkron dengan akun ini.";
    updateSaveStatus();
    await syncAll();
  } else {
    cloudBtn.classList.remove("connected", "syncing");
    librarySubtitle.textContent = "Tersimpan di browser";
    cloudModalInfo.textContent = "Login agar catatan bisa dibuka dari PC lain.";
    updateSaveStatus();
  }
}

function noteToCloudRow(note) {
  return {
    user_id: currentUser.id,
    client_id: note.id,
    title: note.filename,
    content: note.content || "",
    is_open: Boolean(note.open),
    updated_at: note.updatedAt || nowIso()
  };
}

async function syncNoteToCloud(note) {
  if (!supabaseClient || !currentUser || !note) return;

  try {
    cloudBtn.classList.add("syncing");
    const row = noteToCloudRow(note);

    const { data, error } = await supabaseClient
      .from("notes")
      .upsert(row, { onConflict: "user_id,client_id" })
      .select("id,client_id")
      .single();

    if (error) throw error;

    note.cloudId = data?.id || note.cloudId;
    persistLocal();
  } catch (err) {
    console.error(err);
    showToast("Cloud sync gagal");
  } finally {
    cloudBtn.classList.remove("syncing");
  }
}

async function syncActiveNoteToCloud() {
  saveActiveEditorState();
  const note = getActiveNote();
  if (!note) return;
  persistLocal();
  await syncNoteToCloud(note);
}

async function syncAll() {
  if (!supabaseClient || !currentUser || cloudBusy) return;

  cloudBusy = true;
  cloudBtn.classList.add("syncing");

  try {
    saveActiveEditorState();
    persistLocal();

    // 1) Upload local notes.
    if (notes.length) {
      const rows = notes.map(noteToCloudRow);
      const { error: upsertError } = await supabaseClient
        .from("notes")
        .upsert(rows, { onConflict: "user_id,client_id" });

      if (upsertError) throw upsertError;
    }

    // 2) Fetch complete cloud library.
    const { data, error } = await supabaseClient
      .from("notes")
      .select("id,client_id,title,content,is_open,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const localMap = new Map(notes.map(n => [n.id, n]));

    for (const row of data || []) {
      const local = localMap.get(row.client_id);

      if (!local) {
        notes.push({
          id: row.client_id,
          cloudId: row.id,
          filename: normalizeFileName(row.title || "Untitled"),
          content: row.content || "",
          savedSnapshot: row.content || "",
          open: Boolean(row.is_open),
          createdAt: row.created_at || nowIso(),
          updatedAt: row.updated_at || nowIso()
        });
      } else {
        local.cloudId = row.id;

        // Most recently updated copy wins.
        const cloudTime = Date.parse(row.updated_at || 0);
        const localTime = Date.parse(local.updatedAt || 0);

        if (cloudTime > localTime) {
          local.filename = normalizeFileName(row.title || local.filename);
          local.content = row.content || "";
          local.savedSnapshot = row.content || "";
          local.open = Boolean(row.is_open);
          local.updatedAt = row.updated_at || local.updatedAt;
        }
      }
    }

    if (!activeNoteId || !notes.some(n => n.id === activeNoteId)) {
      const open = getOpenNotes();
      activeNoteId = open[0]?.id || notes[0]?.id || null;
    }

    persistLocal();
    renderTabs();
    renderLibrary();
    if (activeNoteId) loadActiveNote();

    showToast("Cloud sinkron");
  } catch (err) {
    console.error(err);
    showToast("Cloud sync gagal. Cek setup Supabase.");
  } finally {
    cloudBusy = false;
    cloudBtn.classList.remove("syncing");
  }
}


function setAuthStatus(message = "", type = "info") {
  if (!authStatus) return;
  authStatus.textContent = message;
  authStatus.className = `auth-status ${message ? type : ""}`;
}

function setAuthBusy(busy, mode = "") {
  signUpBtn.disabled = busy;
  signInBtn.disabled = busy;

  if (!busy) {
    signUpBtn.textContent = "Daftar";
    signInBtn.textContent = "Masuk";
    return;
  }

  if (mode === "signup") signUpBtn.textContent = "Memproses…";
  if (mode === "signin") signInBtn.textContent = "Memproses…";
}

async function signIn() {
  setAuthStatus("");

  if (!supabaseClient) {
    setAuthStatus("Supabase belum siap. Cek config.js lalu refresh halaman.", "error");
    return;
  }

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    setAuthStatus("Isi email dan password terlebih dahulu.", "error");
    return;
  }

  setAuthBusy(true, "signin");
  setAuthStatus("Sedang masuk…", "info");

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      setAuthStatus(error.message, "error");
      return;
    }

    setAuthStatus("Berhasil masuk.", "success");
  } catch (err) {
    console.error(err);
    setAuthStatus("Gagal terhubung ke Supabase. Periksa koneksi internet.", "error");
  } finally {
    setAuthBusy(false);
  }
}

async function signUp() {
  setAuthStatus("");

  if (!supabaseClient) {
    setAuthStatus("Supabase belum siap. Cek config.js lalu refresh halaman.", "error");
    return;
  }

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email) {
    setAuthStatus("Masukkan alamat email.", "error");
    return;
  }

  if (password.length < 6) {
    setAuthStatus("Password minimal 6 karakter.", "error");
    return;
  }

  setAuthBusy(true, "signup");
  setAuthStatus("Sedang membuat akun…", "info");

  try {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });

    if (error) {
      setAuthStatus(error.message, "error");
      return;
    }

    if (data?.session) {
      setAuthStatus("Akun berhasil dibuat dan sudah masuk.", "success");
    } else {
      setAuthStatus("Akun berhasil dibuat. Cek email untuk verifikasi, lalu klik Masuk.", "success");
    }
  } catch (err) {
    console.error(err);
    setAuthStatus("Gagal terhubung ke Supabase. Periksa koneksi internet.", "error");
  } finally {
    setAuthBusy(false);
  }
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  closeCloud();
}

function openCloud() {
  setAuthStatus("");
  cloudModal.classList.add("show");
  cloudModal.setAttribute("aria-hidden", "false");
}

function closeCloud() {
  cloudModal.classList.remove("show");
  cloudModal.setAttribute("aria-hidden", "true");
}

/* ===== EVENTS ===== */
document.querySelectorAll(".menu-btn").forEach(btn => {
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const parent = btn.closest(".menu");
    const wasOpen = parent.classList.contains("open");
    closeMenus();
    if (!wasOpen) parent.classList.add("open");
  });
});

document.querySelectorAll(".dropdown").forEach(d => d.addEventListener("click", e => e.stopPropagation()));
document.addEventListener("click", closeMenus);

editor.addEventListener("input", () => {
  saveActiveEditorState();
  updateStats();
  updateSaveStatus();
  scheduleAutosave();
  renderTabs();
  if (findbar.classList.contains("show")) refreshFind();
});

editor.addEventListener("click", updateStats);
editor.addEventListener("keyup", updateStats);
editor.addEventListener("select", updateStats);

newTabBtn.addEventListener("click", newDocument);
document.getElementById("newBtn").addEventListener("click", newDocument);
document.getElementById("toolbarNew").addEventListener("click", newDocument);

document.getElementById("openBtn").addEventListener("click", openFile);
document.getElementById("toolbarOpen").addEventListener("click", openFile);

document.getElementById("saveBtn").addEventListener("click", saveFile);
document.getElementById("toolbarSave").addEventListener("click", saveFile);
document.getElementById("saveAsBtn").addEventListener("click", saveAs);

document.getElementById("undoBtn").addEventListener("click", () => execEdit("undo"));
document.getElementById("toolbarUndo").addEventListener("click", () => execEdit("undo"));
document.getElementById("redoBtn").addEventListener("click", () => execEdit("redo"));
document.getElementById("toolbarRedo").addEventListener("click", () => execEdit("redo"));

document.getElementById("selectAllBtn").addEventListener("click", () => {
  editor.focus();
  editor.select();
});

document.getElementById("findMenuBtn").addEventListener("click", openFind);
document.getElementById("toolbarFind").addEventListener("click", openFind);
document.getElementById("closeFind").addEventListener("click", closeFind);
document.getElementById("findPrev").addEventListener("click", () => moveFind(-1));
document.getElementById("findNext").addEventListener("click", () => moveFind(1));
findInput.addEventListener("input", refreshFind);
findInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    moveFind(e.shiftKey ? -1 : 1);
  } else if (e.key === "Escape") closeFind();
});

fontSelect.addEventListener("change", () => setFont(fontSelect.value));
document.getElementById("fontMinus").addEventListener("click", () => setFontSize(fontSize - 1));
document.getElementById("fontPlus").addEventListener("click", () => setFontSize(fontSize + 1));
document.getElementById("resetZoomBtn").addEventListener("click", () => setFontSize(16));
wrapToggle.addEventListener("change", () => setWrap(wrapToggle.checked));
document.getElementById("focusBtn").addEventListener("click", toggleFocus);

copyAllBtn.addEventListener("click", copyActiveTabContent);

libraryBtn.addEventListener("click", openLibrary);
closeLibraryBtn.addEventListener("click", closeLibrary);
drawerBackdrop.addEventListener("click", closeLibrary);
librarySearch.addEventListener("input", renderLibrary);
libraryNewBtn.addEventListener("click", () => {
  newDocument();
  closeLibrary();
});

cloudBtn.addEventListener("click", openCloud);
closeCloudModal.addEventListener("click", closeCloud);
cloudModal.addEventListener("click", e => {
  if (e.target === cloudModal) closeCloud();
});
signInBtn.addEventListener("click", signIn);
authPassword.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    signIn();
  }
});
signUpBtn.addEventListener("click", signUp);
signOutBtn.addEventListener("click", signOut);
syncNowBtn.addEventListener("click", syncAll);

document.addEventListener("keydown", e => {
  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key.toLowerCase() === "n") {
    e.preventDefault();
    newDocument();
  }
  if (ctrl && e.key.toLowerCase() === "o") {
    e.preventDefault();
    openFile();
  }
  if (ctrl && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (e.shiftKey) saveAs();
    else saveFile();
  }
  if (ctrl && e.key.toLowerCase() === "f") {
    e.preventDefault();
    openFind();
  }
  if (ctrl && e.shiftKey && e.key.toLowerCase() === "c") {
    e.preventDefault();
    copyActiveTabContent();
  }
  if (ctrl && e.key.toLowerCase() === "w") {
    e.preventDefault();
    if (activeNoteId) closeTab(activeNoteId);
  }
  if (ctrl && e.key === "Tab") {
    e.preventDefault();
    const open = getOpenNotes();
    if (open.length > 1) {
      const i = open.findIndex(n => n.id === activeNoteId);
      const next = e.shiftKey
        ? (i - 1 + open.length) % open.length
        : (i + 1) % open.length;
      switchNote(open[next].id);
    }
  }
  if (e.key === "F11") {
    e.preventDefault();
    toggleFocus();
  }
  if (e.key === "Escape") {
    if (libraryDrawer.classList.contains("show")) closeLibrary();
    if (cloudModal.classList.contains("show")) closeCloud();
  }
});

window.addEventListener("beforeunload", () => {
  saveActiveEditorState();
  persistLocal();
});

/* ===== MIGRATION / INIT ===== */
function migrateOldTabsOnce() {
  if (localStorage.getItem(STORAGE.migratedV12)) return;

  const keys = ["project22_v7_tabs"];
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      const old = JSON.parse(raw);
      if (Array.isArray(old) && old.length && !notes.length) {
        notes = old.map(t => ({
          id: t.id || uid(),
          cloudId: null,
          filename: normalizeFileName(t.filename || "Untitled"),
          content: t.content || "",
          savedSnapshot: typeof t.savedSnapshot === "string" ? t.savedSnapshot : (t.content || ""),
          open: true,
          createdAt: nowIso(),
          updatedAt: nowIso()
        }));
      }
    } catch {}
  }

  localStorage.setItem(STORAGE.migratedV12, "1");
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE.notes);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) notes = parsed;
    }
  } catch {}

  migrateOldTabsOnce();

  if (!notes.length) {
    notes = [{
      id: uid(),
      cloudId: null,
      filename: "Untitled.txt",
      content: "",
      savedSnapshot: "",
      open: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }];
  }

  const storedActive = localStorage.getItem(STORAGE.active);
  activeNoteId = notes.some(n => n.id === storedActive)
    ? storedActive
    : (getOpenNotes()[0]?.id || notes[0].id);

  const font = localStorage.getItem(STORAGE.font) || "system";
  const size = parseInt(localStorage.getItem(STORAGE.size) || "16", 10);
  const wrap = localStorage.getItem(STORAGE.wrap);

  document.body.classList.add("dark");
  document.getElementById("themeIcon").textContent = "☾";
  setFont(font);
  setFontSize(Number.isFinite(size) ? size : 16);
  setWrap(wrap === null ? true : wrap === "true");

  persistLocal();
  renderTabs();
  renderLibrary();
  loadActiveNote();
  initSupabase();
}

loadState();
