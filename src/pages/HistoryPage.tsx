import { useState } from 'react'
import type { Task, TeamMember, User } from '../types'
import { getInitials, fDate } from '../lib/utils'

interface Props {
  hist: Task[]
  team: TeamMember[]
  currentUser: User
  isAdmin: boolean
  onReopen: (histId: string) => Promise<boolean>
  showToast: (msg: string, type?: string) => void
}

function parseBrDate(s?: string): Date | null {
  if (!s) return null
  const p = s.split('/')
  if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0])
  return null
}

function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function groupLabel(dateStr?: string): string {
  if (!dateStr) return 'Sem data'
  const d = parseBrDate(dateStr)
  if (!d) return dateStr
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff <= 7) return 'Essa semana'
  if (diff <= 30) return 'Este mês'
  return dateStr
}

export function HistoryPage({ hist, team, currentUser, isAdmin, onReopen, showToast }: Props) {
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState(0)
  const [scope, setScope] = useState<'mine' | 'all'>('mine')

  const getMember = (name: string) => team.find(m => m.name === name)
  const effectiveScope = isAdmin ? scope : 'mine'

  let list = [...hist]
  if (effectiveScope === 'mine') list = list.filter(t => t.resp.trim() === currentUser.name.trim())
  if (search) list = list.filter(t => t.descricao.toLowerCase().includes(search.toLowerCase()))
  if (period > 0) {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - period); cutoff.setHours(0, 0, 0, 0)
    list = list.filter(t => { const d = parseBrDate(t.completed_at); return d && d >= cutoff })
  }

  // Stats
  const total = list.length
  const durs = list.map(t => daysBetween(t.date ? new Date(t.date + 'T00:00:00') : null, parseBrDate(t.completed_at))).filter(d => d !== null && d >= 0) as number[]
  const avgDays = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0
  const onTime = list.filter(t => { if (!t.date || !t.completed_at) return false; const done = parseBrDate(t.completed_at); return done && done <= new Date(t.date + 'T00:00:00') }).length
  const onTimeRate = total > 0 ? Math.round(onTime / total * 100) : 0
  const counts: Record<string, number> = {}
  list.forEach(t => { counts[t.resp] = (counts[t.resp] || 0) + 1 })
  const topMember = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]

  // Chart — últimos 14 dias
  const bars = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i)); d.setHours(0, 0, 0, 0)
    const label = d.getDate() + '/' + (d.getMonth() + 1)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const dStr = `${day}/${month}/${year}`
    const count = hist.filter(t => t.completed_at === dStr && (effectiveScope !== 'mine' || t.resp.trim() === currentUser.name.trim())).length
    return { label, count }
  })
  const maxBar = Math.max(...bars.map(b => b.count), 1)

  // Groups
  const groups: Record<string, Task[]> = {}
  list.forEach(t => { const g = groupLabel(t.completed_at); if (!groups[g]) groups[g] = []; groups[g].push(t) })
  const ORDER = ['Hoje', 'Ontem', 'Essa semana', 'Este mês']
  const sorted = [...ORDER.filter(g => groups[g]), ...Object.keys(groups).filter(g => !ORDER.includes(g)).sort((a, b) => b.localeCompare(a))]

  return (
    <>
      <div className="topbar">
        <div><div className="pt">Histórico</div><div className="ps">Tarefas concluídas</div></div>
      </div>
      <div className="content">
        {/* Stats */}
        <div className="hist-stats">
          <div className="hist-stat-card"><div className="hist-stat-num" style={{ color: 'var(--accent)' }}>{total}</div><div className="hist-stat-label">Concluídas</div><div className="hist-stat-sub">{period > 0 ? 'no período' : 'no total'}</div></div>
          <div className="hist-stat-card"><div className="hist-stat-num" style={{ color: 'var(--green)' }}>{onTimeRate}%</div><div className="hist-stat-label">No prazo</div><div className="hist-stat-sub">{onTime} de {total}</div></div>
          <div className="hist-stat-card"><div className="hist-stat-num" style={{ color: 'var(--orange)' }}>{avgDays}</div><div className="hist-stat-label">Dias médios</div><div className="hist-stat-sub">para concluir</div></div>
          <div className="hist-stat-card">
            <div className="hist-stat-num" style={{ color: 'var(--purple)', fontSize: 16 }}>{topMember ? getInitials(topMember[0]) : '—'}</div>
            <div className="hist-stat-label">+ Produtivo</div>
            <div className="hist-stat-sub">{topMember ? topMember[0].split(' ')[0] + ' (' + topMember[1] + ')' : 'nenhum'}</div>
          </div>
        </div>

        {/* Chart */}
        <div className="hist-chart">
          <div className="hist-chart-title">📊 Concluídas — últimos 14 dias</div>
          <div className="hist-chart-bars">
            {bars.map((b, i) => (
              <div key={i} className="hist-bar-wrap">
                <div className="hist-bar-val">{b.count > 0 ? b.count : ''}</div>
                <div className="hist-bar" style={{ height: Math.max(b.count / maxBar * 72, b.count > 0 ? 8 : 2), background: b.count > 0 ? 'var(--accent)' : 'var(--border)' }} />
                <div className="hist-bar-label">{b.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="hist-filters">
          <input className="hist-search" placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="hist-filter-sel" value={period} onChange={e => setPeriod(+e.target.value)}>
            <option value={0}>Todo período</option>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          {isAdmin && (
            <select className="hist-filter-sel" value={scope} onChange={e => setScope(e.target.value as 'mine' | 'all')}>
              <option value="mine">Minhas tarefas</option>
              <option value="all">Toda a equipe</option>
            </select>
          )}
        </div>

        {list.length === 0 ? (
          <div className="hist-empty"><div style={{ fontSize: 48, opacity: .3, marginBottom: 12 }}>📋</div><div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text2)' }}>Nenhuma tarefa encontrada</div></div>
        ) : sorted.map(gname => {
          const items = groups[gname]
          return (
            <div key={gname} className="hist-group">
              <div className="hist-group-title">{gname} <span style={{ color: 'var(--accent)', fontSize: 10 }}>{items.length}</span></div>
              {items.map(t => {
                const m = getMember(t.resp)
                const mc = m?.color || '#4f6ef7'
                const dur = daysBetween(t.date ? new Date(t.date + 'T00:00:00') : null, parseBrDate(t.completed_at))
                const durLabel = dur === null ? '' : dur === 0 ? 'No mesmo dia' : `${dur} dia${dur !== 1 ? 's' : ''}`
                const done = parseBrDate(t.completed_at)
                const onTimeT = t.date && done ? done <= new Date(t.date + 'T00:00:00') : null
                return (
                  <div key={t.id} className="hist-card">
                    <div className="hist-card-check" title="Reabrir tarefa" onClick={async () => { await onReopen(t.id); showToast('↩ Tarefa reaberta!', 'info') }}>↩</div>
                    <div className="hist-card-body">
                      <div className="hist-card-title">{t.descricao}</div>
                      <div className="hist-card-meta">
                        <div className="asgn">
                          <div className="avsm" style={{ background: mc, width: 18, height: 18, fontSize: 8 }}>{getInitials(t.resp)}</div>
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{t.resp.split(' ')[0]}</span>
                        </div>
                        {t.tags?.map(name => <span key={name} className="tag">{name}</span>)}
                        {onTimeT === true && <span style={{ fontSize: 10, background: 'var(--greenbg)', color: 'var(--green)', borderRadius: 3, padding: '1px 6px', fontWeight: 700 }}>✓ No prazo</span>}
                        {onTimeT === false && <span style={{ fontSize: 10, background: 'var(--redbg)', color: 'var(--red)', borderRadius: 3, padding: '1px 6px', fontWeight: 700 }}>✗ Atrasada</span>}
                      </div>
                      {t.notes && <div className="hist-card-notes">📝 {t.notes}</div>}
                      {t.subtasks?.length ? (
                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {t.subtasks.map((s, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text3)' }}>
                              <span style={{ color: s.done ? 'var(--green)' : 'var(--text3)' }}>{s.done ? '✓' : '○'}</span>
                              <span style={{ textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .6 : 1 }}>{s.text}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="hist-card-right">
                      <div className="hist-card-date">✅ {t.completed_at || '—'}</div>
                      {durLabel && <div className="hist-card-duration">{durLabel}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </>
  )
}
