import type { Worksheet } from './office.js'

export type Calculation = number | string | boolean
export const columnLabel = (index: number) => String.fromCharCode(65 + index)
// Deliberately small grammar: no eval, URLs, external workbooks or arbitrary functions.
export function calculateWorksheet(sheet: Worksheet): Calculation[][] {
  const cache = new Map<string, Calculation>()
  const visiting = new Set<string>()
  let operations = 0
  function cellAt(row: number, col: number): Calculation {
    if (++operations > 200000) return '#LIMIT!'
    if (row < 0 || col < 0 || row >= sheet.rows.length || col >= sheet.columns.length) return '#REF!'
    const key = `${row}:${col}`
    if (cache.has(key)) return cache.get(key)!
    if (visiting.has(key) || visiting.size >= 100) return '#CYCLE!'
    const cell = sheet.rows[row]!.cells[col]!
    if (cell.type !== 'formula') return cell.value
    visiting.add(key)
    let result: Calculation
    try { result = parse(cell.value) } catch (error) { result = error instanceof Error ? error.message : '#VALUE!' }
    visiting.delete(key)
    cache.set(key, result)
    return result
  }
  const numeric = (value: Calculation): number => {
    if (typeof value === 'number') return value
    if (typeof value === 'string' && value.startsWith('#')) throw new Error(value)
    if (value === '') return 0
    if (typeof value === 'boolean') return value ? 1 : 0
    throw new Error('#VALUE!')
  }
  function parse(source: string): number {
    const input = source.replace(/^=/, '').toUpperCase()
    const tokens = input.match(/\$?[A-Z]+\$?\d+|[A-Z]+|(?:\d+(?:\.\d*)?|\.\d+)|[+*/(),:-]|\S/g) ?? []
    let position = 0
    const peek = () => tokens[position]
    const take = () => tokens[position++]
    const expect = (value: string) => { if (take() !== value) throw new Error('#FORMULA!') }
    const reference = (token: string): [number, number] => {
      const match = /^\$?([A-Z]+)\$?(\d+)$/.exec(token)
      if (!match) throw new Error('#FORMULA!')
      const column = [...match[1]!].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1
      return [Number(match[2]) - 1, column]
    }
    function atom(): number {
      const token = take()
      if (!token) throw new Error('#FORMULA!')
      if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * atom()
      if (token === '(') { const value = expression(); expect(')'); return value }
      if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return Number(token)
      if (/^\$?[A-Z]+\$?\d+$/.test(token)) return numeric(cellAt(...reference(token)))
      if (!['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT'].includes(token)) throw new Error('#NAME?')
      expect('(')
      const values: number[] = []
      do {
        if (peek() && /^\$?[A-Z]+\$?\d+$/.test(peek()!) && tokens[position + 1] === ':') {
          const [r1, c1] = reference(take()!); expect(':'); const [r2, c2] = reference(take() ?? '')
          if (r1 < 0 || c1 < 0 || r2 < r1 || c2 < c1 || r2 >= sheet.rows.length || c2 >= sheet.columns.length) throw new Error('#REF!')
          for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
            const value = cellAt(r, c)
            if (typeof value === 'number') values.push(value)
            else if (typeof value === 'string' && value.startsWith('#') && sheet.rows[r]!.cells[c]!.type === 'formula') throw new Error(value)
          }
        } else if (peek() && /^\$?[A-Z]+\$?\d+$/.test(peek()!) && [',', ')'].includes(tokens[position + 1] ?? '')) {
          const [r, c] = reference(take()!)
          const value = cellAt(r, c)
          if (typeof value === 'number') values.push(value)
          else if (typeof value === 'string' && value.startsWith('#') && (!sheet.rows[r]?.cells[c] || sheet.rows[r]?.cells[c]?.type === 'formula')) throw new Error(value)
        } else values.push(expression())
        if (peek() !== ',') break
        take()
      } while (position < tokens.length)
      expect(')')
      if (token === 'COUNT') return values.length
      if (token === 'SUM') return values.reduce((a, b) => a + b, 0)
      if (token === 'AVERAGE') { if (!values.length) throw new Error('#DIV/0!'); return values.reduce((a, b) => a + b, 0) / values.length }
      return values.length ? (token === 'MIN' ? Math.min(...values) : Math.max(...values)) : 0
    }
    function product(): number {
      let result = atom()
      while (peek() === '*' || peek() === '/') {
        const operator = take(); const value = atom()
        if (operator === '/' && value === 0) throw new Error('#DIV/0!')
        result = operator === '*' ? result * value : result / value
      }
      return result
    }
    function expression(): number {
      let result = product()
      while (peek() === '+' || peek() === '-') { const operator = take(); const value = product(); result = operator === '+' ? result + value : result - value }
      return result
    }
    const value = expression()
    if (position !== tokens.length) throw new Error('#FORMULA!')
    if (!Number.isFinite(value)) throw new Error('#NUM!')
    return value
  }
  return sheet.rows.map((row, r) => row.cells.map((_cell, c) => cellAt(r, c)))
}
