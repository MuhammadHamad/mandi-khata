import { plain, toNumber } from '../lib/format'

/**
 * How many, the price of one, and the total, kept in step. Traders say it
 * either way ("20 goats at 50,000" or "20 goats for 10 lakh"), so whichever
 * of the two prices was typed last is kept, and the other follows.
 */
export type Qty = { head: string; each: string; total: string; by: 'each' | 'total' }

export const emptyQty = (): Qty => ({ head: '', each: '', total: '', by: 'total' })

export function qtyFrom(head: number, total: number): Qty {
  return { head: String(head), each: head > 0 ? plain(total / head) : '', total: plain(total), by: 'total' }
}

function follow(q: Qty): Qty {
  const head = toNumber(q.head)
  if (!(head > 0)) return q
  if (q.by === 'each') {
    const each = toNumber(q.each)
    return { ...q, total: Number.isFinite(each) ? plain(each * head) : '' }
  }
  const total = toNumber(q.total)
  return { ...q, each: Number.isFinite(total) ? plain(total / head) : '' }
}

export const setHead = (q: Qty, head: string): Qty => follow({ ...q, head })
export const setEach = (q: Qty, each: string): Qty => follow({ ...q, each, by: 'each' })
export const setTotal = (q: Qty, total: string): Qty => follow({ ...q, total, by: 'total' })

/** The saved figures: a whole count, and the total. NaN where a box is empty or wrong. */
export function qtyValues(q: Qty): { head: number; total: number } {
  return { head: toNumber(q.head), total: toNumber(q.total) }
}
