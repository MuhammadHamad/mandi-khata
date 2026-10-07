/** A queued change as the database function apply_change (supabase/setup.sql) takes it. */
import { clean, tidyPayment } from './api'
import type { Queued } from './local'

export function wire(q: Queued): Record<string, unknown> {
  const data =
    q.action === 'delete'
      ? null
      : q.entity === 'challan'
        ? {
            ...q.data,
            notes: clean(q.data.notes),
            lines: q.data.lines.map((l) => ({ id: l.id, animal: l.animal.trim(), head: l.head, cost: l.cost })),
          }
        : q.entity === 'sale'
          ? {
              ...q.data,
              notes: clean(q.data.notes),
              lines: q.data.lines.map((l) => ({
                id: l.id,
                challan_line_id: l.challan_line_id,
                head: l.head,
                amount: l.amount,
                damaged: l.damaged,
              })),
            }
          : q.entity === 'payment'
            ? tidyPayment(q.data)
            : q.data
  return {
    op: q.op,
    entity: q.entity,
    action: q.action,
    id: q.entity === 'settings' ? null : q.id,
    base: q.base,
    after: q.after,
    force: q.force ?? false,
    data,
  }
}

