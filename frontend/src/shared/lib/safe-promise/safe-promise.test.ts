import { describe, expect, it } from 'vitest'
import { safePromiseTyped } from '.'

class NetworkError extends Error {}
class TimeoutError extends NetworkError {}
class ValidationError extends Error {}

describe('safePromiseTyped', () => {
  it('returns [undefined, data] when the promise resolves', async () => {
    await expect(safePromiseTyped(Promise.resolve(42))).resolves.toEqual([undefined, 42])
  })

  it('keeps falsy resolved values', async () => {
    await expect(safePromiseTyped(Promise.resolve(undefined))).resolves.toEqual([undefined, undefined])
    await expect(safePromiseTyped(Promise.resolve(''))).resolves.toEqual([undefined, ''])
  })

  it('returns [error] for any rejection when no error types are given', async () => {
    const error = new ValidationError('bad input')

    const result = await safePromiseTyped(Promise.reject(error))

    expect(result).toEqual([error])
    expect(result[0]).toBe(error)
  })

  it('returns non-Error rejection reasons as-is when no error types are given', async () => {
    // Wails rejects with plain strings when a Go method returns an error.
    // eslint-disable-next-line prefer-promise-reject-errors
    await expect(safePromiseTyped(Promise.reject('terminal: shell is not running'))).resolves.toEqual(['terminal: shell is not running'])
  })

  it('returns [error] when the rejection matches one of the listed error types', async () => {
    const error = new ValidationError('bad input')

    await expect(safePromiseTyped(Promise.reject(error), [NetworkError, ValidationError])).resolves.toEqual([error])
  })

  it('matches subclasses of the listed error types', async () => {
    const error = new TimeoutError('took too long')

    await expect(safePromiseTyped(Promise.reject(error), [NetworkError])).resolves.toEqual([error])
  })

  it('rethrows rejections that do not match the listed error types', async () => {
    const error = new ValidationError('bad input')

    await expect(safePromiseTyped(Promise.reject(error), [NetworkError])).rejects.toBe(error)
  })

  it('rethrows every rejection when an empty error type list is given', async () => {
    const error = new Error('boom')

    await expect(safePromiseTyped(Promise.reject(error), [])).rejects.toBe(error)
  })

  it('still resolves with the data when error types are given', async () => {
    await expect(safePromiseTyped(Promise.resolve(['ls']), [NetworkError])).resolves.toEqual([undefined, ['ls']])
  })
})
