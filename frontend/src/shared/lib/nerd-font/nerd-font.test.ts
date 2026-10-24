import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type NerdFontModule = typeof import('.')

/** Fresh module per test: loadNerdFont() caches its promise at module level. */
async function importNerdFont(): Promise<NerdFontModule> {
  vi.resetModules()
  return import('.')
}

describe('withNerdFont', () => {
  let withNerdFont: NerdFontModule['withNerdFont']

  beforeEach(async () => {
    ({ withNerdFont } = await importNerdFont())
  })

  it('inserts the symbols font right before the generic monospace family', () => {
    expect(withNerdFont('Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace'))
      .toBe('Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", "Symbols Nerd Font Mono", monospace')
  })

  it('appends the symbols font when there is no generic family', () => {
    expect(withNerdFont('"Fira Code", Menlo')).toBe('"Fira Code", Menlo, "Symbols Nerd Font Mono"')
  })

  it('handles a single font', () => {
    expect(withNerdFont('Menlo')).toBe('Menlo, "Symbols Nerd Font Mono"')
  })

  it('handles a list that only contains a generic family', () => {
    expect(withNerdFont('monospace')).toBe('"Symbols Nerd Font Mono", monospace')
  })

  it.each(['monospace', 'ui-monospace', 'sans-serif', 'serif', 'system-ui'])(
    'recognises %s as a generic family',
    (generic) => {
      expect(withNerdFont(`Menlo, ${generic}`)).toBe(`Menlo, "Symbols Nerd Font Mono", ${generic}`)
    },
  )

  it('matches generic families case-insensitively', () => {
    expect(withNerdFont('Menlo, MonoSpace')).toBe('Menlo, "Symbols Nerd Font Mono", MonoSpace')
  })

  it('inserts before the first generic family when there are several', () => {
    expect(withNerdFont('Menlo, ui-monospace, monospace'))
      .toBe('Menlo, "Symbols Nerd Font Mono", ui-monospace, monospace')
  })

  it('normalises whitespace and drops empty entries', () => {
    expect(withNerdFont('  Menlo ,  , Consolas,monospace  ')).toBe('Menlo, Consolas, "Symbols Nerd Font Mono", monospace')
  })

  it.each([
    '"Symbols Nerd Font Mono", monospace',
    '\'Symbols Nerd Font Mono\', monospace',
    'Menlo, Symbols Nerd Font Mono, monospace',
    'Menlo, "symbols nerd font mono"',
  ])('returns %s unchanged when the symbols font is already included', (fontFamily) => {
    expect(withNerdFont(fontFamily)).toBe(fontFamily)
  })

  it('does not treat a font with a similar name as the symbols font', () => {
    expect(withNerdFont('"Symbols Nerd Font", monospace'))
      .toBe('"Symbols Nerd Font", "Symbols Nerd Font Mono", monospace')
  })

  it('returns just the symbols font for an empty list', () => {
    expect(withNerdFont('')).toBe('"Symbols Nerd Font Mono"')
  })
})

describe('family name constant', () => {
  it('is the family declared in nerd-font.css', async () => {
    const { NERD_FONT_FAMILY } = await importNerdFont()
    expect(NERD_FONT_FAMILY).toBe('Symbols Nerd Font Mono')
  })
})

describe('loadNerdFont', () => {
  let load: ReturnType<typeof vi.fn>
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    load = vi.fn().mockResolvedValue([{ family: 'Symbols Nerd Font Mono' }])
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } })
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    Reflect.deleteProperty(document, 'fonts')
  })

  it('asks the browser to fetch the symbols font using a Powerline glyph', async () => {
    const { loadNerdFont } = await importNerdFont()

    await loadNerdFont()

    expect(load).toHaveBeenCalledExactlyOnceWith('16px "Symbols Nerd Font Mono"', '\uE0B0')
    expect(warn).not.toHaveBeenCalled()
  })

  it('only fetches the font once and returns the same promise on later calls', async () => {
    const { loadNerdFont } = await importNerdFont()

    const first = loadNerdFont()
    const second = loadNerdFont()
    await Promise.all([first, second])
    await loadNerdFont()

    expect(second).toBe(first)
    expect(load).toHaveBeenCalledOnce()
  })

  it('resolves to undefined', async () => {
    const { loadNerdFont } = await importNerdFont()

    await expect(loadNerdFont()).resolves.toBeUndefined()
  })

  it('warns when no font face matches (font not registered)', async () => {
    load.mockResolvedValue([])
    const { loadNerdFont } = await importNerdFont()

    await loadNerdFont()

    expect(warn).toHaveBeenCalledWith('Nerd Font "Symbols Nerd Font Mono" is not registered')
  })

  it('never rejects: it warns and resolves when loading fails', async () => {
    const error = new Error('network down')
    load.mockRejectedValue(error)
    const { loadNerdFont } = await importNerdFont()

    await expect(loadNerdFont()).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledWith('Failed to load Nerd Font symbols:', error)
  })
})
