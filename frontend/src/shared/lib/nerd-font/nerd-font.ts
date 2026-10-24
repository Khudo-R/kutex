/**
 * Nerd Font support for xterm.js.
 *
 * We bundle "Symbols Nerd Font Mono", a font that contains ONLY the Nerd Font
 * icons (Powerline arrows, devicons, file-type icons, ...). It is appended as
 * a fallback to whatever font the terminal uses, so the browser draws regular
 * text with the main font and falls back to this font just for the icons.
 * That makes icons work with any font, without installing anything on the system.
 *
 * The "Mono" variant keeps every icon exactly one cell wide, which is what
 * terminal programs (starship, lsd, eza --icons, neovim, ...) expect.
 */
import './nerd-font.css'

export const NERD_FONT_FAMILY = 'Symbols Nerd Font Mono'

/** CSS generic families. Fallbacks must go before these to be reliable. */
const GENERIC_FAMILIES = new Set(['monospace', 'ui-monospace', 'sans-serif', 'serif', 'system-ui'])

/** A Powerline glyph; used to make the browser actually fetch the font. */
const SAMPLE_GLYPH = '\uE0B0'

let loading: Promise<void> | undefined

/**
 * Downloads the bundled symbols font (declared in nerd-font.css). Safe to call
 * many times. Never rejects: if loading fails, icons just render as boxes.
 *
 * Browsers only fetch a web font once text needs it, so without this the
 * first icons would briefly show as boxes.
 */
export function loadNerdFont(): Promise<void> {
  loading ??= document.fonts
    .load(`16px "${NERD_FONT_FAMILY}"`, SAMPLE_GLYPH)
    .then(
      (faces) => {
        if (faces.length === 0) {
          console.warn(`Nerd Font "${NERD_FONT_FAMILY}" is not registered`)
        }
      },
      err => console.warn('Failed to load Nerd Font symbols:', err),
    )
  return loading
}

function unquote(family: string): string {
  return family.replace(/^["']|["']$/g, '')
}

/**
 * Adds the Nerd Font symbols as a fallback to a CSS font-family list.
 *
 * @example
 * withNerdFont('"Fira Code", monospace') // '"Fira Code", "Symbols Nerd Font Mono", monospace'
 */
export function withNerdFont(fontFamily: string): string {
  const families = fontFamily.split(',').map(f => f.trim()).filter(Boolean)
  const alreadyIncluded = families.some(f => unquote(f).toLowerCase() === NERD_FONT_FAMILY.toLowerCase())
  if (alreadyIncluded) {
    return fontFamily
  }

  const genericIndex = families.findIndex(f => GENERIC_FAMILIES.has(f.toLowerCase()))
  const insertAt = genericIndex === -1 ? families.length : genericIndex
  families.splice(insertAt, 0, `"${NERD_FONT_FAMILY}"`)
  return families.join(', ')
}
