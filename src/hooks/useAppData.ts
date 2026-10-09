import { useState, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { genId, getTodayStr, isTodayValidForRecur, getNextOccurrenceAfter, isLate } from '../lib/utils'
import type { Task, TeamMember, Meeting, Tag, Backup } from '../types'

// ============================================================
// LÓGICA DE RECORRÊNCIA — ARQUITETURA VIRTUAL
//
// PRINCÍPIO: Cada série recorrente tem APENAS 1 registro mestre no banco.
// As ocorrências diárias são geradas VIRTUALMENTE no front-end.
//
// FLUXO:
//  - Abrir o app → gera ocorrências virtuais para exibição (sem gravar no banco)
//  - Concluir uma virtual → materializa no banco como completed=true
//  - Tarefa real já concluída → bloqueia nova virtual para aquela data
//  - Tarefa vencida (data < hoje, não concluída) → aparece como atrasada
//
// BANCO:
//  - tasks: mestres das séries + tarefas únicas + ocorrências materializadas
//  - atrasadas: tarefas NÃO recorrentes que venceram (só para registro)
//  - hist: tudo que foi concluído
//
// CORREÇÃO DO BUG do app antigo:
//  - recurrenceMasters filtra status !== 'completed' E !completed
//  - Mestre do grupo = ocorrência mais RECENTE (não mais antiga)
// ============================================================

export function useAppData() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [hist, setHist] = useState<Task[]>([])
  const [meets, setMeets] = useState<Meeting[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(false)

  // Estado local para subtarefas de tarefas virtuais (não persiste no tasks state)
  // Chave: virtual task ID → array de booleans (done por índice)
  const [vsOverrides, setVsOverrides] = useState<Record<string, boolean[]>>({})

  // ── EXPANDED TASKS (lógica virtual) ──────────────────────
  // Gera ocorrências virtuais para todas as séries recorrentes
  // SEM criar registros no banco
  const expandedTasks = useMemo(() => {
    const todayStr = getTodayStr()
    const today = new Date(todayStr + 'T00:00:00')

    // CORREÇÃO DEFINITIVA: NÃO gerar virtuais no passado.
    // Tarefas de dias anteriores que não foram concluídas simplesmente não existem mais.
    // Isso impede o bug de "atrasadas fantasmas" que se multiplicavam ao dar refresh.
    const rangeStart = new Date(today) // Começa em HOJE, sem olhar para trás
    const rangeEnd = new Date(today); rangeEnd.setDate(rangeEnd.getDate() + 90)

    // Unificar fonte de dados: Tarefas atuais
    const result: Task[] = [...tasks]

    // Lookup de datas já materializadas por série
    // Key: recur_group_id_YYYY-MM-DD
    const materializedKeys = new Set<string>()
    tasks.forEach(t => {
      if (t.recur_group_id && t.date) {
        materializedKeys.add(`${t.recur_group_id}_${t.date}`)
      }
    })

    // Agrupa mestres por série — pega o mais RECENTE não concluído
    // CORREÇÃO DO BUG: mestres devem ser não-concluídos
    const recurrenceMasters = tasks.filter(t =>
      t.recur && t.recur !== 'none' &&
      t.recur_group_id &&
      t.status !== 'Concluída'  // ← CORREÇÃO: exclui concluídas
    )

    const groups: Record<string, Task> = {}
    recurrenceMasters.forEach(t => {
      const gid = t.recur_group_id!
      if (!groups[gid]) {
        groups[gid] = t
      } else {
        // MESTRE = O mais ANTIGO não concluído para servir de âncora para o gerador
        // Isso impede que surjam "novas" tarefas atrasadas ao deletar as recentes
        if (t.date < groups[gid].date) {
          groups[gid] = t
        }
      }
    })

    // Para cada série, gera ocorrências virtuais no range
    Object.values(groups).forEach(master => {
      const recurStart = master.recur_start || master.date
      const masterDate = new Date(recurStart + 'T00:00:00')

      // Itera dia a dia dentro do range
      const current = new Date(Math.max(masterDate.getTime(), rangeStart.getTime()))
      current.setHours(0, 0, 0, 0)

      let count = 0
      while (current <= rangeEnd && count < 1000) {
        const y = current.getFullYear()
        const mo = String(current.getMonth() + 1).padStart(2, '0')
        const dy = String(current.getDate()).padStart(2, '0')
        const dateStr = `${y}-${mo}-${dy}`
        const key = `${master.recur_group_id}_${dateStr}`

        // Só gera virtual se não existe registro real para esta data/série
        if (!materializedKeys.has(key)) {
          const recurDays = Array.isArray(master.recur_days) ? master.recur_days : []
          const dayOfWeek = current.getDay()
          let matches = false

          if (master.recur === 'daily') {
            matches = true
          } else if (master.recur === 'weekdays') {
            matches = dayOfWeek >= 1 && dayOfWeek <= 5
          } else if (master.recur === 'weekly') {
            const orig = new Date(recurStart + 'T00:00:00')
            matches = orig.getDay() === dayOfWeek
          } else if (master.recur === 'monthly') {
            const orig = new Date(recurStart + 'T00:00:00')
            matches = orig.getDate() === current.getDate()
          } else if (master.recur === 'custom' && recurDays.length > 0) {
            const dayNames = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
            matches = recurDays.includes(dayNames[dayOfWeek])
          }

          if (matches) {
            const virtualId = `virtual_${master.recur_group_id}_${dateStr}`
            const override = vsOverrides[virtualId]
            result.push({
              ...master,
              id: virtualId,
              date: dateStr,
              status: 'Em Aberto',
              // Usa override local se existir, senão inicia do zero (done: false)
              subtasks: (master.subtasks || []).map((s, i) => ({
                ...s,
                done: override ? (override[i] ?? false) : false,
              })),
              completed_at: undefined,
              moved_at: undefined,
              isVirtual: true as any,
            })
          }
        }

        current.setDate(current.getDate() + 1)
        count++
      }
    })

    // Desduplicação final: Real > Virtual para mesmo grupo+data
    const finalResult: Task[] = []
    const seenKeys = new Map<string, Task>()

    result.forEach(t => {
      const key = t.recur_group_id
        ? `${t.recur_group_id}_${t.date}`
        : t.id

      if (!seenKeys.has(key)) {
        seenKeys.set(key, t)
        finalResult.push(t)
      } else {
        const existing = seenKeys.get(key)!
        const isNewReal = !(t as any).isVirtual && (existing as any).isVirtual
        if (isNewReal) {
          seenKeys.set(key, t)
          const idx = finalResult.findIndex(x => x === existing)
          if (idx !== -1) finalResult[idx] = t
        }
      }
    })

    return finalResult
  }, [tasks, vsOverrides])

  // ── TAREFAS ATRASADAS DA LISTA PRINCIPAL ─────────────────
  // Captura qualquer tarefa no estado 'tasks' que esteja com data passada
  // e não concluída. Isso unifica contadores para recorrentes e não-recorrentes.
  const atrasadasDaLista = useMemo(() => {
    const todayStr = getTodayStr()
    return tasks.filter(t =>
      t.date && t.date < todayStr &&
      t.status !== 'Concluída'
    )
  }, [tasks])

  // ── UNIFICAÇÃO DE ATRASADAS ──────────────────────────────
  // Agora usamos a lista expandida como fonte única de verdade.
  // Qualquer instância (real ou virtual) que esteja atrasada será contada.
  const allAtrasadas = useMemo(() => {
    return expandedTasks.filter((t: Task) => isLate(t))
  }, [expandedTasks])

  // ── LOAD ALL ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    
    // Auto-paginação para buscar todas as tarefas e driblar o limite de 1000 linhas
    const fetchAllTasks = async () => {
      let all: any[] = []
      let from = 0
      const step = 1000
      while (true) {
        const { data, error } = await sb.from('tasks').select('*').order('sort_order', { ascending: true }).range(from, from + step - 1)
        if (error || !data || data.length === 0) break
        all = all.concat(data)
        if (data.length < step) break
        from += step
      }
      return { data: all }
    }

    const [tasksRes, histRes, meetsRes, teamRes, tagsRes, backupsRes] = await Promise.all([
      fetchAllTasks(),
      sb.from('hist').select('*').order('created_at', { ascending: false }).limit(1000),
      sb.from('meets').select('*').order('created_at', { ascending: false }),
      sb.from('team').select('*'),
      sb.from('tags').select('*'),
      sb.from('backup_tasks').select('id,backup_date,backup_label,created_at').order('created_at', { ascending: false }).limit(30),
    ])

    // Normaliza campos de data (remove parte de hora se houver) para evitar bugs de filtro e recorrência
    const normalizeDate = (d?: string) => d ? d.substring(0, 10) : d

    setHist((histRes.data || []).map(h => ({
      ...h,
      date: normalizeDate(h.date),
      recur_start: normalizeDate(h.recur_start)
    })))
    setMeets(meetsRes.data || [])
    setTeam(teamRes.data || [])
    setTags(tagsRes.data || [])
    setBackups(backupsRes.data || [])

    setTasks((tasksRes.data || []).map(t => ({
      ...t,
      date: normalizeDate(t.date),
      recur_start: normalizeDate(t.recur_start)
    })))
    setLoading(false)
  }, [])

  // ── SAVE TASK ─────────────────────────────────────────────
  const saveTask = useCallback(async (taskData: Partial<Task>, editId?: string): Promise<boolean> => {
    // Se editando uma virtual, materializa como nova tarefa real
    const isVirtual = editId?.startsWith('virtual_')

    // Limpar campos que não pertencem ao banco (como isVirtual)
    const { isVirtual: _iv, ...cleanData } = taskData as any
    // Sanitizar responsável
    if (cleanData.resp) cleanData.resp = cleanData.resp.trim()

    if (editId && !isVirtual) {
      // Editar tarefa real existente
      const { error } = await sb.from('tasks').update(cleanData).eq('id', editId)
      if (error) {
        console.error('❌ Erro ao atualizar tarefa:', error)
        return false
      }
      setTasks(prev => prev.map(t => t.id === editId ? { ...t, ...cleanData } : t))
    } else {
      // Nova tarefa ou materialização de virtual
      const id = genId()
      const { data: allTasks } = await sb.from('tasks').select('sort_order').order('sort_order', { ascending: false }).limit(1)
      const maxOrder = (allTasks && allTasks.length > 0) ? (allTasks[0].sort_order || 0) : 0

      // Gerar recur_group_id para novas tarefas recorrentes
      const recur_group_id = cleanData.recur && cleanData.recur !== 'none'
        ? (cleanData.recur_group_id || `rg_${id}`)
        : undefined

      const newTask = {
        ...cleanData,
        id,
        recur_group_id,
        sort_order: maxOrder + 1,
        created_at: new Date().toISOString()
      } as Task

      const { error } = await sb.from('tasks').insert(newTask)
      if (error) {
        console.error('❌ Erro Supabase (insert task):', error)
        return false
      }
      setTasks(prev => [...prev, newTask])
    }
    return true
  }, [])

  // ── COMPLETE TASK ─────────────────────────────────────────
  const completeTask = useCallback(async (id: string, fromAtrasadas = false): Promise<boolean> => {
    const isVirtual = id.startsWith('virtual_')

    // Busca a tarefa de acordo com a origem
    // fromAtrasadas=true pode vir da tabela atrasadas (não-recorrente) OU de atrasadasRecorrentes (virtual/mestre)
    let t: Task | undefined
    if (isVirtual) {
      t = expandedTasks.find(x => x.id === id)
    } else if (fromAtrasadas) {
      // Agora 'atrasadas' são apenas tasks com data passada — buscamos no expandedTasks
      t = expandedTasks.find(x => x.id === id) || tasks.find(x => x.id === id)
    } else {
      t = tasks.find(x => x.id === id)
    }

    if (!t) return false

    const completedAt = new Date().toLocaleDateString('pt-BR')
    const histItem = {
      id: genId(),
      descricao: t.descricao,
      resp: t.resp,
      date: t.date || null,
      prio: t.prio || 'Média',
      status: 'Concluída' as const,
      all_day: t.all_day !== undefined ? t.all_day : true,
      time_start: t.time_start || null,
      time_end: t.time_end || null,
      tags: t.tags || [],
      recur: t.recur || 'none',
      recur_days: t.recur_days || [],
      recur_start: t.recur_start || null,
      recur_group_id: (t as any).recur_group_id || null,
      subtasks: t.subtasks || [],
      notes: t.notes || null,
      is_meeting: t.is_meeting || false,
      completed_at: completedAt,
    }

    const { error: histErr } = await sb.from('hist').insert(histItem)
    if (histErr) { console.error('Erro hist:', histErr); return false }

    if (isVirtual) {
      // Tarefa virtual: materializa como concluída no banco
      const { isVirtual: _iv, ...payload } = t as any
      const completedPayload = {
        ...payload,
        id: histItem.id,
        status: 'Concluída' as const,
        completed_at: completedAt,
      }
      const { error } = await sb.from('tasks').insert(completedPayload)
      if (!error) {
        // Atualiza estado local para remover virtual imediatamente do atrasadasRecorrentes
        setTasks(prev => [...prev, completedPayload])
      } else {
        console.warn('Aviso: não materializou virtual como concluída:', error)
      }

    } else if ((t as any).recur_group_id && t.recur && t.recur !== 'none') {
      // ── TAREFA MESTRE RECORRENTE ────────────────────────────
      // NUNCA deletar o mestre — isso quebraria toda a série futura.
      // Em vez disso:
      //   1. Materializa a data original como concluída (bloqueia re-geração virtual)
      //   2. Avança o mestre para a próxima ocorrência após hoje
      const originalDate = t.date
      const completedRecord = {
        ...(t as any),
        id: genId(),
        date: originalDate,
        status: 'Concluída' as const,
        completed_at: completedAt,
        isVirtual: undefined,
      }
      await sb.from('tasks').insert(completedRecord)
      setTasks(prev => [...prev, completedRecord])

      // Avança o mestre para a próxima ocorrência depois de HOJE
      const nextDate = getNextOccurrenceAfter(
        t.recur!,
        t.recur_days || [],
        t.recur_start || originalDate,
        originalDate // Calcula baseado na data atual da tarefa, não no dia de hoje, para não perder histórico
      )
      if (nextDate) {
        await sb.from('tasks').update({ date: nextDate }).eq('id', id)
        setTasks(prev => prev.map(x => x.id === id ? { ...x, date: nextDate } : x))
      } else {
        // Série esgotada — sem mais ocorrências futuras
        await sb.from('tasks').delete().eq('id', id)
        setTasks(prev => prev.filter(x => x.id !== id))
      }

    } else {
      // Tarefa não-recorrente comum
      await sb.from('tasks').delete().eq('id', id)
      setTasks(prev => prev.filter(x => x.id !== id))
    }

    setHist(prev => [histItem as unknown as Task, ...prev])
    return true
  }, [tasks, expandedTasks])

  // ── DELETE TASK ───────────────────────────────────────────
  const deleteTask = useCallback(async (id: string, deleteAll = false): Promise<void> => {
    const isVirtual = id.startsWith('virtual_')
    
    if (isVirtual) {
      // Tarefa virtual: para "deletar" sem apagar a série, 
      // materializamos ela como 'Concluída' no banco para aquela data específica.
      const t = expandedTasks.find(x => x.id === id)
      if (!t) return
      
      const { isVirtual: _iv, ...payload } = t as any
      const completedAt = new Date().toLocaleDateString('pt-BR')
      const deletedRecord = {
        ...payload,
        id: genId(),
        status: 'Concluída' as const,
        completed_at: completedAt,
      }
      await sb.from('tasks').insert(deletedRecord)
      setTasks(prev => [...prev, deletedRecord])
      return
    }

    const t = tasks.find(x => x.id === id)
    if (!t) return

    if (deleteAll && t.recur_group_id) {
      // Deleta todos os registros reais da série
      await sb.from('tasks').delete().eq('recur_group_id', t.recur_group_id)
      setTasks(prev => prev.filter(x => x.recur_group_id !== t.recur_group_id))
    } else {
      await sb.from('tasks').delete().eq('id', id)
      setTasks(prev => prev.filter(x => x.id !== id))
    }
  }, [tasks, expandedTasks])

  // ── CYCLE STATUS ──────────────────────────────────────────
  const cycleStatus = useCallback(async (id: string): Promise<void> => {
    const isVirtual = id.startsWith('virtual_')
    if (isVirtual) return // Não altera status de virtual sem materializar

    const t = tasks.find(x => x.id === id)
    if (!t) return
    const newStatus = t.status === 'Em Aberto' ? 'Em Andamento' : 'Em Aberto'
    const { error } = await sb.from('tasks').update({ status: newStatus }).eq('id', id)
    if (error) {
      console.error('❌ Erro Supabase (cycleStatus):', error)
      return
    }
    setTasks(prev => prev.map(x => x.id === id ? { ...x, status: newStatus } : x))
  }, [tasks])

  const reorderTasks = useCallback(async (reordered: Task[]): Promise<void> => {
    // Filtra apenas tarefas reais (exclui virtuais geradas pelo expandedTasks)
    // Sem esse filtro, setTasks recebe centenas de virtuais passadas,
    // corrompendo atrasadasRecorrentes e causando o bug do contador 122+
    const realOnly = reordered.filter(t => !String(t.id).startsWith('virtual_'))
    setTasks(realOnly)
    const updates = realOnly.map((t, i) => sb.from('tasks').update({ sort_order: i }).eq('id', t.id))
    await Promise.all(updates)
  }, [])

  const reopenTask = useCallback(async (histId: string): Promise<boolean> => {
    const h = hist.find(x => x.id === histId)
    if (!h) return false
    const todayStr = getTodayStr()
    const { data: allTasks } = await sb.from('tasks').select('sort_order').order('sort_order', { ascending: false }).limit(1)
    const maxOrder = allTasks?.[0]?.sort_order ?? -1
    const newTask: Task = {
      ...h,
      id: genId(),
      date: todayStr,
      status: 'Em Aberto',
      recur: 'none',
      recur_days: [],
      recur_start: undefined,
      recur_group_id: undefined,
      completed_at: undefined,
      sort_order: 0,
    } as Task
    const allCurrent = await sb.from('tasks').select('id,sort_order').order('sort_order', { ascending: true })
    if (allCurrent.data) {
      const ups = allCurrent.data.map(t => sb.from('tasks').update({ sort_order: (t.sort_order || 0) + 1 }).eq('id', t.id))
      await Promise.all(ups)
      setTasks(prev => prev.map(t => ({ ...t, sort_order: (t.sort_order || 0) + 1 })))
    }
    const { error } = await sb.from('tasks').insert(newTask)
    if (error) {
      console.error('❌ Erro Supabase (reopenTask):', error)
      return false
    }
    await sb.from('hist').delete().eq('id', histId)
    setTasks(prev => [newTask, ...prev])
    setHist(prev => prev.filter(x => x.id !== histId))
    return true
  }, [hist])

  const deleteAtrasada = useCallback(async (id: string): Promise<void> => {
    // Virtual recorrente → materializa como concluída silenciosamente (sem hist)
    if (id.startsWith('virtual_')) {
      const t = expandedTasks.find(x => x.id === id)
      if (t) {
        const { isVirtual: _iv, ...payload } = t as any
        const skipped = { ...payload, id: genId(), status: 'Concluída' as const, completed_at: new Date().toLocaleDateString('pt-BR') }
        await sb.from('tasks').insert(skipped)
        setTasks(prev => [...prev, skipped])
      }
      return
    }
    // Tarefa mestre recorrente vencida ou tarefa comum no state tasks
    const t = tasks.find(x => x.id === id)
    if (!t) return

    if ((t as any).recur_group_id && t.recur && t.recur !== 'none') {
      const completedAt = new Date().toLocaleDateString('pt-BR')
      const completedRecord = { ...t, id: genId(), status: 'Concluída' as const, completed_at: completedAt }
      await sb.from('tasks').insert(completedRecord)
      setTasks(prev => [...prev, completedRecord])

      const nextDate = getNextOccurrenceAfter(t.recur!, t.recur_days || [], t.recur_start || t.date, t.date)
      if (nextDate) {
        await sb.from('tasks').update({ date: nextDate }).eq('id', id)
        setTasks(prev => prev.map(x => x.id === id ? { ...x, date: nextDate } : x))
      } else {
        await sb.from('tasks').delete().eq('id', id)
        setTasks(prev => prev.filter(x => x.id !== id))
      }
    } else {
      // Tarefa comum (não recorrente) vinda do tasks state
      await sb.from('tasks').delete().eq('id', id)
      setTasks(prev => prev.filter(x => x.id !== id))
    }
  }, [tasks, expandedTasks])

  // ── MEETINGS ──────────────────────────────────────────────
  const saveMeet = useCallback(async (meetData: Partial<Meeting>, editId?: string): Promise<boolean> => {
    if (editId) {
      const { error } = await sb.from('meets').update(meetData).eq('id', editId)
      if (error) return false
      setMeets(prev => prev.map(m => m.id === editId ? { ...m, ...meetData } : m))
    } else {
      const id = genId()
      const newMeet = { ...meetData, id } as Meeting
      const { error } = await sb.from('meets').insert(newMeet)
      if (error) return false
      setMeets(prev => [newMeet, ...prev])
    }
    return true
  }, [])

  const deleteMeet = useCallback(async (id: string): Promise<void> => {
    await sb.from('meets').delete().eq('id', id)
    setMeets(prev => prev.filter(m => m.id !== id))
  }, [])

  // ── TAGS ──────────────────────────────────────────────────
  const saveTag = useCallback(async (name: string, color: string, bg: string): Promise<boolean> => {
    const id = genId()
    const newTag = { id, name, color, bg }
    const { error } = await sb.from('tags').insert(newTag)
    if (error) return false
    setTags(prev => [...prev, newTag])
    return true
  }, [])

  const deleteTag = useCallback(async (id: string): Promise<void> => {
    await sb.from('tags').delete().eq('id', id)
    setTags(prev => prev.filter(t => t.id !== id))
  }, [])

  // ── SUBTASKS ──────────────────────────────────────────────
  const toggleSubtask = useCallback(async (taskId: string, idx: number): Promise<void> => {
    const isVirtual = taskId.startsWith('virtual_')

    if (isVirtual) {
      // Tarefa virtual: atualiza o override local (não toca no tasks state)
      // e persiste a alteração no mestre para referência futura
      const virtualTask = expandedTasks.find(x => x.id === taskId)
      if (!virtualTask || !(virtualTask as any).recur_group_id) return
      const master = tasks.find(x =>
        (x as any).recur_group_id === (virtualTask as any).recur_group_id &&
        !String(x.id).startsWith('virtual_') &&
        x.status !== 'Concluída'
      )
      if (!master) return
      // Calcula o novo estado: parte do override existente ou do estado atual da virtual
      const current = vsOverrides[taskId] ?? (virtualTask.subtasks || []).map(s => s.done)
      const newDone = current.map((d, i) => i === idx ? !d : d)
      setVsOverrides(prev => ({ ...prev, [taskId]: newDone }))
      // Persiste no mestre em background (sem alterar tasks state)
      const masterUpdated = (master.subtasks || []).map((s, i) => ({ ...s, done: newDone[i] ?? s.done }))
      await sb.from('tasks').update({ subtasks: masterUpdated }).eq('id', master.id)
      return
    }

    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    const updated = t.subtasks.map((s, i) => i === idx ? { ...s, done: !s.done } : s)
    await sb.from('tasks').update({ subtasks: updated }).eq('id', taskId)
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, subtasks: updated } : x))
  }, [tasks, expandedTasks, vsOverrides])

  const addSubtask = useCallback(async (taskId: string, text: string): Promise<void> => {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    const updated = [...t.subtasks, { text, done: false }]
    await sb.from('tasks').update({ subtasks: updated }).eq('id', taskId)
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, subtasks: updated } : x))
  }, [tasks])

  const deleteSubtask = useCallback(async (taskId: string, idx: number): Promise<void> => {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    const updated = t.subtasks.filter((_, i) => i !== idx)
    await sb.from('tasks').update({ subtasks: updated }).eq('id', taskId)
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, subtasks: updated } : x))
  }, [tasks])

  // ── TEAM ──────────────────────────────────────────────────
  const updateTeamMember = useCallback(async (id: string, data: Partial<TeamMember>): Promise<boolean> => {
    const { error } = await sb.from('team').update(data).eq('id', id)
    if (error) return false
    setTeam(prev => prev.map(m => m.id === id ? { ...m, ...data } : m))
    return true
  }, [])

  // ── BACKUP 2.0 ──────────────────────────────────────────
  const createFullSnapshot = useCallback(() => {
    return {
      tasks,
      hist,
      meets,
      atrasadas: [],
      tags,
      team,
      version: '2.0',
      generated_at: new Date().toISOString()
    }
  }, [tasks, hist, meets, tags, team])

  const downloadBackupFile = (snapshot: any, label: string) => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nexa_backup_${getTodayStr()}_${label.replace(/\s+/g, '_')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const checkDailyBackup = useCallback(async (): Promise<void> => {
    const todayStr = getTodayStr()
    const now = new Date()
    const hour = now.getHours()
    const period = hour < 12 ? 'Manhã' : 'Tarde'
    const autoLabel = `Auto ${now.toLocaleDateString('pt-BR')} - ${period}`
    
    // Permite até 2 backups automáticos por dia (manhã e tarde)
    const { data: todayBackups } = await sb.from('backup_tasks')
      .select('id, backup_label')
      .ilike('backup_label', 'Auto%')
      .eq('backup_date', todayStr)
    
    if (todayBackups && todayBackups.length >= 2) return // Já tem 2 hoje, não cria mais

    // Verifica se já existe um backup para este período (manhã/tarde)
    const alreadyHasPeriod = todayBackups?.some(b => b.backup_label.includes(period))
    if (alreadyHasPeriod) return // Já tem backup deste período

    // Limpa backups automáticos com mais de 7 dias
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const cutoffDate = sevenDaysAgo.toISOString().split('T')[0] // YYYY-MM-DD

    const { data: oldAutos } = await sb.from('backup_tasks')
      .select('id, backup_date')
      .ilike('backup_label', 'Auto%')
      .lt('backup_date', cutoffDate)
    
    if (oldAutos && oldAutos.length > 0) {
      await sb.from('backup_tasks').delete().in('id', oldAutos.map(b => b.id))
    }

    const id = genId()
    const snapshot = createFullSnapshot()
    
    const { error } = await sb.from('backup_tasks').insert({ 
      id, 
      backup_date: todayStr, 
      backup_label: autoLabel, 
      tasks_snapshot: snapshot 
    })

    if (!error) {
      // Recarrega lista de backups para refletir o novo + remoção dos antigos
      const { data: refreshed } = await sb.from('backup_tasks')
        .select('id,backup_date,backup_label,created_at')
        .order('created_at', { ascending: false })
        .limit(30)
      setBackups(refreshed || [])
      // Dispara download para o PC
      downloadBackupFile(snapshot, `Automatico_${period}`)
    }
  }, [backups, createFullSnapshot])

  const saveBackupManual = useCallback(async (label: string): Promise<void> => {
    const id = genId()
    const todayStr = getTodayStr()
    const finalLabel = label || `Manual ${new Date().toLocaleDateString('pt-BR')}`
    const snapshot = createFullSnapshot()

    const { error } = await sb.from('backup_tasks').insert({ 
      id, 
      backup_date: todayStr, 
      backup_label: finalLabel, 
      tasks_snapshot: snapshot 
    })

    if (!error) {
      const { data } = await sb.from('backup_tasks').select('id,backup_date,backup_label,created_at').order('created_at', { ascending: false }).limit(30)
      setBackups(data || [])
      downloadBackupFile(snapshot, finalLabel)
    }
  }, [createFullSnapshot])

  const deleteBackup = useCallback(async (id: string): Promise<void> => {
    await sb.from('backup_tasks').delete().eq('id', id)
    setBackups(prev => prev.filter(b => b.id !== id))
  }, [])

  const restoreFromBackup = useCallback(async (backupIdOrSnapshot: string | any): Promise<boolean> => {
    setLoading(true)
    let snapshot: any = null

    if (typeof backupIdOrSnapshot === 'string') {
      const { data, error } = await sb.from('backup_tasks').select('tasks_snapshot').eq('id', backupIdOrSnapshot).single()
      if (error || !data) { setLoading(false); return false }
      snapshot = data.tasks_snapshot
    } else {
      snapshot = backupIdOrSnapshot
    }

    if (!snapshot) { setLoading(false); return false }

    try {
      // 1. Limpar tabelas atuais no Supabase
      // Nota: Team não é limpo para evitar perder acesso ao app se algo der errado, 
      // mas as outras tabelas de dados sim.
      await Promise.all([
        sb.from('tasks').delete().neq('id', 'placeholder'),
        sb.from('hist').delete().neq('id', 'placeholder'),
        sb.from('meets').delete().neq('id', 'placeholder'),
        sb.from('tags').delete().neq('id', 'placeholder'),
      ])

      // 2. Inserir dados do backup
      const inserts = []
      if (snapshot.tasks?.length) inserts.push(sb.from('tasks').insert(snapshot.tasks))
      if (snapshot.hist?.length) inserts.push(sb.from('hist').insert(snapshot.hist))
      if (snapshot.meets?.length) inserts.push(sb.from('meets').insert(snapshot.meets))
      if (snapshot.tags?.length) inserts.push(sb.from('tags').insert(snapshot.tags))

      await Promise.all(inserts)
      
      // 3. Atualizar estado local
      setTasks(snapshot.tasks || [])
      setHist(snapshot.hist || [])
      setMeets(snapshot.meets || [])
      // setAtrasadas removido — tudo unificado em tasks
      setTags(snapshot.tags || [])
      if (snapshot.team?.length) {
        // Opcional: atualizar equipe se contido no backup
        setTeam(snapshot.team)
      }

      setLoading(false)
      return true
    } catch (err) {
      console.error('Erro na restauração:', err)
      setLoading(false)
      return false
    }
  }, [])

  return {
    tasks,
    expandedTasks,
    hist, meets, team, tags, loading,
    atrasadas: allAtrasadas,
    atrasadasDaLista: allAtrasadas, 
    atrasadasRecorrentes: allAtrasadas, 
    allAtrasadas, backups,
    setTasks, setHist, setMeets, setTeam, setTags,
    loadAll,
    saveTask, completeTask, deleteTask, cycleStatus, reorderTasks, reopenTask, deleteAtrasada,
    saveMeet, deleteMeet,
    saveTag, deleteTag,
    toggleSubtask, addSubtask, deleteSubtask,
    updateTeamMember,
    checkDailyBackup, saveBackupManual, deleteBackup, restoreFromBackup,
  }
}
