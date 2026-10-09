import { useState, useRef } from 'react'
import type { Task, TeamMember, Tag, User, ViewMode, FilterMode } from '../types'
import { isLate, dateTimeLabel, dateStatus, getInitials, getTodayStr, priorityClass, RECUR_LABELS, MONTHS_LONG } from '../lib/utils'

interface Props {
  tasks: Task[]
  team: TeamMember[]
  tags: Tag[]
  currentUser: User
  isAdmin: boolean
  viewMode: ViewMode
  filterMode: FilterMode
  searchQ: string
  dateFilter: string
  tagFilter: string
  viewingAll: boolean
  memberFilter: string
  setViewMode: (v: ViewMode) => void
  setFilterMode: (f: FilterMode) => void
  setSearchQ: (q: string) => void
  setDateFilter: (d: string) => void
  setTagFilter: (t: string) => void
  setViewingAll: (v: boolean) => void
  setMemberFilter: (m: string) => void
  openNewTask: (date?: string) => void
  openEditTask: (id: string) => void
  onComplete: (id: string, fromAtrasadas?: boolean) => Promise<boolean>
  onDelete: (id: string, deleteAll?: boolean) => Promise<void>
  onCycleStatus: (id: string) => Promise<void>
  onReorder: (tasks: Task[]) => Promise<void>
  onToggleSub: (taskId: string, idx: number) => Promise<void>
  onAddSub: (taskId: string, text: string) => Promise<void>
  onDeleteSub: (taskId: string, idx: number) => Promise<void>
  onSaveTag: (name: string, color: string, bg: string) => Promise<boolean>
  onDeleteTag: (id: string) => Promise<void>
  showToast: (msg: string, type?: string) => void
  setPage: (p: any) => void
}

export function TasksPage(props: Props) {
  const { tasks, team, tags, currentUser, isAdmin, viewMode, filterMode, searchQ, dateFilter, tagFilter, viewingAll, memberFilter } = props
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({})
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})
  const [subInputs, setSubInputs] = useState<Record<string, string>>({})
  const [confirmDel, setConfirmDel] = useState<{ id: string; isRecurring: boolean } | null>(null)
  const [agendaDate, setAgendaDate] = useState(new Date())
  const [selectedAgendaDay, setSelectedAgendaDay] = useState<string | null>(null)
  const dragSrc = useRef<string | null>(null)

  const getMember = (name: string) => team.find(m => m.name === name)
  const getTag = (name: string) => tags.find(t => t.name === name)

  const getFiltered = () => {
    const todayStr = getTodayStr()
    let list = tasks.filter(t => t.status !== 'Concluída')
    
    // Filtro de visibilidade inteligente (solicitação do usuário)
    // Se não há filtro de data, oculta instâncias virtuais futuras para não poluir a lista
    if (!dateFilter) {
      list = list.filter(t => {
        const isVirtual = (t as any).isVirtual
        const isFuture = t.date && t.date > todayStr
        // Regra: Mostra se (Não é virtual) OU (É hoje/atrasada) OU (É reunião)
        // Isso permite ver tarefas não-recorrentes futuras e reuniões, mas não as repetições diárias
        return !isVirtual || !isFuture || t.is_meeting
      })
    }

    if (filterMode === 'open') list = list.filter(t => !isLate(t) && t.status === 'Em Aberto')
    else if (filterMode === 'late') list = list.filter(t => isLate(t))
    else if (filterMode === 'alta') list = list.filter(t => t.prio === 'Alta')
    if (!viewingAll) list = list.filter(t => (t.resp || '').trim() === (currentUser.name || '').trim())
    else if (memberFilter && memberFilter !== 'all') list = list.filter(t => (t.resp || '').trim() === memberFilter.trim())
    if (searchQ) list = list.filter(t => (t.descricao || '').toLowerCase().includes(searchQ.toLowerCase()) || (t.resp || '').toLowerCase().includes(searchQ.toLowerCase()))
    if (dateFilter) list = list.filter(t => t.date === dateFilter)
    if (tagFilter) list = list.filter(t => t.tags?.includes(tagFilter))
    // Ordenar pelo sort_order do banco
    list.sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
    return list
  }

  const list = getFiltered()

  const handleDrop = async (srcId: string, dstId: string, before: boolean) => {
    // Não reordena tarefas virtuais
    if (srcId.startsWith('virtual_') || dstId.startsWith('virtual_')) return
    const allTasks = [...tasks]
    const srcIdx = allTasks.findIndex(t => t.id === srcId)
    const [moved] = allTasks.splice(srcIdx, 1)
    const dstIdx = allTasks.findIndex(t => t.id === dstId)
    allTasks.splice(before ? dstIdx : dstIdx + 1, 0, moved)
    const reordered = allTasks.map((t, i) => ({ ...t, sort_order: i }))
    await props.onReorder(reordered)
  }

  const tagsHtml = (taskTags: string[]) => taskTags?.map(name => {
    const tg = getTag(name)
    return tg ? <span key={name} className="tag" style={{ background: tg.bg, color: tg.color }}>{name}</span> : null
  })

  const recurLabel = (t: Task) => {
    if (!t.recur || t.recur === 'none') return null
    const label = t.recur === 'custom' && t.recur_days?.length ? t.recur_days.join(',') : RECUR_LABELS[t.recur] || ''
    return <span className="recur-badge">🔁 {label}</span>
  }

  const statusBadge = (t: Task) => {
    if (isLate(t)) return <span className="status-badge status-atrasada"><span className="spdot" /> Atrasada</span>
    if (t.status === 'Em Andamento') return <span className="status-badge status-andamento" style={{ cursor: 'pointer' }} onClick={() => props.onCycleStatus(t.id)}><span className="spdot" /> Em Andamento</span>
    return <span className="status-badge status-aberto" style={{ cursor: 'pointer' }} onClick={() => props.onCycleStatus(t.id)}><span className="spdot" /> Em Aberto</span>
  }

  // ── LIST VIEW ──────────────────────────────────────────────

  const renderList = () => (
    <div className="task-table">
      <div className="th">
        <div className="thc">#</div>
        <div className="thc" />
        <div className="thc">Tarefa</div>
        <div className="thc">Responsável</div>
        <div className="thc">Data / Hora</div>
        <div className="thc">Prioridade</div>
        <div className="thc">Status</div>
        <div className="thc">Ações</div>
      </div>
      {list.length === 0 && (
        <div className="es"><div className="ei">✅</div><div className="et">Nenhuma tarefa aqui!</div><div>Crie uma nova tarefa ou mude o filtro</div></div>
      )}
      {list.map((t, idx) => {
        const m = getMember(t.resp)
        const mc = m?.color || '#4f6ef7'
        const sub = t.subtasks || []
        const doneSub = sub.filter(s => s.done).length
        const prog = sub.length ? Math.round(doneSub / sub.length * 100) : 0
        const isExp = expandedTasks[t.id]
        const ds = dateStatus(t.date)

        return (
          <div key={t.id}>
            <div
              className={`tr${isLate(t) ? ' late-row' : ''}`}
              draggable
              onDragStart={e => { dragSrc.current = t.id; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => e.currentTarget.classList.add('dragging-row'), 0) }}
              onDragEnd={e => { e.currentTarget.classList.remove('dragging-row'); dragSrc.current = null }}
              onDragOver={e => { e.preventDefault(); const mid = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2; e.currentTarget.classList.toggle('drag-over-row', e.clientY < mid); e.currentTarget.classList.toggle('drag-over-row-bottom', e.clientY >= mid) }}
              onDragLeave={e => { e.currentTarget.classList.remove('drag-over-row', 'drag-over-row-bottom') }}
              onDrop={async e => {
                e.preventDefault(); e.currentTarget.classList.remove('drag-over-row', 'drag-over-row-bottom')
                if (!dragSrc.current || dragSrc.current === t.id) return
                const before = e.clientY < e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2
                await handleDrop(dragSrc.current, t.id, before)
              }}
            >
              <div className="tr-num">{idx + 1}</div>
              <div className="ck" onClick={() => props.onComplete(t.id)} title="Concluir" />
              <div className="ti2">
                <div className="tn">{t.descricao}</div>
                <div className="tt">
                  {tagsHtml(t.tags)}
                  {recurLabel(t)}
                  {sub.length > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--text3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }} onClick={() => setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] }))}>
                      📌 {doneSub}/{sub.length}
                      <div className="prog-bar"><div className="prog-fill" style={{ width: `${prog}%` }} /></div>
                      {isExp ? '▲' : '▼'}
                    </span>
                  )}
                </div>
              </div>
              <div className="asgn">
                <div className="avsm" style={{ background: mc }}>{getInitials(t.resp)}</div>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text2)' }}>{t.resp.split(' ')[0]}</span>
              </div>
              <div className={`dc${ds ? ' ' + ds : ''}`}>📅 {dateTimeLabel(t)}</div>
              <div><span className={`pb ${priorityClass(t.prio)}`}>{t.prio}</span></div>
              <div>{statusBadge(t)}</div>
              <div className="ra">
                {t.notes && <button className="act" onClick={() => setExpandedNotes(prev => ({ ...prev, [t.id]: !prev[t.id] }))}>📝</button>}
                <button className="act edt" onClick={() => props.openEditTask(t.id)}>✎</button>
                <button className="act del" onClick={() => setConfirmDel({ id: t.id, isRecurring: !!(t.recur && t.recur !== 'none') })}>✕</button>
              </div>
            </div>
            {expandedNotes[t.id] && t.notes && (
              <div className="sub-wrap">
                <div className="notes-display" style={{ padding: '8px 14px', whiteSpace: 'pre-wrap', color: 'var(--text2)', fontSize: 13, lineHeight: 1.5 }}>
                  {t.notes}
                </div>
              </div>
            )}
            {isExp && sub.length > 0 && (
              <div className="sub-wrap">
                {sub.map((s, si) => (
                  <div key={si} className="sub-item">
                    <div className={`sub-ck${s.done ? ' done' : ''}`} onClick={() => props.onToggleSub(t.id, si)} />
                    <span className={`sub-text${s.done ? ' done' : ''}`} style={{ flex: 1 }}>{s.text}</span>
                    <button className="sub-del" onClick={() => props.onDeleteSub(t.id, si)}>✕</button>
                  </div>
                ))}
                <div className="sub-add-row">
                  <input className="sub-add-input" placeholder="Nova subtarefa..." value={subInputs[t.id] || ''} onChange={e => setSubInputs(prev => ({ ...prev, [t.id]: e.target.value }))}
                    onKeyDown={async e => { if (e.key === 'Enter' && subInputs[t.id]?.trim()) { await props.onAddSub(t.id, subInputs[t.id].trim()); setSubInputs(prev => ({ ...prev, [t.id]: '' })) } }} />
                  <button className="sub-add-btn" onClick={async () => { if (subInputs[t.id]?.trim()) { await props.onAddSub(t.id, subInputs[t.id].trim()); setSubInputs(prev => ({ ...prev, [t.id]: '' })) } }}>+ Add</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // ── KANBAN VIEW ────────────────────────────────────────────

  const renderKanban = () => {
    const COLS = [
      { id: 'aberto', label: 'Em Aberto', color: 'var(--accent)', filter: (t: Task) => !isLate(t) && t.status === 'Em Aberto' },
      { id: 'andando', label: 'Em Andamento', color: 'var(--orange)', filter: (t: Task) => t.status === 'Em Andamento' },
      { id: 'atrasada', label: 'Atrasadas', color: 'var(--red)', filter: (t: Task) => isLate(t) },
    ]
    return (
      <div className="kanban-wrap">
        {COLS.map(col => {
          const items = list.filter(col.filter)
          return (
            <div key={col.id} className="kanban-col"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.classList.remove('drag-over') }}
              onDrop={async e => {
                e.preventDefault(); e.currentTarget.classList.remove('drag-over')
                const dragId = e.dataTransfer.getData('text/plain'); if (!dragId) return
                const t = tasks.find(x => x.id === dragId); if (!t) return
                let newStatus = t.status
                if (col.id === 'aberto') newStatus = 'Em Aberto'
                else if (col.id === 'andando') newStatus = 'Em Andamento'
                if (newStatus !== t.status) await props.onCycleStatus(t.id)
              }}>
              <div className="kanban-head" style={{ borderLeft: `3px solid ${col.color}` }}>
                <span>{col.label}</span>
                <span className="kanban-count">{items.length}</span>
              </div>
              <div className="kanban-body">
                {items.length === 0 && <div className="kanban-drop-hint">Arraste aqui</div>}
                {items.map(t => {
                  const m = getMember(t.resp)
                  return (
                    <div key={t.id} className="kcard" draggable
                      onDragStart={e => { e.dataTransfer.setData('text/plain', t.id); setTimeout(() => e.currentTarget.classList.add('dragging'), 0) }}
                      onDragEnd={e => e.currentTarget.classList.remove('dragging')}>
                      <div className="kcard-title">{t.descricao}</div>
                      <div className="tt">{tagsHtml(t.tags)}</div>
                      <div className="kcard-meta">
                        <span className={`kcard-date${isLate(t) ? ' late' : ''}`}>📅 {dateTimeLabel(t)}</span>
                        <div className="kcard-av" style={{ background: m?.color || '#4f6ef7' }}>{getInitials(t.resp)}</div>
                      </div>
                      <div style={{ marginTop: 6 }}><span className={`pb ${priorityClass(t.prio)}`}>{t.prio}</span></div>
                      <div className="kcard-actions">
                        <div className="kcard-done" onClick={() => props.onComplete(t.id)}>✓ Concluir</div>
                        <div className="kcard-edit" onClick={() => props.openEditTask(t.id)}>✎</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── AGENDA VIEW ────────────────────────────────────────────

  const renderAgenda = () => {
    const year = agendaDate.getFullYear()
    const month = agendaDate.getMonth()
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)
    const startDay = first.getDay()
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const days = []
    for (let i = 0; i < startDay; i++) {
      const d = new Date(year, month, -(startDay - i - 1))
      days.push(<div key={`pre-${i}`} className="agenda-day other-month"><div className="agenda-day-num">{d.getDate()}</div></div>)
    }
    for (let d = 1; d <= last.getDate(); d++) {
      const dt = new Date(year, month, d); dt.setHours(0, 0, 0, 0)
      const isToday = dt.getTime() === today.getTime()
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      let dayTasks = tasks.filter(t => t.date === dateStr && t.status !== 'Concluída')
      if (!viewingAll) dayTasks = dayTasks.filter(t => t.resp.trim() === currentUser.name.trim())
      const isSel = selectedAgendaDay === dateStr

      days.push(
        <div key={d} className={`agenda-day${isToday ? ' today' : ''}${isSel ? ' agenda-selected' : ''}`}
          onClick={() => setSelectedAgendaDay(prev => prev === dateStr ? null : dateStr)}>
          <div className="agenda-day-num">
            {d}
            {dayTasks.length > 0 && <span style={{ float: 'right', background: 'var(--accent)', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>{dayTasks.length}</span>}
          </div>
          {dayTasks.slice(0, 3).map(t => {
            const tg = t.tags?.length ? getTag(t.tags[0]) : null
            return <div key={t.id} className="agenda-dot" style={{ background: tg?.bg || 'var(--accentbg)', color: isLate(t) ? 'var(--red)' : (tg?.color || 'var(--accent)') }}>{t.descricao}</div>
          })}
          {dayTasks.length > 3 && <div style={{ fontSize: 10, color: 'var(--text3)' }}>+{dayTasks.length - 3} mais</div>}
        </div>
      )
    }

    return (
      <div className="agenda-wrap">
        <div className="agenda-nav">
          <button onClick={() => setAgendaDate(new Date(year, month - 1, 1))}>‹</button>
          <span className="agenda-month">{MONTHS_LONG[month]} {year}</span>
          <button onClick={() => setAgendaDate(new Date(year, month + 1, 1))}>›</button>
        </div>
        <div className="agenda-grid">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className="agenda-day-name">{d}</div>)}
          {days}
        </div>
        {selectedAgendaDay && (() => {
          const [sy, sm, sd] = selectedAgendaDay.split('-')
          let panelTasks = tasks.filter(t => t.date === selectedAgendaDay && t.status !== 'Concluída')
          if (!viewingAll) panelTasks = panelTasks.filter(t => t.resp.trim() === currentUser.name.trim())
          return (
            <div className="agenda-panel">
              <div className="agenda-panel-title">
                <span>📋 {sd} de {MONTHS_LONG[+sm - 1]} de {sy}</span>
                <button style={{ background: 'var(--accentbg)', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 10px', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }} onClick={() => props.openNewTask(selectedAgendaDay)}>+ Tarefa</button>
              </div>
              {panelTasks.length === 0 && <div className="agenda-panel-empty">Nenhuma tarefa neste dia</div>}
              {panelTasks.map(t => {
                const m = getMember(t.resp)
                const tg = t.tags?.length ? getTag(t.tags[0]) : null
                return (
                  <div key={t.id} className="agenda-task-item">
                    <div className="agenda-task-done" onClick={() => props.onComplete(t.id)} />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: isLate(t) ? 'var(--red)' : (tg?.color || 'var(--accent)'), flexShrink: 0 }} />
                    <div className="agenda-task-name">{t.descricao}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!t.all_day && t.time_start && <span style={{ fontSize: 11, color: 'var(--text3)' }}>🕐 {t.time_start}{t.time_end ? '–' + t.time_end : ''}</span>}
                      <div className="avsm" style={{ background: m?.color || '#4f6ef7', width: 18, height: 18, fontSize: 8 }}>{getInitials(t.resp)}</div>
                      <span className={`pb ${priorityClass(t.prio)}`} style={{ fontSize: 10, padding: '1px 5px' }}>{t.prio}</span>
                    </div>
                    <button className="act edt" onClick={() => props.openEditTask(t.id)} style={{ flexShrink: 0 }}>✎</button>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    )
  }

  const PAGE_TITLES: Record<string, string> = { tasks: 'Minhas Tarefas', team: 'Equipe', history: 'Histórico', atrasadas: 'Atrasadas', meetings: 'Reuniões', messages: 'Mensagens' }

  return (
    <>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-brand">
          <div className="brand-text">Nexa <span>Calendar</span></div>
        </div>
        <div>
          <div className="pt">{PAGE_TITLES['tasks']}</div>
          <div className="ps">Visualize em Lista, Kanban ou Agenda</div>
        </div>
        <div className="sw">
          <span className="si">🔍</span>
          <input className="search" placeholder="Buscar tarefa..." value={searchQ} onChange={e => props.setSearchQ(e.target.value)} />
        </div>
        <div className="fg">
          {(['all', 'open', 'late', 'alta'] as FilterMode[]).map((f, i) => (
            <button key={f} className={`fb${filterMode === f ? ' active' : ''}`} onClick={() => props.setFilterMode(f)}>
              {['Todas', 'Em Aberto', 'Atrasadas', 'Alta'][i]}
            </button>
          ))}
        </div>
        <div className="view-toggle">
          {(['list', 'kanban', 'agenda'] as ViewMode[]).map((v, i) => (
            <button key={v} className={`vbtn${viewMode === v ? ' active' : ''}`} onClick={() => props.setViewMode(v)} title={['Lista', 'Kanban', 'Agenda'][i]}>
              {['☰', '⊞', '📅'][i]}
            </button>
          ))}
        </div>
        <button className="add-btn" onClick={() => props.openNewTask()}>+ Nova Tarefa</button>
      </div>

      {/* SCOPE BANNER */}
      {isAdmin && (
        <div className={`scope-banner${viewingAll ? ' team-mode' : ''}`}>
          <span>{viewingAll ? '👥 Mostrando tarefas de toda a equipe' : '📋 Mostrando apenas suas tarefas'}</span>
          <button className="scope-btn" onClick={() => {
            const next = !viewingAll
            props.setViewingAll(next)
            props.setMemberFilter(next ? 'all' : currentUser.name)
            try { localStorage.setItem('nexa_viewingAll', String(next)) } catch {}
            try { localStorage.setItem('nexa_memberFilter', next ? 'all' : currentUser.name) } catch {}
          }}>
            {viewingAll ? 'Ver só as minhas' : 'Ver toda a equipe'}
          </button>
        </div>
      )}

      {/* MEMBER FILTER */}
      {viewingAll && (
        <div className="mf-bar">
          <button className={`mf${memberFilter === 'all' ? ' active' : ''}`} onClick={() => props.setMemberFilter('all')}>Todos</button>
          {props.team.map(m => (
            <button key={m.id} className={`mf${memberFilter === m.name ? ' active' : ''}`} onClick={() => props.setMemberFilter(m.name)}>
              <div className="mf-dot" style={{ background: m.color }} />
              {m.name.split(' ')[0]}
              {m.name === currentUser.name && <span style={{ fontSize: 9, opacity: 0.6 }}> (eu)</span>}
            </button>
          ))}
        </div>
      )}

      {/* DATE FILTER */}
      {viewMode !== 'agenda' && (
        <div className="date-filter-bar">
          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>Data:</span>
          <input type="date" value={dateFilter} onChange={e => props.setDateFilter(e.target.value)} />
          <button className="date-filter-today" onClick={() => props.setDateFilter(getTodayStr())}>Hoje</button>
          {dateFilter && <button className="date-filter-clear" onClick={() => props.setDateFilter('')}>× Limpar</button>}
          {tags.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>🏷 Tag:</span>
              {tags.map(tg => (
                <span key={tg.id} className={`tag-pill${tagFilter === tg.name ? ' active' : ''}`}
                  style={{ background: tg.bg, color: tg.color, borderColor: tagFilter === tg.name ? tg.color : 'transparent' }}
                  onClick={() => props.setTagFilter(tagFilter === tg.name ? '' : tg.name)}>
                  {tg.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CONTENT */}
      <div className="content" style={{ padding: viewMode !== 'list' ? 0 : undefined }}>
        {viewMode === 'list' && renderList()}
        {viewMode === 'kanban' && renderKanban()}
        {viewMode === 'agenda' && renderAgenda()}
      </div>

      {/* CONFIRM DELETE MODAL */}
      {confirmDel && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="modal confirm-modal">
            <div className="confirm-title">{confirmDel.isRecurring ? 'Excluir Tarefa Recorrente' : 'Excluir Tarefa'}</div>
            <div className="confirm-body">
              {confirmDel.isRecurring
                ? <>Esta tarefa é <strong style={{ color: 'var(--purple)' }}>recorrente</strong>. O que deseja fazer?</>
                : <>Tem certeza? <strong style={{ color: 'var(--red)' }}>Ação irreversível.</strong></>}
            </div>
            <div className="modal-footer">
              <button className="bcancel" onClick={() => setConfirmDel(null)}>Cancelar</button>
              {confirmDel.isRecurring && (
                <button style={{ background: 'var(--orangebg)', border: '1px solid var(--orange)', borderRadius: 7, padding: '8px 14px', color: 'var(--orange)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                  onClick={async () => { await props.onDelete(confirmDel.id, false); setConfirmDel(null) }}>Só esta</button>
              )}
              <button style={{ background: 'var(--redbg)', border: '1px solid var(--red)', borderRadius: 7, padding: '8px 14px', color: 'var(--red)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                onClick={async () => { await props.onDelete(confirmDel.id, confirmDel.isRecurring); setConfirmDel(null) }}>
                {confirmDel.isRecurring ? 'Todas' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
