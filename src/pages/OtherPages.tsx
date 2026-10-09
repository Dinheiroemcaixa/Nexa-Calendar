import { useState, useEffect, useRef, ChangeEvent } from 'react'
import type { Task, TeamMember, Meeting, User, Backup } from '../types'
import { getInitials, genId, getTodayStr, COLORS } from '../lib/utils'
import { sb } from '../lib/supabase'
import { isLate } from '../lib/utils'

// ──────────────────────────────────────────────────────────────
// TEAM PAGE
// ──────────────────────────────────────────────────────────────
interface TeamProps {
  tasks: Task[]
  hist: Task[]
  team: TeamMember[]
  currentUser: User
  isAdmin: boolean
  setViewingAll: (v: boolean) => void
  setMemberFilter: (m: string) => void
  setPage: (p: any) => void
  onUpdateTeam: (id: string, data: Partial<TeamMember>) => Promise<boolean>
  showToast: (msg: string, type?: string) => void
}

export function TeamPage({ tasks, hist, team, currentUser, isAdmin, setViewingAll, setMemberFilter, setPage, onUpdateTeam, showToast }: TeamProps) {
  const [editMember, setEditMember] = useState<TeamMember | null>(null)
  const [eName, setEName] = useState('')
  const [eRole, setERole] = useState('')
  const [eColor, setEColor] = useState('')

  const openEdit = (m: TeamMember) => { setEditMember(m); setEName(m.name); setERole(m.role); setEColor(m.color) }

  const saveEdit = async () => {
    if (!editMember) return
    const ok = await onUpdateTeam(editMember.id, { name: eName, role: eRole, color: eColor })
    if (ok) { showToast('✅ Membro atualizado', 'success'); setEditMember(null) }
    else showToast('❌ Erro ao salvar', 'error')
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-brand">
          <div className="brand-text">Nexa <span>Calendar</span></div>
        </div>
        <div><div className="pt">Equipe</div><div className="ps">Membros e produtividade</div></div>
      </div>
      <div className="content">
        <div className="team-grid">
          {team.map(m => {
            const mt = tasks.filter(t => t.resp === m.name && t.status !== 'Concluída')
            const late = mt.filter(t => isLate(t))
            const done = hist.filter(h => h.resp === m.name)
            const isMe = m.name === currentUser.name
            return (
              <div key={m.id} className="member-card">
                <div className="mc-top">
                  <div className="mc-av" style={{ background: m.color }}>{getInitials(m.name)}</div>
                  <div>
                    <div className="mc-name">{m.name}{isMe && <span className="mc-badge"> Você</span>}</div>
                    <div className="mc-role">{m.role || '—'}{m.is_admin && ' 👑'}</div>
                  </div>
                </div>
                <div className="mc-stats">
                  <div className="mcs"><div className="mcs-n" style={{ color: 'var(--accent)' }}>{mt.length}</div><div className="mcs-l">Abertas</div></div>
                  <div className="mcs"><div className="mcs-n" style={{ color: 'var(--red)' }}>{late.length}</div><div className="mcs-l">Atraso</div></div>
                  <div className="mcs"><div className="mcs-n" style={{ color: 'var(--green)' }}>{done.length}</div><div className="mcs-l">Feitas</div></div>
                </div>
                <div className="mc-actions">
                  <div className="mc-btn" onClick={() => { setViewingAll(true); setMemberFilter(m.name); setPage('tasks') }}>Ver tarefas</div>
                  {(isMe || isAdmin) && <div className="mc-btn" onClick={() => openEdit(m)}>Editar</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {editMember && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditMember(null)}>
          <div className="modal modal-sm">
            <div className="modal-title">Editar Membro</div>
            <div className="field"><label className="label">Nome</label><input className="inp" value={eName} onChange={e => setEName(e.target.value)} /></div>
            <div className="field"><label className="label">Cargo</label><input className="inp" value={eRole} onChange={e => setERole(e.target.value)} /></div>
            <div className="field">
              <label className="label">Cor</label>
              <div className="color-picker">{COLORS.map(c => <div key={c} className={`cp${eColor === c ? ' sel' : ''}`} style={{ background: c }} onClick={() => setEColor(c)} />)}</div>
            </div>
            <div className="modal-footer">
              <button className="bcancel" onClick={() => setEditMember(null)}>Cancelar</button>
              <button className="btn-primary" onClick={saveEdit}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ──────────────────────────────────────────────────────────────
// MEETINGS PAGE
// ──────────────────────────────────────────────────────────────
interface MeetProps {
  meets: Meeting[]
  team: TeamMember[]
  currentUser: User
  isAdmin: boolean
  onSaveMeet: (data: Partial<Meeting>, editId?: string) => Promise<boolean>
  onDeleteMeet: (id: string) => Promise<void>
  showToast: (msg: string, type?: string) => void
}

export function MeetingsPage({ meets, team, currentUser, isAdmin, onSaveMeet, onDeleteMeet, showToast }: MeetProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(getTodayStr())
  const [time, setTime] = useState('10:00')
  const [notes, setNotes] = useState('')
  const [parts, setParts] = useState<string[]>([])

  const myMeets = isAdmin ? meets : meets.filter(m => m.parts?.includes(currentUser.name))

  const togglePart = (name: string) => setParts(prev => prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name])

  const save = async () => {
    if (!title.trim()) { showToast('⚠ Preencha o título', 'warn'); return }
    const ok = await onSaveMeet({ title: title.trim(), date, time, notes: notes.trim() || undefined, resp: currentUser.name, parts })
    if (ok) { showToast('✅ Reunião criada!', 'success'); setModalOpen(false); setTitle(''); setNotes(''); setParts([]) }
    else showToast('❌ Erro ao salvar', 'error')
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-brand">
          <div className="brand-text">Nexa <span>Calendar</span></div>
        </div>
        <div><div className="pt">Reuniões</div><div className="ps">Compromissos agendados</div></div>
        <button className="add-btn" onClick={() => setModalOpen(true)}>+ Nova Reunião</button>
      </div>
      <div className="content">
        {myMeets.length === 0 ? (
          <div className="es"><div className="ei">📅</div><div className="et">Nenhuma reunião agendada</div></div>
        ) : (
          <div className="meets-list">
            {myMeets.map(m => (
              <div key={m.id} className="meet-card">
                <div>
                  <div className="tn">{m.title}</div>
                  {m.notes && <div className="notes-display" style={{ marginTop: 6, fontSize: 11 }} dangerouslySetInnerHTML={{ __html: m.notes.replace(/\n/g, '<br>') }} />}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{Array.isArray(m.parts) ? m.parts.join(', ') : m.parts}</div>
                <div className="dc">📅 {m.date}</div>
                <div className="dc">🕐 {m.time}</div>
                <div className="ra">
                  <button className="act del" onClick={async () => { await onDeleteMeet(m.id); showToast('🗑 Removida', 'warn') }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="modal-title">Nova Reunião</div>
            <div className="field"><label className="label">Título</label><input className="inp" placeholder="Título da reunião..." value={title} onChange={e => setTitle(e.target.value)} autoFocus /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label className="label">Data</label><input className="inp" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="field"><label className="label">Horário</label><input className="inp" type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
            </div>
            <div className="field">
              <label className="label">Participantes</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {team.map(m => (
                  <button key={m.id} className={`mf${parts.includes(m.name) ? ' active' : ''}`} onClick={() => togglePart(m.name)}>
                    <div className="mf-dot" style={{ background: m.color }} />{m.name.split(' ')[0]}
                  </button>
                ))}
                <button className={`mf${parts.length === team.length ? ' active' : ''}`} onClick={() => setParts(parts.length === team.length ? [] : team.map(m => m.name))}>Todos</button>
              </div>
            </div>
            <div className="field"><label className="label">Observações</label><textarea className="inp" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
            <div className="modal-footer">
              <button className="bcancel" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={save}>Criar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ──────────────────────────────────────────────────────────────
// MESSAGES PAGE
// ──────────────────────────────────────────────────────────────
interface MsgProps {
  team: TeamMember[]
  currentUser: User
  showToast: (msg: string, type?: string) => void
}

interface Message { id: string; from: string; to: string; text: string; created_at: string }

export function MessagesPage({ team, currentUser, showToast }: MsgProps) {
  const [convWith, setConvWith] = useState<string | null>(team.find(m => m.name !== currentUser.name)?.name || null)
  const [msgs, setMsgs] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadMsgs = async (other: string) => {
    const { data } = await sb.from('messages').select('*')
      .or(`and(from.eq.${currentUser.name},to.eq.${other}),and(from.eq.${other},to.eq.${currentUser.name})`)
      .order('created_at', { ascending: true })
    setMsgs(data || [])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  useEffect(() => { if (convWith) loadMsgs(convWith) }, [convWith])

  useEffect(() => {
    if (!convWith) return
    const channel = sb.channel('messages_' + currentUser.name)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message
        if ((m.from === convWith && m.to === currentUser.name) || (m.from === currentUser.name && m.to === convWith)) {
          setMsgs(prev => [...prev, m])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
      }).subscribe()
    return () => { sb.removeChannel(channel) }
  }, [convWith])

  const send = async () => {
    if (!input.trim() || !convWith) return
    const msg: Message = { id: genId(), from: currentUser.name, to: convWith, text: input.trim(), created_at: new Date().toISOString() }
    await sb.from('messages').insert(msg)
    setMsgs(prev => [...prev, msg])
    setInput('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const others = team.filter(m => m.name !== currentUser.name)

  return (
    <>
      <div className="topbar">
        <div className="topbar-brand">
          <div className="brand-text">Nexa <span>Calendar</span></div>
        </div>
        <div><div className="pt">Mensagens</div><div className="ps">Conversas diretas</div></div>
      </div>
      <div className="messages-wrap" style={{ height: 'calc(100vh - 57px)' }}>
        <div className="msg-sidebar">
          <div className="ns" style={{ padding: '8px 0 6px' }}>Conversas</div>
          {others.map(m => (
            <div key={m.id} className={`conv-item${convWith === m.name ? ' active' : ''}`} onClick={() => setConvWith(m.name)}>
              <div className="avsm" style={{ background: m.color }}>{getInitials(m.name)}</div>
              {m.name.split(' ')[0]}
            </div>
          ))}
        </div>
        <div className="msg-conv">
          {convWith ? (
            <>
              <div className="msg-conv-header">
                {(() => { const m = team.find(x => x.name === convWith); return m ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="avsm" style={{ background: m.color }}>{getInitials(m.name)}</div>{m.name}</span> : convWith })()}
              </div>
              <div className="msg-list">
                {msgs.map(m => {
                  const isMine = m.from === currentUser.name
                  return (
                    <div key={m.id}>
                      <div className={`msg-bubble ${isMine ? 'mine' : 'other'}`}>
                        {!isMine && <div className="msg-bubble-name">{m.from.split(' ')[0]}</div>}
                        {m.text}
                        <div className="msg-bubble-time">{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <div className="msg-input-row">
                <textarea className="msg-input" rows={1} placeholder="Digite uma mensagem..." value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
                <button className="msg-send" onClick={send}>Enviar</button>
              </div>
            </>
          ) : (
            <div className="es" style={{ margin: 'auto' }}><div className="ei">💬</div><div className="et">Selecione uma conversa</div></div>
          )}
        </div>
      </div>
    </>
  )
}

// ──────────────────────────────────────────────────────────────
// BACKUP PAGE
// ──────────────────────────────────────────────────────────────
interface BackupProps {
  backups: Backup[]
  tasks: Task[]
  currentUser: User
  isAdmin: boolean
  onSaveBackup: (label: string) => Promise<void>
  onDeleteBackup: (id: string) => Promise<void>
  onRestoreBackup: (idOrSnapshot: string | any) => Promise<boolean>
  showToast: (msg: string, type?: string) => void
}

export function BackupPage({ backups, tasks, currentUser, isAdmin, onSaveBackup, onDeleteBackup, onRestoreBackup, showToast }: BackupProps) {
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const create = async () => {
    setSaving(true)
    await onSaveBackup(label)
    setLabel('')
    setSaving(false)
    showToast('✅ Backup criado e baixado!', 'success')
  }

  const handleRestore = async (idOrSnapshot: string | any) => {
    setRestoring(true)
    const ok = await onRestoreBackup(idOrSnapshot)
    setRestoring(false)
    if (ok) {
      showToast('✅ Dados restaurados com sucesso!', 'success')
      setRestoreConfirm(null)
      // Recarrega a página para garantir que o estado global reflita as mudanças massivas
      setTimeout(() => window.location.reload(), 1500)
    } else {
      showToast('❌ Erro ao restaurar os dados.', 'error')
    }
  }

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const snapshot = JSON.parse(event.target?.result as string)
        if (!snapshot.version || !snapshot.tasks) throw new Error('Formato inválido')
        const confirmResult = window.confirm('Deseja restaurar os dados deste arquivo? Isso apagará tudo o que você tem agora.')
        if (confirmResult) handleRestore(snapshot)
      } catch (err) {
        showToast('❌ Arquivo de backup inválido ou corrompido.', 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = '' // Reseta input
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-brand">
          <div className="brand-text">Nexa <span>Calendar</span></div>
        </div>
        <div><div className="pt">Backup & Segurança</div><div className="ps">Gestão de cópias em nuvem e no PC</div></div>
      </div>
      <div className="content">
        {/* Card Criar */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>💾</span>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Criar Backup Agora</div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Isso salvará uma cópia completa dos seus dados (tarefas, histórico, reuniões, equipe e tags) na nuvem e disparará um download para o seu computador.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input className="inp" placeholder="Nome do backup (ex: Antes de limpar tudo)..." value={label} onChange={e => setLabel(e.target.value)} style={{ flex: 1 }} />
            <button className="btn-primary" onClick={create} disabled={saving} style={{ minWidth: 180, height: 42 }}>
              {saving ? 'Salvando...' : '💾 Fazer Backup Manual'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>📦</span> {tasks.length} tarefas detectadas para o snapshot.
          </div>
        </div>

        {/* Card Importar */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 32, borderStyle: 'dashed' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>📂</span>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Restaurar de arquivo (.json)</div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Se você tem um arquivo de backup no seu computador, você pode carregá-lo aqui para recuperar todas as informações.
          </p>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleFileUpload} />
          <button className="mc-btn" onClick={() => fileInputRef.current?.click()} style={{ width: 'auto', padding: '10px 20px', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
            Selecionar arquivo no PC
          </button>
        </div>

        <div className="section-title" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%' }} />
          Backups na Nuvem (Substituição Automática)
        </div>

        <div className="backup-list">
          {backups.length === 0 && (
            <div className="es" style={{ padding: '40px 0' }}>
              <div className="ei">☁</div>
              <div className="et">Nenhum backup em nuvem</div>
              <div style={{ color: 'var(--text3)', fontSize: 13 }}>Seus backups aparecerão aqui após serem gerados.</div>
            </div>
          )}
          {backups.map(b => (
            <div key={b.id} className="backup-card" style={{ padding: '16px 20px' }}>
              <div className="backup-icon" style={{ background: b.backup_label?.includes('Auto') ? 'var(--accentbg)' : 'var(--greenbg)', color: b.backup_label?.includes('Auto') ? 'var(--accent)' : 'var(--green)' }}>
                {b.backup_label?.includes('Auto') ? '🤖' : '👤'}
              </div>
              <div className="backup-info">
                <div className="backup-label" style={{ fontSize: 15, fontWeight: 600 }}>{b.backup_label}</div>
                <div className="backup-date" style={{ fontSize: 12 }}>📅 Gerado em: {new Date(b.created_at).toLocaleString('pt-BR')}</div>
              </div>
              <div className="backup-actions">
                <button className="backup-btn" onClick={() => setRestoreConfirm(b.id)} style={{ padding: '8px 16px', borderRadius: 8 }}>
                  ↩ Restaurar
                </button>
                <button className="backup-btn danger" onClick={async () => { if(window.confirm('Excluir este backup da nuvem?')) await onDeleteBackup(b.id); showToast('🗑 Removido', 'warn') }} style={{ padding: '8px 12px', borderRadius: 8 }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {restoreConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !restoring && setRestoreConfirm(null)}>
          <div className="modal confirm-modal" style={{ maxWidth: 400 }}>
            <div className="confirm-title" style={{ color: 'var(--red)' }}>⚠️ Alerta de Restauração</div>
            <div className="confirm-body" style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontWeight: 600, fontSize: 16 }}>Você tem certeza?</p>
              <p style={{ marginTop: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                Esta ação irá <strong>substituir permanentemente</strong> todas as suas tarefas, reuniões, histórico e equipe atuais pelos dados deste backup.
              </p>
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>O aplicativo será reiniciado após a conclusão.</p>
            </div>
            <div className="modal-footer" style={{ borderTop: 'none', gap: 12 }}>
              <button className="bcancel" onClick={() => setRestoreConfirm(null)} disabled={restoring}>Cancelar</button>
              <button 
                style={{ 
                  background: 'var(--red)', 
                  border: 'none', 
                  borderRadius: 10, 
                  padding: '10px 24px', 
                  color: '#fff', 
                  cursor: 'pointer', 
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(255, 77, 109, 0.3)'
                }} 
                onClick={() => handleRestore(restoreConfirm)}
                disabled={restoring}
              >
                {restoring ? 'Restaurando...' : 'Sim, Restaurar tudo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
