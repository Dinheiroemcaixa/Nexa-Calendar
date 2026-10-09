import { useState } from 'react'
import type { Task, TeamMember, User } from '../types'
import { getInitials, fDate } from '../lib/utils'

interface Props {
  atrasadas: Task[]
  team: TeamMember[]
  currentUser: User
  isAdmin: boolean
  onComplete: (id: string, fromAtrasadas: boolean) => Promise<boolean>
  onDeleteAtrasada: (id: string) => Promise<void>
  openEditTask: (id: string) => void
  showToast: (msg: string, type?: string) => void
}

export function AtrasadasPage({ atrasadas, team, currentUser, isAdmin, onComplete, onDeleteAtrasada, openEditTask, showToast }: Props) {
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'mine' | 'all'>('mine')

  const getMember = (name: string) => team.find(m => m.name === name)

  let list = [...atrasadas]
  const effectiveScope = isAdmin ? scope : 'mine'
  if (effectiveScope === 'mine') list = list.filter(a => a.resp.trim() === currentUser.name.trim())
  if (search) list = list.filter(a => a.descricao.toLowerCase().includes(search.toLowerCase()))

  // Agrupar por data
  const groups: Record<string, Task[]> = {}
  list.forEach(a => {
    const g = a.date || '—'
    if (!groups[g]) groups[g] = []
    groups[g].push(a)
  })
  const sortedDates = Object.keys(groups).sort((a, b) => a.localeCompare(b))

  return (
    <>
      <div className="topbar">
        <div>
          <div className="pt">Atrasadas</div>
          <div className="ps">Tarefas que passaram do prazo</div>
        </div>
        <input className="search" style={{ maxWidth: 280 }} placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        {isAdmin && (
          <select className="hist-filter-sel" value={scope} onChange={e => setScope(e.target.value as 'mine' | 'all')}>
            <option value="mine">Minhas atrasadas</option>
            <option value="all">Toda a equipe</option>
          </select>
        )}
      </div>
      <div className="content">
        {list.length === 0 ? (
          <div className="es"><div className="ei">🎉</div><div className="et">Nenhuma tarefa atrasada!</div><div style={{ color: 'var(--text3)', fontSize: 13 }}>Tudo em dia por aqui.</div></div>
        ) : sortedDates.map(dateKey => {
          const items = groups[dateKey]
          return (
            <div key={dateKey} className="hist-group">
              <div className="hist-group-title" style={{ color: 'var(--red)' }}>
                📅 {fDate(dateKey)} <span style={{ color: 'var(--accent)', fontSize: 10 }}>{items.length}</span>
              </div>
              {items.map(a => {
                const m = getMember(a.resp)
                const mc = m?.color || '#ff4d6d'
                const diasAtraso = a.date ? Math.floor((Date.now() - new Date(a.date + 'T00:00:00').getTime()) / 86400000) : 0
                return (
                  <div key={a.id} className="hist-card" style={{ borderLeft: `3px solid ${a.recur && a.recur !== 'none' ? 'var(--orange)' : 'var(--red)'}` }}>
                    <div className="hist-card-check" style={{ background: 'var(--redbg)', color: 'var(--red)', border: '1.5px solid var(--red)', cursor: 'default' }}>!</div>
                    <div className="hist-card-body">
                      <div className="hist-card-title">
                        {a.recur && a.recur !== 'none' && <span style={{ marginRight: 5, opacity: 0.7 }}>🔁</span>}
                        {a.descricao}
                      </div>
                      <div className="hist-card-meta">
                        <div className="asgn">
                          <div className="avsm" style={{ background: mc, width: 18, height: 18, fontSize: 8 }}>{getInitials(a.resp)}</div>
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{a.resp.split(' ')[0]}</span>
                        </div>
                        {a.tags?.map(name => {
                          return <span key={name} className="tag">{name}</span>
                        })}
                        <span style={{ fontSize: 10, background: 'var(--redbg)', color: 'var(--red)', borderRadius: 3, padding: '1px 6px', fontWeight: 700 }}>
                          ⏰ {diasAtraso} dia{diasAtraso !== 1 ? 's' : ''} atrasada
                        </span>
                      </div>
                    </div>
                    <div className="hist-card-right">
                      <div className="hist-card-date" style={{ color: 'var(--red)' }}>📅 {fDate(a.date)}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        <button style={{ background: 'var(--greenbg)', border: '1px solid var(--green)', borderRadius: 6, padding: '4px 9px', color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          onClick={async () => { 
                            const ok = await onComplete(a.id, true); 
                            if (ok) showToast('✅ Concluída!', 'success') 
                          }}>✓ Concluir</button>
                        <button style={{ background: 'var(--accentbg)', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 9px', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          onClick={() => openEditTask(a.id)}>✏</button>
                        <button style={{ background: 'var(--redbg)', border: '1px solid var(--red)', borderRadius: 6, padding: '4px 9px', color: 'var(--red)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          onClick={async () => { await onDeleteAtrasada(a.id); showToast('🗑 Removida', 'warn') }}>✕</button>
                      </div>
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
