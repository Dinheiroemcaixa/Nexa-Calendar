import { useState, useEffect } from 'react'
import type { User, TeamMember, Task } from '../types'
import { getInitials, getTodayStr, hashPass, COLORS } from '../lib/utils'
import type { Page } from '../types'

import logoImg from '../assets/logo-dinheiro-transparent.png'

interface Props {
  page: Page
  setPage: (p: Page) => void
  currentUser: User
  isAdmin: boolean
  tasks: Task[]
  atrasadas: Task[]
  hist: Task[]
  team: TeamMember[]
  onLogout: () => void
  onUpdateUser: (id: string, data: Partial<User>) => Promise<boolean>
  showToast: (msg: string, type?: string) => void
}

export function Sidebar({ page, setPage, currentUser, isAdmin, tasks, atrasadas, hist, team, onLogout, onUpdateUser, showToast }: Props) {
  const today = getTodayStr()
  const me = currentUser.name
  const todayOpen = tasks.filter(t => t.status !== 'Concluída' && t.resp === me && t.date === today).length
  const myAtrasadas = atrasadas.filter(a => a.resp === me).length
  const doneToday = hist.filter(h => h.resp === me && h.completed_at === today.split('-').reverse().join('/')).length

  const [userModalOpen, setUserModalOpen] = useState(false)
  const [uName, setUName] = useState(currentUser.name)
  const [uRole, setURole] = useState(currentUser.role)
  const [uColor, setUColor] = useState(currentUser.color)
  const [passAtual, setPassAtual] = useState('')
  const [passNova, setPassNova] = useState('')
  const [passConf, setPassConf] = useState('')
  const [passErr, setPassErr] = useState('')

  // Tema claro / escuro
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('nexa-theme') as 'dark' | 'light') || 'dark'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : ''
    localStorage.setItem('nexa-theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  const openUserModal = () => {
    setUName(currentUser.name)
    setURole(currentUser.role || '')
    setUColor(currentUser.color)
    setPassAtual(''); setPassNova(''); setPassConf(''); setPassErr('')
    setUserModalOpen(true)
  }

  const saveUser = async () => {
    if (!uName.trim()) { showToast('⚠ Preencha o nome', 'warn'); return }
    const update: Partial<User> = { name: uName.trim(), role: uRole.trim(), color: uColor }

    // Troca de senha — só processa se o usuário preencheu algum campo
    if (passAtual || passNova || passConf) {
      if (!passAtual) { setPassErr('Informe a senha atual'); return }
      if (hashPass(passAtual) !== currentUser.pass_hash) { setPassErr('Senha atual incorreta'); return }
      if (!passNova) { setPassErr('Informe a nova senha'); return }
      if (passNova.length < 4) { setPassErr('A nova senha deve ter ao menos 4 caracteres'); return }
      if (passNova !== passConf) { setPassErr('As senhas não coincidem'); return }
      update.pass_hash = hashPass(passNova)
    }
    setPassErr('')
    const ok = await onUpdateUser(currentUser.id, update)
    if (ok) { showToast('✅ Perfil atualizado', 'success'); setUserModalOpen(false) }
    else showToast('❌ Erro ao salvar', 'error')
  }

  const nav = (p: Page) => setPage(p)

  return (
    <>
      <div className="sidebar">
        <div className="logo">
          <img src={logoImg} alt="Dinheiro em Caixa" className="logo-img" />
        </div>

        <div className="stats-grid">
          <div className="sc" onClick={() => nav('tasks')}>
            <div className="sc-n blue">{todayOpen}</div>
            <div className="sc-l">Hoje</div>
          </div>
          <div className="sc" onClick={() => nav('atrasadas')}>
            <div className="sc-n red">{myAtrasadas}</div>
            <div className="sc-l">Atraso</div>
          </div>
          <div className="sc" onClick={() => nav('history')}>
            <div className="sc-n green">{doneToday}</div>
            <div className="sc-l">Feitas</div>
          </div>
        </div>

        <nav className="nav">
          <div className="ns">Principal</div>
          <button className={`ni${page === 'tasks' ? ' active' : ''}`} onClick={() => nav('tasks')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            Minhas Tarefas
          </button>
          <button className={`ni${page === 'atrasadas' ? ' active' : ''}`} onClick={() => nav('atrasadas')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Atrasadas
            {myAtrasadas > 0 && <span className="nb">{myAtrasadas}</span>}
          </button>
          <button className={`ni${page === 'history' ? ' active' : ''}`} onClick={() => nav('history')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            Histórico
          </button>

          <div className="ns">Equipe</div>
          <button className={`ni${page === 'team' ? ' active' : ''}`} onClick={() => nav('team')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            Equipe
            <span className="nb blue">{team.length}</span>
          </button>
          <button className={`ni${page === 'meetings' ? ' active' : ''}`} onClick={() => nav('meetings')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Reuniões
          </button>
          <button className={`ni${page === 'messages' ? ' active' : ''}`} onClick={() => nav('messages')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            Mensagens
          </button>

          {isAdmin && (
            <>
              <div className="ns">Sistema</div>
              <button className={`ni${page === 'backup' ? ' active' : ''}`} onClick={() => nav('backup')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Backup
              </button>
            </>
          )}

          <div className="ns">Membros</div>
          {team.map(m => (
            <button key={m.id} className="ni" onClick={() => {
              // Will be handled by TasksPage memberFilter
              setPage('tasks')
            }} style={{ gap: '7px' }}>
              <div className="avsm" style={{ background: m.color }}>{getInitials(m.name)}</div>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                {m.name.split(' ')[0]}
              </span>
              {m.name === currentUser.name && <span style={{ fontSize: '9px', opacity: 0.5, marginLeft: 'auto' }}>eu</span>}
            </button>
          ))}
        </nav>

        <div className="user-area">
          <div className="uc" onClick={openUserModal}>
            <div className="av" style={{ background: currentUser.color }}>{getInitials(currentUser.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="un" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div>
              <div className="ur">{currentUser.role}</div>
            </div>
            <div className="od" />
          </div>
          <button className="logout-btn" onClick={onLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sair
          </button>
        </div>
      </div>

      {userModalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setUserModalOpen(false)}>
          <div className="modal" style={{ width: 460 }}>
            <div className="modal-title">Editar Perfil</div>

            {/* Preview do avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', background: uColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 800, color: '#fff',
                boxShadow: `0 0 0 4px ${uColor}44`
              }}>
                {getInitials(uName || currentUser.name)}
              </div>
            </div>

            {/* Nome e Cargo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field">
                <label className="label">Nome</label>
                <input className="inp" value={uName} onChange={e => setUName(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Cargo</label>
                <input className="inp" value={uRole} onChange={e => setURole(e.target.value)} />
              </div>
            </div>

            {/* E-mail (somente leitura) */}
            <div className="field">
              <label className="label">E-mail</label>
              <input className="inp" value={currentUser.email} readOnly
                style={{ opacity: 0.5, cursor: 'default' }} />
            </div>

            {/* Cor do avatar */}
            <div className="field">
              <label className="label">Cor do avatar</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {COLORS.map(c => (
                  <div key={c} onClick={() => setUColor(c)} style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: uColor === c ? '3px solid #fff' : '3px solid transparent',
                    boxShadow: uColor === c ? `0 0 0 2px ${c}` : 'none',
                    transition: 'all .15s',
                  }} />
                ))}
              </div>
            </div>

            {/* Tema */}
            <div className="field">
              <label className="label">Aparência</label>
              <button onClick={toggleTheme} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                transition: 'all .15s', width: '100%',
              }}>
                <span style={{ fontSize: 18 }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
                {theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
                <span style={{
                  marginLeft: 'auto', padding: '2px 8px', borderRadius: 20, fontSize: 11,
                  background: theme === 'dark' ? 'var(--bg4)' : 'var(--accentbg)',
                  color: theme === 'dark' ? 'var(--text3)' : 'var(--accent)',
                }}>
                  {theme === 'dark' ? 'Escuro' : 'Claro'}
                </span>
              </button>
            </div>

            {/* Separador */}
            <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0 12px', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1, marginBottom: 10 }}>
                ALTERAR SENHA <span style={{ fontWeight: 400, opacity: 0.6 }}>(deixe em branco para não alterar)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Senha atual</label>
                  <input className="inp" type="password" placeholder="••••••"
                    value={passAtual} onChange={e => { setPassAtual(e.target.value); setPassErr('') }} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Nova senha</label>
                  <input className="inp" type="password" placeholder="••••••"
                    value={passNova} onChange={e => { setPassNova(e.target.value); setPassErr('') }} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Confirmar</label>
                  <input className="inp" type="password" placeholder="••••••"
                    value={passConf} onChange={e => { setPassConf(e.target.value); setPassErr('') }} />
                </div>
              </div>
              {passErr && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>⚠ {passErr}</div>}
            </div>

            <div className="modal-footer">
              <button className="bcancel" onClick={() => setUserModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveUser}>💾 Salvar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
