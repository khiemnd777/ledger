export function getVariantNoteMessage(note?: string) {
  const normalized = note?.trim();
  return normalized ? `Ghi chú: ${normalized}` : undefined;
}

export function alertVariantNote(note?: string) {
  const message = getVariantNoteMessage(note);
  if (!message) return false;
  window.alert(message);
  return true;
}
