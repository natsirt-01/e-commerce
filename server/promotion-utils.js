export function isPromotionActive(promotion, now = new Date()) {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const calendarDate = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
  const today = `${calendarDate.year}-${calendarDate.month}-${calendarDate.day}`

  return promotion.active === true &&
    (!promotion.startDate || promotion.startDate <= today) &&
    (!promotion.expirationDate || promotion.expirationDate >= today)
}
