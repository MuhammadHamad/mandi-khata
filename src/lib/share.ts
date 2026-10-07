import { rs, shortDate } from './format'
import { t } from './i18n'
import type { PartyKind } from './types'

/**
 * A phone number the way WhatsApp wants it: country code first, digits only.
 * Numbers are taken as Pakistani: 0300 1234567, 300 1234567, +92 300 1234567
 * and 0092 300 1234567 all give 923001234567. Null when it isn't a number.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = `92${digits.slice(1)}`
  else if (digits.length === 10 && digits.startsWith('3')) digits = `92${digits}`
  return digits.length >= 10 && digits.length <= 15 ? digits : null
}

/** Opens WhatsApp with the message typed in: in that person's chat when the number is known, else to pick a chat. */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const number = whatsappNumber(phone)
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`
}

/**
 * The khata balance as a message to the customer or supplier, saying plainly which way
 * the money is owed. The amount is between asterisks, which WhatsApp shows in bold.
 */
export function balanceMessage({
  kind,
  name,
  balance,
  business,
  today,
}: {
  kind: PartyKind
  name: string
  balance: number
  business: string
  today: string
}): string {
  const amount = `*${rs(Math.abs(balance))}*`
  const date = shortDate(today)
  const settled = Math.abs(balance) < 0.5
  const statement = settled
    ? t('Your account is settled. Nothing is due.')
    : kind === 'customer'
      ? balance > 0
        ? t('You owe us {amount}.', { amount })
        : t('We hold {amount} of yours in advance.', { amount })
      : balance > 0
        ? t('We owe you {amount}.', { amount })
        : t('You hold {amount} of ours in advance.', { amount })
  return [
    t('Hello {name},', { name }),
    business.trim()
      ? t('Your account with {business}, as of {date}:', { business: business.trim(), date })
      : t('Your account as of {date}:', { date }),
    statement,
    t('Thank you.'),
  ].join('\n')
}
