import type { Task, RecurType, Tag } from '../types'

export const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
export const MONTHS_LONG = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export const RECUR_LABELS: Record<string, string> = {
  none: 'Sem recorrência',
  daily: 'Diária',
  weekdays: 'Seg a Sex',
  weekly: 'Semanal',
  monthly: 'Mensal',
  custom: 'Personalizado',
}

export const COLORS = [
  '#4f6ef7','#cc5de8','#ff4d6d','#ffa94d','#3dd68c',
  '#2f9e44','#f06595','#74c0fc','#ff6b35','#a9e34b',
]

export function genId(): string {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
}

export function hashPass(p: string): string {
  let h = 0
  for (let i = 0; i < p.length; i++) h = ((h * 31 + p.charCodeAt(i)) >>> 0)
  return h.toString(36)
}

export function getTodayStr(): string {
  // Usar horário local (não UTC) para evitar bug de virada de dia no Brasil (UTC-3)
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fDate(d: string): string {
  if (!d) return '—'
  const [, m, day] = d.split('-')
  return `${day} ${MONTHS_SHORT[+m - 1]}`
}

export function getInitials(name: string): string {
  return (name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
}

export function dateStatus(d: string): 'late' | 'soon' | '' {
  if (!d) return ''
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const diff = (new Date(d + 'T00:00:00').getTime() - t.getTime()) / 86400000
  return diff < 0 ? 'late' : diff <= 2 ? 'soon' : ''
}

export function isLate(t: Task): boolean {
  return t.status !== 'Concluída' && dateStatus(t.date) === 'late'
}

export function dateTimeLabel(t: Task): string {
  if (!t.date) return '—'
  let s = fDate(t.date)
  if (!t.all_day && t.time_start) s += ` ${t.time_start}${t.time_end ? '–' + t.time_end : ''}`
  return s
}

export function isTodayValidForRecur(
  recur: RecurType,
  recurDays: string[],
  recurStart: string,
  today: Date
): boolean {
  const dow = today.getDay()
  if (recur === 'daily') return true
  if (recur === 'weekdays') return dow >= 1 && dow <= 5
  if (recur === 'weekly') {
    const orig = new Date(recurStart + 'T00:00:00')
    return orig.getDay() === dow
  }
  if (recur === 'monthly') {
    const orig = new Date(recurStart + 'T00:00:00')
    return orig.getDate() === today.getDate()
  }
  if (recur === 'custom' && recurDays.length) {
    const dayNames = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
    return recurDays.includes(dayNames[dow])
  }
  return false
}

export function getTagStyle(tag: Tag | undefined): { color: string; bg: string } {
  return tag ? { color: tag.color, bg: tag.bg } : { color: '#4f6ef7', bg: 'rgba(79,110,247,0.12)' }
}

export function priorityClass(p: string): string {
  return p === 'Alta' ? 'p-alta' : p === 'Baixa' ? 'p-baixa' : 'p-media'
}

// Retorna a próxima data de ocorrência depois de afterDate (exclusive)
export function getNextOccurrenceAfter(
  recur: string,
  recurDays: string[],
  recurStart: string,
  afterDate: string
): string | null {
  const after = new Date(afterDate + 'T00:00:00')
  const rangeEnd = new Date(after)
  rangeEnd.setDate(rangeEnd.getDate() + 400)
  const current = new Date(after)
  current.setDate(current.getDate() + 1)
  const dayNames = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
  while (current <= rangeEnd) {
    const dow = current.getDay()
    let matches = false
    if (recur === 'daily') matches = true
    else if (recur === 'weekdays') matches = dow >= 1 && dow <= 5
    else if (recur === 'weekly') matches = new Date(recurStart + 'T00:00:00').getDay() === dow
    else if (recur === 'monthly') matches = new Date(recurStart + 'T00:00:00').getDate() === current.getDate()
    else if (recur === 'custom') matches = recurDays.includes(dayNames[dow])
    if (matches) {
      const y = current.getFullYear()
      const m = String(current.getMonth() + 1).padStart(2, '0')
      const day = String(current.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    current.setDate(current.getDate() + 1)
  }
  return null
}
