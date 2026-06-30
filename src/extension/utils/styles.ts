/**
 * Inject a <style> element into a ShadowRoot.
 * Idempotent: won't inject twice if the same id already exists.
 */
export function injectStyles(shadowRoot: ShadowRoot, css: string, id: string): void {
  const existing = shadowRoot.querySelector<HTMLStyleElement>(`#${id}`)
  if (existing) {
    if (existing.textContent !== css) {
      existing.textContent = css
    }
    return
  }
  const style = document.createElement('style')
  style.id = id
  style.textContent = css
  shadowRoot.prepend(style)
}
