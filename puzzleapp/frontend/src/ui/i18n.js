const STRINGS = {
  hu: {
    title: "🧩 Puzzle Kirakós – moduláris",
    subtitle: "Mátrix-grid | pontos snap | szomszéd-merge",
    startTitle: "Puzzle kiválasztása",
    startHint: "Válassz képet a galériából, majd add meg a méretet.",
    sizeTitle: "Méret",
    startGame: "Játék indítása",
    loading: "Betöltés…",
    settingsTitle: "Beállítások",
    puzzleGroup: "Puzzle",
    openGallery: "Galéria megnyitása",
    snapGroup: "Mozgatás / Snap",
    snapToOrigin: "Snap az eredeti helyre",
    snapThreshold: "Snap küszöb",
    shuffle: "Szétkeverés",
    clear: "Törlés",
    displayGroup: "Megjelenítés",
    pieceSize: "Darab méret",
    current: "Aktuális:",
    outline: "Kontúr",
    outlineWidth: "Kontúr vastagság",
    shadow: "3D árnyék",
    shadowIntensity: "Árnyék intenzitás",
    toggleSettings: "⚙️ Beállítások",
    available: "Elérhető",
    selectImageFirst: "Előbb válassz egy képet.",
    errorPrefix: "Hiba: ",
    errImageLoad: "Nem sikerült betölteni a képet.",
    errInvalidSize: "Érvénytelen méret.",
    errServerResponse: "Hiányos vagy üres szerver válasz (rows/cols/meta/pieces)."
  },
  en: {
    title: "🧩 Puzzle Builder – modular",
    subtitle: "Matrix grid | precise snap | neighbor merge",
    startTitle: "Choose a puzzle",
    startHint: "Pick an image from the gallery, then choose the size.",
    sizeTitle: "Size",
    startGame: "Start game",
    loading: "Loading…",
    settingsTitle: "Settings",
    puzzleGroup: "Puzzle",
    openGallery: "Open gallery",
    snapGroup: "Move / Snap",
    snapToOrigin: "Snap to original position",
    snapThreshold: "Snap threshold",
    shuffle: "Shuffle",
    clear: "Clear",
    displayGroup: "Display",
    pieceSize: "Piece size",
    current: "Current:",
    outline: "Outline",
    outlineWidth: "Outline width",
    shadow: "3D shadow",
    shadowIntensity: "Shadow intensity",
    toggleSettings: "⚙️ Settings",
    available: "Available",
    selectImageFirst: "Select an image first.",
    errorPrefix: "Error: ",
    errImageLoad: "Failed to load the image.",
    errInvalidSize: "Invalid size.",
    errServerResponse: "Missing or empty server response (rows/cols/meta/pieces)."
  }
};

let currentLang = "hu";

export function t(key) {
  return (STRINGS[currentLang] && STRINGS[currentLang][key]) || key;
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (!STRINGS[lang]) return;
  currentLang = lang;
  try { localStorage.setItem("lang", lang); } catch (_) {}
  applyTranslations();
}

export function initI18n() {
  try {
    const saved = localStorage.getItem("lang");
    if (saved && STRINGS[saved]) currentLang = saved;
  } catch (_) {}

  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => setLang(btn.dataset.lang));
  });

  applyTranslations();
}

export function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });
  document.title = t("title");
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });
}
