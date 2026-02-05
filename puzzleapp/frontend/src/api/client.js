const API_BASE = "http://127.0.0.1:5000";

export async function uploadPuzzle(formData) {
  const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Szerver hiba: ${res.status} ${txt}`);
  }
  return res.json();
}
