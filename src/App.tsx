import { useState, useEffect, useRef, useCallback } from 'react'
import './index.css'
// Import moved to page components
import { useAuth } from './hooks/useAuth'
import { useAppData } from './hooks/useAppData'
import { getTodayStr, getInitials, COLORS } from './lib/utils'
import type { Page, ViewMode, FilterMode, Task } from './types'
import { Sidebar } from './components/Sidebar'
import { TasksPage } from './pages/TasksPage'
import { HistoryPage } from './pages/HistoryPage'
import { AtrasadasPage } from './pages/AtrasadasPage'
import { TeamPage, MeetingsPage, MessagesPage, BackupPage } from "./pages/OtherPages"
import { TaskModal } from './components/TaskModal'
import { Toast } from './components/Toast'
import { LoginView } from './components/LoginView'

export default function App() {
  const { currentUser, authLoading, login, signup, logout, updateUser, resetPassword } = useAuth()
  const data = useAppData()
  const [appReady, setAppReady] = useState(false)
  const [page, setPage] = useState<Page>('tasks')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [searchQ, setSearchQ] = useState('')
  const [dateFilter, setDateFilter] = useState(getTodayStr())
  const [tagFilter, setTagFilter] = useState('')
  const [viewingAll, setViewingAll] = useState(() => {
    try { return localStorage.getItem('nexa_viewingAll') === 'true' } catch { return false }
  })
  const [memberFilter, setMemberFilter] = useState(() => {
    try { return localStorage.getItem('nexa_memberFilter') || 'all' } catch { return 'all' }
  })
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [taskModalDate, setTaskModalDate] = useState<string | undefined>()
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auth forms
  const [authTab, setAuthTab] = useState<'login' | 'signup' | 'recover'>('login')
  const [lEmail, setLEmail] = useState('')
  const [lPass, setLPass] = useState('')
  const [sName, setSName] = useState('')
  const [sRole, setSRole] = useState('')
  const [sEmail, setSEmail] = useState('')
  const [sPass, setSPass] = useState('')
  const [sColor, setSColor] = useState(COLORS[0])
  const [rEmail, setREmail] = useState('')
  const [rName, setRName] = useState('')
  const [rPass, setRPass] = useState('')
  const [authErr, setAuthErr] = useState('')
  const [authLoading2, setAuthLoading2] = useState(false)

  const showToast = useCallback((msg: string, type = 'info') => {
    setToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  // Launch app after login
  useEffect(() => {
    if (currentUser && !appReady) {
      data.loadAll().then(() => {
        setAppReady(true)
        data.checkDailyBackup()
      })
    }
    if (!currentUser) setAppReady(false)
  }, [currentUser])

  const handleLogin = async () => {
    setAuthErr(''); setAuthLoading2(true)
    const err = await login(lEmail, lPass)
    setAuthLoading2(false)
    if (err) setAuthErr(err)
  }

  const handleSignup = async () => {
    setAuthErr(''); setAuthLoading2(true)
    const err = await signup(sName, sRole, sEmail, sPass, sColor)
    setAuthLoading2(false)
    if (err) setAuthErr(err)
  }

  const handleRecover = async () => {
    setAuthErr(''); setAuthLoading2(true)
    const err = await resetPassword(rEmail, rName, rPass)
    setAuthLoading2(false)
    if (err) {
      setAuthErr(err)
    } else {
      showToast('✅ Senha redefinida com sucesso! Faça login.', 'success')
      setAuthTab('login')
      setRPass('')
    }
  }

  const openNewTask = (date?: string) => {
    setEditTaskId(null)
    setTaskModalDate(date)
    setTaskModalOpen(true)
  }

  const openEditTask = (id: string) => {
    setEditTaskId(id)
    setTaskModalDate(undefined)
    setTaskModalOpen(true)
  }

  const handleSaveTask = async (taskData: Partial<Task>) => {
    const ok = await data.saveTask(taskData, editTaskId || undefined)
    if (ok) {
      showToast(editTaskId ? '✏ Atualizada!' : '✅ Criada!', 'success')
      setTaskModalOpen(false)
    } else {
      showToast('❌ Erro ao salvar', 'error')
    }
  }

  const handleComplete = async (id: string, fromAtrasadas = false): Promise<boolean> => {
    const ok = await data.completeTask(id, fromAtrasadas)
    if (ok) showToast('✅ Concluída!', 'success')
    else showToast('❌ Erro ao concluir', 'error')
    return ok
  }

  const handleDelete = async (id: string, deleteAll = false) => {
    await data.deleteTask(id, deleteAll)
    showToast('🗑 Removida', 'warn')
  }

  const handleReopen = async (histId: string): Promise<boolean> => {
    const ok = await data.reopenTask(histId)
    if (ok) showToast('↩ Tarefa reaberta!', 'info')
    else showToast('❌ Erro ao reabrir', 'error')
    return ok
  }

  // LOADING SCREEN
  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="logo-icon loading-logo">N</div>
        <div className="loading-text">Carregando...</div>
      </div>
    )
  }

  // LOGIN SCREEN
  if (!currentUser) {
    return (
      <LoginView
        authTab={authTab}
        setAuthTab={setAuthTab}
        lEmail={lEmail}
        setLEmail={setLEmail}
        lPass={lPass}
        setLPass={setLPass}
        sName={sName}
        setSName={setSName}
        sRole={sRole}
        setSRole={setSRole}
        sEmail={sEmail}
        setSEmail={setSEmail}
        sPass={sPass}
        setSPass={setSPass}
        sColor={sColor}
        setSColor={setSColor}
        rEmail={rEmail}
        setREmail={setREmail}
        rName={rName}
        setRName={setRName}
        rPass={rPass}
        setRPass={setRPass}
        authErr={authErr}
        setAuthErr={setAuthErr}
        authLoading2={authLoading2}
        handleLogin={handleLogin}
        handleSignup={handleSignup}
        handleRecover={handleRecover}
      />
    )
  }

  // APP LOADING
  if (!appReady) {
    return (
      <div className="loading-screen">
        <div className="logo-icon loading-logo">P</div>
        <div className="loading-text">Carregando Pulse Agenda...</div>
      </div>
    )
  }

  const isAdmin = currentUser.is_admin === true

  const pageProps = {
    tasks: data.expandedTasks, // expandedTasks inclui virtuais para exibição
    hist: data.hist,
    meets: data.meets,
    team: data.team,
    tags: data.tags,
    atrasadas: data.allAtrasadas,
    backups: data.backups,
    currentUser,
    isAdmin,
    viewMode,
    filterMode,
    searchQ,
    dateFilter,
    tagFilter,
    viewingAll,
    memberFilter,
    setViewMode,
    setFilterMode,
    setSearchQ,
    setDateFilter,
    setTagFilter,
    setViewingAll,
    setMemberFilter,
    openNewTask,
    openEditTask,
    onComplete: handleComplete as (id: string, fromAtrasadas?: boolean) => Promise<boolean>,
    onDelete: handleDelete,
    onReopen: handleReopen as (histId: string) => Promise<boolean>,
    onCycleStatus: data.cycleStatus,
    onReorder: data.reorderTasks,
    onToggleSub: data.toggleSubtask,
    onAddSub: data.addSubtask,
    onDeleteSub: data.deleteSubtask,
    onDeleteAtrasada: data.deleteAtrasada,
    onSaveMeet: data.saveMeet,
    onDeleteMeet: data.deleteMeet,
    onSaveTag: data.saveTag,
    onDeleteTag: data.deleteTag,
    onUpdateTeam: data.updateTeamMember,
    onSaveBackup: data.saveBackupManual,
    onDeleteBackup: data.deleteBackup,
    onRestoreBackup: data.restoreFromBackup,
    onUpdateUser: updateUser,
    showToast,
    setPage,
  }

  return (
    <div id="app">
      <Sidebar
        page={page}
        setPage={setPage}
        currentUser={currentUser}
        isAdmin={isAdmin}
        tasks={data.expandedTasks}
        atrasadas={data.allAtrasadas}
        hist={data.hist}
        team={data.team}
        onLogout={logout}
        onUpdateUser={updateUser}
        showToast={showToast}
      />
      <div className="main">
        {page === 'tasks' && <TasksPage {...pageProps} />}
        {page === 'history' && <HistoryPage {...pageProps} />}
        {page === 'atrasadas' && <AtrasadasPage {...pageProps} />}
        {page === 'team' && <TeamPage {...pageProps} />}
        {page === 'meetings' && <MeetingsPage {...pageProps} />}
        {page === 'messages' && <MessagesPage {...pageProps} />}
        {page === 'backup' && <BackupPage {...pageProps} />}
      </div>

      {taskModalOpen && (
        <TaskModal
          editTask={editTaskId ? data.expandedTasks.find(t => t.id === editTaskId) : undefined}
          team={data.team}
          tags={data.tags}
          currentUser={currentUser}
          defaultDate={taskModalDate}
          onSave={handleSaveTask}
          onClose={() => setTaskModalOpen(false)}
          onSaveTag={data.saveTag}
          onDeleteTag={data.deleteTag}
          showToast={showToast}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
