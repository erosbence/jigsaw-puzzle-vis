export async function uploadPuzzle(formData) {
  const res = await fetch("/upload", { method: "POST", body: formData });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Szerver hiba: ${res.status} ${txt}`);
  }
  return res.json();
}
