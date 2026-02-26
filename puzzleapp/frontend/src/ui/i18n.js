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
    previewImage: "Előnézet",
    previewTitle: "Kép előnézet",
    snapGroup: "Mozgatás / Snap",
    snapDesc: "Amennyiben ez a funkció aktiválva van, a puzzle-darabok automatikusan a helyükre illeszkednek, ha a játékos azokat a megfelelő közelségi küszöbön belül pozicionálja.",
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
    analyticsViewConnections: "Kapcsolatok",
    analyticsViewPaths: "Mozgási útvonalak",
    analyticsDescNone: "Válassz egy nézetet az analitikához.",
    analyticsDescHeatmap: "A cellák színe jelzi, mikor került helyére az adott darab.",
    analyticsDescGrabs: "A pontok azt mutatják, hol fogtad meg a darabokat az idő során.",
    analyticsDescPaths: "Minden darab mozgási útvonalát egy görbe mutatja, időben színezve (kék → zöld → sárga → piros). A görbe vastagsága jelzi a mozgás sebességét: vastagabb vonal = lassabb mozgás.",
   analyticsDescConnections: "Kezdés: Kattints az ábrán valamelyik csomópontra egy puzzle-darabka kiválasztásához. A nézet a többi elemet a kiválasztott darabka megjelenített középpontjától mért távolság alapján rendezi, majd kiválasztja a rács által elvárt számú ortogonális szomszédnak megfelelő legközelebbi jelölteket (N, ahol N azt jelenti, hány darabkával illeszthető össze az adott elem). Minden jelölt esetén kiszámítja az aktuális megjelenített távolságot (d_cur), valamint a referencia-távolságot (d_ref), amely a célpozíciók középpontjai közötti távolságot jelenti.",
    connLegendCorrect: "Kék: a két darab egymáshoz van kapcsolva, illesztés történt",
    connLegendTooFar: "Sötét piros: a darabok távolabb vannak egymástól, mint ahogy a helyes pozíciójuk alapján várható lenne",
    connLegendTooClose: "Narancs: a darabok túl közel vannak egymáshoz, vagy rossz oldalon/irányban vannak egymáshoz képest",
    analyticsViewWrong: "Téves illesztések",
    analyticsDescWrong: "A piros vonalak jelzik a téves illesztési kísérleteket, összekötve a próbálkozó darabokat.",
    heatmapExport: "Mentés (SVG)",
    exportHeatmapLabel: "Időlenyomat mentése (SVG)",
    exportGrabsLabel: "Elkapási pontok mentése (SVG)",
    exportConnectionsLabel: "Kapcsolatok mentése (SVG)",
    heatmapLegendMin: "Legkorábbi",
    heatmapLegendMax: "Legkésőbbi",
    heatmapLegendEmpty: "Nincs helyere illesztve egy elem sem",
    heatmapExportUnavailable: "A mentés csak 2x2, 4x4 vagy 6x6 puzzle esetén elérhető.",
    noActivePuzzle: "Nincs aktív puzzle az előnézethez.",
    previewUnavailable: "Az előnézet nem elérhető.",
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
    errServerResponse: "Hiányos vagy üres szerver válasz (rows/cols/meta/pieces).",
    confirmLeaveTitle: "Megerősítés",
    confirmLeaveMsg: "Biztosan visszatérsz a galériába? A jelenlegi játék nem kerül mentésre.",
    confirmLeaveYes: "Visszatérés",
    confirmLeaveNo: "Maradok",
    earliest: "Legkorábbi",
    latest: "Legkésőbbi",
    noSolved: "Nincs a helyére illesztve egy elem sem",
    connectionViewPieceIdText: "Kiválaszott darab: #",
    connectionSliderHint: "Használd a csúszkát a különböző időpillanatok megtekintéséhez.",
    connectionsSlider: "Időpillanatok",
    noPathData: "Még nincs elég mozgási adat. Játssz, hogy lásd az útvonalakat!",
    pathStart: "Kezdet",
    pathEnd: "Vége",
    pathMarkers: "Jelölők",
    pathStartMarker: "Kezdés",
    pathStopMarker: "Megállás",
    pathEndMarker: "Végpont",
    pathPickedAt: "Felvéve",
    pathPlacedAt: "Letéve",
    exportPathsLabel: "Mozgási útvonalak mentése (SVG)"
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
    previewImage: "Preview",
    previewTitle: "Image preview",
    snapGroup: "Move / Snap",
    snapDesc: "When this feature is enabled, puzzle pieces will automatically snap into their correct original positions once they are placed within an appropriate proximity threshold.",
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
    analyticsViewConnections: "Connections",
    analyticsViewPaths: "Movement paths",
    analyticsDescNone: "Select a view to see analytics.",
    analyticsDescHeatmap: "Cell colors show when each piece was placed.",
    analyticsDescGrabs: "Points show where you grabbed pieces over time.",
    analyticsDescPaths: "Curves show each piece's movement path, color-coded by time (blue → green → yellow → red). Line thickness indicates movement speed: thicker = slower movement.",
    analyticsDescConnections: "Start: Click on any node in the diagram to select a puzzle piece. The view sorts the other pieces based on their distance from the displayed center of the selected piece, and selects the nearest candidates corresponding to the grid-expected number of orthogonal neighbors (N, where N denotes how many pieces the given piece can be joined with). For each candidate, it computes both the current displayed distance (d_cur) and the reference distance (d_ref), defined as the distance between the centers of the target positions.",
    connLegendCorrect: "Blue: the two pieces are connected (merged)",
    connLegendTooFar: "Dark red: the pieces are further apart than expected based on their correct positions",
    connLegendTooClose: "Orange: the pieces are too close together, or on the wrong side/direction relative to each other",
    analyticsViewWrong: "Wrong attempts",
    analyticsDescWrong: "Red links indicate incorrect merge attempts, connecting the pieces involved.",
    heatmapExport: "Save (SVG)",
    exportHeatmapLabel: "Save time imprint (SVG)",
    exportGrabsLabel: "Save grab points (SVG)",
    exportConnectionsLabel: "Save connections (SVG)",
    exportPathsLabel: "Save movement paths (SVG)",
    heatmapLegendMin: "Earliest",
    heatmapLegendMax: "Latest",
    heatmapLegendEmpty: "No pieces have been placed yet",
    heatmapExportUnavailable: "Export is available only for 2x2, 4x4 or 6x6 puzzles.",
    noActivePuzzle: "No active puzzle to preview.",
    previewUnavailable: "Preview unavailable.",
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
    errServerResponse: "Missing or empty server response (rows/cols/meta/pieces).",
    confirmLeaveTitle: "Confirm",
    confirmLeaveMsg: "Are you sure you want to return to the gallery? The current game will not be saved.",
    confirmLeaveYes: "Return",
    confirmLeaveNo: "Stay",
    earliest: "Earliest",
    latest: "Latest",
    noSolved: "No piece has been placed correctly",
    connectionViewPieceIdText: "Selected puzzle piece: #",
    connectionSliderHint: "Use the slider to explore different time snapshots.",
    connectionsSlider: "Time snapshots",
    noPathData: "Not enough movement data yet. Play to see paths!",
    pathStart: "Start",
    pathEnd: "End",
    pathMarkers: "Markers",
    pathStartMarker: "Start",
    pathStopMarker: "Stop",
    pathEndMarker: "End",
    pathPickedAt: "Picked up at",
    pathPlacedAt: "Placed at",
    exportPathsLabel: "Export Paths (SVG)"
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
