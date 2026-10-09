import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Identificador do projeto herdado Pulse Agenda para bloqueio permanente de segurança
const BLOCKED_PULSE_IDENTIFIERS = ['zjysxpmfsazqsgwbpppy', 'pulse-agenda']

function validateAndCreateClient(): SupabaseClient {
  // Proteção 1: Bloqueia se as variáveis de ambiente estiverem ausentes
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      '[NEXA SECURITY] Variáveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não estão definidas. ' +
      'A inicialização do cliente Supabase foi impedida. Configure seu .env com as credenciais exclusivas do Nexa.'
    )
  }

  // Proteção 2: Bloqueia se a URL apontar para o projeto antigo do Pulse
  const isPulseLegacy = BLOCKED_PULSE_IDENTIFIERS.some((identifier) =>
    SUPABASE_URL.toLowerCase().includes(identifier)
  )

  if (isPulseLegacy) {
    throw new Error(
      '[NEXA SECURITY - BLOQUEIO CRÍTICO] A URL informada corresponde ao Supabase do Pulse Agenda. ' +
      'A conexão foi permanentemente bloqueada para proteger o projeto original.'
    )
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

let clientInstance: SupabaseClient

try {
  clientInstance = validateAndCreateClient()
} catch (error) {
  const securityMessage = error instanceof Error ? error.message : String(error)
  console.warn(securityMessage)

  // Emite Proxy seguro: bloqueia qualquer operação e impede requisições não autorizadas
  clientInstance = new Proxy({} as SupabaseClient, {
    get(_, prop) {
      if (prop === 'then') return undefined
      return () => {
        throw new Error(securityMessage)
      }
    }
  })
}

export const sb = clientInstance
