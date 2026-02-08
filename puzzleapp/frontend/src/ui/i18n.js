const STRINGS = {
  hu: {
    title2: "🧩 FragmentVis",
    subtitle: "Puzzlejátékosok megoldási stratégiáinak adatvizualizáció-alapú elemzése",
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
    analyticsGroup: "Analitika",
    analyticsTitle: "Analitika",
    timerLabel: "Idő",
    timerToggle: "Időzítő megjelenítése",
    heatmapToggle: "Hőtérkép nézet",
    analyticsView: "Analitika nézet",
    analyticsViewNone: "Kikapcsolva",
    analyticsViewHeatmap: "Időlenyomat",
    analyticsViewGrabs: "Elkapási pontok",
    analyticsDescNone: "Válassz egy nézetet az analitikához.",
    analyticsDescHeatmap: "A cellák színe jelzi, mikor került helyére az adott darab.",
    analyticsDescGrabs: "A pontok azt mutatják, hol fogtad meg a darabokat az idő során.",
    heatmapExport: "Mentés (SVG)",
    exportHeatmapLabel: "Időlenyomat mentése (SVG)",
    exportGrabsLabel: "Elkapási pontok mentése (SVG)",
    heatmapLegendMin: "Legkorábbi",
    heatmapLegendMax: "Legkésőbbi",
    heatmapLegendEmpty: "Nincs helyere illesztve egy elem sem",
    heatmapExportUnavailable: "A mentés csak 2x2 vagy 6x6 puzzle esetén elérhető.",
    pieceSize: "Darab méret",
    current: "Aktuális:",
    outline: "Kontúr",
    outlineWidth: "Kontúr vastagság",
    shadow: "3D árnyék",
    shadowIntensity: "Árnyék intenzitás",
    toggleSidebar: "⚙️ Oldalsáv",
    available: "Elérhető",
    selectImageFirst: "Előbb válassz egy képet.",
    errorPrefix: "Hiba: ",
    errImageLoad: "Nem sikerült betölteni a képet.",
    errInvalidSize: "Érvénytelen méret.",
    errServerResponse: "Hiányos vagy üres szerver válasz (rows/cols/meta/pieces)."
  },
  en: {
    title2: "🧩 FragmentVis",
    subtitle: "Data visualization–based analysis of puzzle players’ solution strategies",
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
    analyticsGroup: "Analytics",
    analyticsTitle: "Analytics",
    timerLabel: "Time",
    timerToggle: "Show timer",
    heatmapToggle: "Heatmap view",
    analyticsView: "Analytics view",
    analyticsViewNone: "Off",
    analyticsViewHeatmap: "Time imprint",
    analyticsViewGrabs: "Grab points",
    analyticsDescNone: "Select a view to see analytics.",
    analyticsDescHeatmap: "Cell colors show when each piece was placed.",
    analyticsDescGrabs: "Points show where you grabbed pieces over time.",
    heatmapExport: "Save (SVG)",
    exportHeatmapLabel: "Save time imprint (SVG)",
    exportGrabsLabel: "Save grab points (SVG)",
    heatmapLegendMin: "Earliest",
    heatmapLegendMax: "Latest",
    heatmapLegendEmpty: "No pieces have been placed yet",
    heatmapExportUnavailable: "Export is available only for 2x2 or 6x6 puzzles.",
    pieceSize: "Piece size",
    current: "Current:",
    outline: "Outline",
    outlineWidth: "Outline width",
    shadow: "3D shadow",
    shadowIntensity: "Shadow intensity",
    toggleSidebar: "⚙️ Sidebar",
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
  document.title = t("🧩 FragmentVis: Data visualization–based analysis of puzzle players’ solution strategies");
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });
}
