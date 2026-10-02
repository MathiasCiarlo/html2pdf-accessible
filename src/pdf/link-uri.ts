/** Only web URLs may be emitted as external PDF URI actions. */
export function safeExternalLinkUri(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    // Malformed or unresolved URLs remain ordinary text.
  }
  return undefined;
}
