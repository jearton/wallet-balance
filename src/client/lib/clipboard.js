

export async function copyText(text) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  const previous = document.activeElement;
  const field = document.createElement("textarea");
  field.className = "clipboard-buffer";
  field.value = text;
  field.readOnly = true;
  document.body.append(field);
  try {
    field.focus();
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.value = "";
    field.remove();
    previous?.focus({ preventScroll: true });
  }
}
