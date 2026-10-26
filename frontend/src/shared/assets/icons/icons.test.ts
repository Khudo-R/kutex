import { describe, expect, it } from 'vitest'
import * as icons from './index'

describe('shared/assets/icons barrel', () => {
  it('exports all SVG and PNG icon asset URLs', () => {
    expect(icons.kutexAppDark).toContain('data:image/svg+xml')
    expect(icons.kutexAppLight).toContain('data:image/svg+xml')
    expect(icons.kutexGlyphBlack).toContain('data:image/svg+xml')
    expect(icons.kutexGlyphWhite).toContain('data:image/svg+xml')

    for (const png of [
      icons.kutexIcon16Dark,
      icons.kutexIcon16Light,
      icons.kutexIcon32Dark,
      icons.kutexIcon32Light,
      icons.kutexIcon64Dark,
      icons.kutexIcon64Light,
      icons.kutexIcon128Dark,
      icons.kutexIcon128Light,
      icons.kutexIcon256Dark,
      icons.kutexIcon256Light,
      icons.kutexIcon512Dark,
      icons.kutexIcon512Light,
    ]) {
      expect(png).toMatch(/^(?:data:image\/png|\/src\/shared\/assets\/icons\/png\/)/)
    }
  })
})
