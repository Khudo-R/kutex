import { describe, expect, it } from 'vitest'
import { decodeBase64 } from '.'

describe('decodeBase64', () => {
  it('decodes base64 strings into raw bytes', () => {
    expect(decodeBase64(btoa('hello\r\n'))).toEqual(
      new Uint8Array([104, 101, 108, 108, 111, 13, 10]),
    )
  })

  it('returns an empty Uint8Array for an empty string', () => {
    expect(decodeBase64('')).toEqual(new Uint8Array([]))
  })
})
