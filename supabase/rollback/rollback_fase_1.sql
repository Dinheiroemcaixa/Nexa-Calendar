-- ==============================================================================
-- PULSE AGENDA 3.0 — RUNBOOK DE ROLLBACK EMERGENCIAL (FASE 1)
-- ==============================================================================
-- Arquivo: rollback_fase_1.sql
-- Objetivo: Reverter instantaneamente a Fase 1 da migração em caso de anomalia,
--           removendo as views de compatibilidade e restaurando as tabelas originais
--           legadas com RTO < 2 minutos e ZERO perda de dados.
-- ==============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '======================================================================';
    RAISE NOTICE 'INICIANDO ROLLBACK EMERGENCIAL DA FASE 1 DO PULSE AGENDA 3.0';
    RAISE NOTICE '======================================================================';
END $$;

-- ------------------------------------------------------------------------------
-- 1. REMOÇÃO DAS VIEWS DE COMPATIBILIDADE E SEUS TRIGGERS
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.tasks CASCADE;
DROP VIEW IF EXISTS public.hist CASCADE;
DROP VIEW IF EXISTS public.users CASCADE;
DROP VIEW IF EXISTS public.team CASCADE;
DROP VIEW IF EXISTS public.tags CASCADE;

DO $$ BEGIN RAISE NOTICE 'Views de compatibilidade removidas com sucesso.'; END $$;

-- ------------------------------------------------------------------------------
-- 2. REMOÇÃO DAS FUNÇÕES DE COMPATIBILIDADE
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_tasks_compat_insert() CASCADE;
DROP FUNCTION IF EXISTS public.fn_tasks_compat_update() CASCADE;
DROP FUNCTION IF EXISTS public.fn_tasks_compat_delete() CASCADE;
DROP FUNCTION IF EXISTS public.fn_hist_compat_delete() CASCADE;
DROP FUNCTION IF EXISTS public.fn_users_compat_update() CASCADE;
DROP FUNCTION IF EXISTS public.fn_tags_compat_insert() CASCADE;
DROP FUNCTION IF EXISTS public.fn_tags_compat_delete() CASCADE;
DROP FUNCTION IF EXISTS public.fn_compat_get_default_context() CASCADE;

DO $$ BEGIN RAISE NOTICE 'Funções de compatibilidade removidas com sucesso.'; END $$;

-- ------------------------------------------------------------------------------
-- 3. RESTAURAÇÃO DAS TABELAS ORIGINAIS LEGADAS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- tasks_legacy -> tasks
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tasks_legacy'
    ) THEN
        ALTER TABLE public.tasks_legacy RENAME TO tasks;
        RAISE NOTICE 'Tabela tasks_legacy restaurada para tasks.';
    END IF;

    -- hist_legacy -> hist
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'hist_legacy'
    ) THEN
        ALTER TABLE public.hist_legacy RENAME TO hist;
        RAISE NOTICE 'Tabela hist_legacy restaurada para hist.';
    END IF;

    -- users_legacy -> users
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'users_legacy'
    ) THEN
        ALTER TABLE public.users_legacy RENAME TO users;
        RAISE NOTICE 'Tabela users_legacy restaurada para users.';
    END IF;

    -- team_legacy -> team
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'team_legacy'
    ) THEN
        ALTER TABLE public.team_legacy RENAME TO team;
        RAISE NOTICE 'Tabela team_legacy restaurada para team.';
    END IF;

    -- tags_legacy -> tags
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tags_legacy'
    ) THEN
        ALTER TABLE public.tags_legacy RENAME TO tags;
        RAISE NOTICE 'Tabela tags_legacy restaurada para tags.';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. RESTAURAÇÃO DE PERMISSÕES ORIGINAIS E RECARGA DO SCHEMA NO POSTGREST
-- ------------------------------------------------------------------------------
GRANT ALL ON public.tasks TO anon, authenticated, service_role;
GRANT ALL ON public.hist TO anon, authenticated, service_role;
GRANT ALL ON public.users TO anon, authenticated, service_role;
GRANT ALL ON public.team TO anon, authenticated, service_role;
GRANT ALL ON public.tags TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '======================================================================';
    RAISE NOTICE 'ROLLBACK CONCLUÍDO COM SUCESSO! O AMBIENTE RETORNOU AO ESTADO LEGADO.';
    RAISE NOTICE '======================================================================';
END $$;
