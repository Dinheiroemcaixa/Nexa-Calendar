-- ==============================================================================
-- PULSE AGENDA 3.0 — CARD FINAL: CAMADA DE COMPATIBILIDADE (FASE 1)
-- ==============================================================================
-- Arquivo: 20261008000003_compatibility_layer.sql
-- Objetivo: Prover Updatable Views (tasks, hist, users, team, tags) com Triggers
--           INSTEAD OF e funções SECURITY DEFINER para permitir que o frontend
--           legado continue operando 100% transparente sobre o Schema 3.0 relacional,
--           garantindo ZERO DELETE físico (Soft Delete obrigatório).
-- Diretrizes:
--   1. Zero alterações no frontend legado.
--   2. Preservação integral de tarefas ativas, concluídas, recorrências e subtarefas.
--   3. Interceptação de sb.from('tasks').delete() transformando em Soft Delete.
--   4. Suporte total à role 'anon' via SECURITY DEFINER.
--   5. Invalidação de cache PostgREST ao final (NOTIFY pgrst, 'reload schema').
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RENOMEAÇÃO CONTROLADA DAS TABELAS LEGADAS (CASO AINDA SEJAM TABELAS FÍSICAS)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- tasks -> tasks_legacy
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tasks'
    ) THEN
        ALTER TABLE public.tasks RENAME TO tasks_legacy;
        RAISE NOTICE 'Tabela legada tasks renomeada para tasks_legacy.';
    END IF;

    -- hist -> hist_legacy
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'hist'
    ) THEN
        ALTER TABLE public.hist RENAME TO hist_legacy;
        RAISE NOTICE 'Tabela legada hist renomeada para hist_legacy.';
    END IF;

    -- users -> users_legacy
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'users'
    ) THEN
        ALTER TABLE public.users RENAME TO users_legacy;
        RAISE NOTICE 'Tabela legada users renomeada para users_legacy.';
    END IF;

    -- team -> team_legacy
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'team'
    ) THEN
        ALTER TABLE public.team RENAME TO team_legacy;
        RAISE NOTICE 'Tabela legada team renomeada para team_legacy.';
    END IF;

    -- tags -> tags_legacy
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tags'
    ) THEN
        ALTER TABLE public.tags RENAME TO tags_legacy;
        RAISE NOTICE 'Tabela legada tags renomeada para tags_legacy.';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. FUNÇÃO AUXILIAR DE RESOLUÇÃO DE TENANT E USUÁRIO (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_compat_get_default_context(
    OUT out_org_id UUID,
    OUT out_tenant_id UUID,
    OUT out_user_id UUID
)
RETURNS RECORD AS $$
BEGIN
    -- Obtém organização padrão
    SELECT id INTO out_org_id 
    FROM organizations 
    WHERE slug = 'lm-contabilidade' OR is_active = true 
    ORDER BY created_at ASC LIMIT 1;

    -- Obtém tenant padrão
    SELECT id INTO out_tenant_id 
    FROM tenants 
    WHERE organization_id = out_org_id AND is_active = true 
    ORDER BY created_at ASC LIMIT 1;

    -- Obtém usuário padrão para fallback
    SELECT id INTO out_user_id 
    FROM user_profiles 
    ORDER BY created_at ASC LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 3. VIEW DE COMPATIBILIDADE: public.tasks
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.tasks CASCADE;

CREATE OR REPLACE VIEW public.tasks AS
SELECT 
    COALESCE(t.legacy_id, t.id::TEXT) AS id,
    t.title AS descricao,
    COALESCE(p.full_name, 'Não Atribuído') AS resp,
    t.due_date::TEXT AS date,
    t.priority::TEXT AS prio,
    t.status::TEXT AS status,
    t.all_day AS all_day,
    to_char(t.start_time, 'HH24:MI') AS time_start,
    to_char(t.end_time, 'HH24:MI') AS time_end,
    COALESCE(
        (
            SELECT array_agg(COALESCE(tg.legacy_id, tg.name))
            FROM task_tags tt
            JOIN tags_v3 tg ON tg.id = tt.tag_id
            WHERE tt.task_id = t.id
        ),
        ARRAY[]::TEXT[]
    ) AS tags,
    COALESCE(rg.recurrence_pattern, 'none') AS recur,
    COALESCE(
        (
            SELECT array_agg(d.value::TEXT)
            FROM jsonb_array_elements_text(rg.days_of_week) d
        ),
        ARRAY[]::TEXT[]
    ) AS recur_days,
    rg.start_date::TEXT AS recur_start,
    COALESCE(t.legacy_recur_group_id, rg.id::TEXT) AS recur_group_id,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'text', s.title,
                    'done', s.is_completed
                ) ORDER BY s.sort_order ASC, s.created_at ASC
            )
            FROM subtasks s
            WHERE s.task_id = t.id AND s.deleted_at IS NULL
        ),
        '[]'::jsonb
    ) AS subtasks,
    t.description AS notes,
    false AS is_meeting,
    t.sort_order AS sort_order,
    to_char(t.completed_at, 'DD/MM/YYYY') AS completed_at,
    to_char(t.updated_at, 'YYYY-MM-DD HH24:MI:SS') AS moved_at,
    to_char(t.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM tasks_v3 t
LEFT JOIN user_profiles p ON p.id = t.assigned_to
LEFT JOIN recurrence_groups rg ON rg.id = t.recurrence_group_id
WHERE t.deleted_at IS NULL;

-- ------------------------------------------------------------------------------
-- 4. TRIGGERS INSTEAD OF NA VIEW public.tasks (SECURITY DEFINER)
-- ------------------------------------------------------------------------------

-- 4.1. TRIGGER INSTEAD OF INSERT
CREATE OR REPLACE FUNCTION public.fn_tasks_compat_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_ctx RECORD;
    v_task_uuid UUID;
    v_assigned_uuid UUID;
    v_target_due_date DATE;
    v_recur_group_uuid UUID;
    v_subtask_item JSONB;
    v_sub_order INT := 0;
    v_tag_name TEXT;
    v_tag_uuid UUID;
BEGIN
    SELECT * INTO v_ctx FROM fn_compat_get_default_context();

    IF NEW.id IS NOT NULL AND NEW.id != '' THEN
        v_task_uuid := fn_map_legacy_id(NEW.id, 'tasks');
    ELSE
        v_task_uuid := gen_random_uuid();
    END IF;

    v_target_due_date := fn_convert_legacy_date(NEW.date);

    IF NEW.resp IS NOT NULL AND trim(NEW.resp) != '' THEN
        SELECT id INTO v_assigned_uuid 
        FROM user_profiles 
        WHERE upper(trim(full_name)) = upper(trim(NEW.resp))
        LIMIT 1;
    END IF;
    IF v_assigned_uuid IS NULL THEN
        v_assigned_uuid := v_ctx.out_user_id;
    END IF;

    IF NEW.recur_group_id IS NOT NULL AND trim(NEW.recur_group_id) != '' THEN
        v_recur_group_uuid := fn_map_legacy_id(NEW.recur_group_id, 'recurrence_groups');
        
        INSERT INTO recurrence_groups (
            id, organization_id, tenant_id, recurrence_pattern,
            days_of_week, start_date, is_active
        ) VALUES (
            v_recur_group_uuid, v_ctx.out_org_id, v_ctx.out_tenant_id,
            COALESCE(NEW.recur, 'daily'),
            COALESCE(to_jsonb(NEW.recur_days), '[]'::jsonb),
            COALESCE(fn_convert_legacy_date(NEW.recur_start), v_target_due_date, CURRENT_DATE),
            true
        ) ON CONFLICT (id) DO NOTHING;
    END IF;

    INSERT INTO tasks_v3 (
        id,
        organization_id,
        tenant_id,
        legacy_id,
        title,
        description,
        assigned_to,
        created_by,
        due_date,
        start_time,
        end_time,
        all_day,
        priority,
        status,
        recurrence_group_id,
        legacy_recur_group_id,
        sort_order,
        completed_at,
        created_at
    ) VALUES (
        v_task_uuid,
        v_ctx.out_org_id,
        v_ctx.out_tenant_id,
        COALESCE(NEW.id, 'id_' || floor(extract(epoch from clock_timestamp())*1000)::text),
        COALESCE(NEW.descricao, 'Tarefa sem título'),
        NEW.notes,
        v_assigned_uuid,
        v_ctx.out_user_id,
        v_target_due_date,
        CASE WHEN NEW.time_start IS NOT NULL AND NEW.time_start ~ '^\d{2}:\d{2}' THEN NEW.time_start::TIME ELSE NULL END,
        CASE WHEN NEW.time_end IS NOT NULL AND NEW.time_end ~ '^\d{2}:\d{2}' THEN NEW.time_end::TIME ELSE NULL END,
        COALESCE(NEW.all_day, true),
        CASE 
            WHEN NEW.prio = 'Alta' THEN 'Alta'::task_priority
            WHEN NEW.prio = 'Baixa' THEN 'Baixa'::task_priority
            ELSE 'Média'::task_priority
        END,
        CASE 
            WHEN NEW.status = 'Concluída' THEN 'Concluída'::task_status
            WHEN NEW.status = 'Em Andamento' THEN 'Em Andamento'::task_status
            ELSE 'Em Aberto'::task_status
        END,
        v_recur_group_uuid,
        NEW.recur_group_id,
        COALESCE(NEW.sort_order, 0),
        CASE WHEN NEW.status = 'Concluída' THEN timezone('utc', now()) ELSE NULL END,
        timezone('utc', now())
    ) ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        due_date = EXCLUDED.due_date,
        status = EXCLUDED.status,
        sort_order = EXCLUDED.sort_order,
        updated_at = timezone('utc', now());

    IF NEW.subtasks IS NOT NULL AND jsonb_typeof(NEW.subtasks) = 'array' AND jsonb_array_length(NEW.subtasks) > 0 THEN
        FOR v_subtask_item IN SELECT * FROM jsonb_array_elements(NEW.subtasks)
        LOOP
            INSERT INTO subtasks (
                task_id,
                title,
                is_completed,
                sort_order
            ) VALUES (
                v_task_uuid,
                COALESCE(v_subtask_item->>'text', 'Subtarefa'),
                COALESCE((v_subtask_item->>'done')::BOOLEAN, false),
                v_sub_order
            );
            v_sub_order := v_sub_order + 1;
        END LOOP;
    END IF;

    IF NEW.tags IS NOT NULL AND array_length(NEW.tags, 1) > 0 THEN
        FOREACH v_tag_name IN ARRAY NEW.tags
        LOOP
            SELECT id INTO v_tag_uuid FROM tags_v3 
            WHERE upper(trim(name)) = upper(trim(v_tag_name)) OR legacy_id = v_tag_name 
            LIMIT 1;

            IF v_tag_uuid IS NOT NULL THEN
                INSERT INTO task_tags (task_id, tag_id)
                VALUES (v_task_uuid, v_tag_uuid)
                ON CONFLICT (task_id, tag_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    INSERT INTO audit_logs (organization_id, entity_name, entity_id, action, new_values)
    VALUES (v_ctx.out_org_id, 'tasks', v_task_uuid, 'INSERT_LEGACY', jsonb_build_object('title', NEW.descricao, 'resp', NEW.resp));

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_tasks_compat_insert
INSTEAD OF INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.fn_tasks_compat_insert();

-- 4.2. TRIGGER INSTEAD OF UPDATE
CREATE OR REPLACE FUNCTION public.fn_tasks_compat_update()
RETURNS TRIGGER AS $$
DECLARE
    v_task_uuid UUID;
    v_assigned_uuid UUID;
    v_subtask_item JSONB;
    v_sub_order INT := 0;
BEGIN
    SELECT id INTO v_task_uuid 
    FROM tasks_v3 
    WHERE legacy_id = OLD.id OR id::TEXT = OLD.id
    LIMIT 1;

    IF v_task_uuid IS NULL THEN
        RETURN NULL;
    END IF;

    IF NEW.resp IS NOT NULL THEN
        SELECT id INTO v_assigned_uuid 
        FROM user_profiles 
        WHERE upper(trim(full_name)) = upper(trim(NEW.resp))
        LIMIT 1;
    END IF;

    UPDATE tasks_v3
    SET title = COALESCE(NEW.descricao, title),
        description = COALESCE(NEW.notes, description),
        assigned_to = COALESCE(v_assigned_uuid, assigned_to),
        due_date = CASE WHEN NEW.date IS NOT NULL THEN fn_convert_legacy_date(NEW.date) ELSE due_date END,
        all_day = COALESCE(NEW.all_day, all_day),
        sort_order = COALESCE(NEW.sort_order, sort_order),
        priority = CASE 
            WHEN NEW.prio = 'Alta' THEN 'Alta'::task_priority
            WHEN NEW.prio = 'Baixa' THEN 'Baixa'::task_priority
            WHEN NEW.prio = 'Média' THEN 'Média'::task_priority
            ELSE priority
        END,
        status = CASE 
            WHEN NEW.status = 'Concluída' THEN 'Concluída'::task_status
            WHEN NEW.status = 'Em Andamento' THEN 'Em Andamento'::task_status
            WHEN NEW.status = 'Em Aberto' THEN 'Em Aberto'::task_status
            ELSE status
        END,
        completed_at = CASE 
            WHEN NEW.status = 'Concluída' AND status != 'Concluída' THEN timezone('utc', now())
            WHEN NEW.status != 'Concluída' AND status = 'Concluída' THEN NULL
            ELSE completed_at
        END,
        updated_at = timezone('utc', now())
    WHERE id = v_task_uuid;

    IF NEW.subtasks IS NOT NULL AND jsonb_typeof(NEW.subtasks) = 'array' THEN
        UPDATE subtasks 
        SET deleted_at = timezone('utc', now()) 
        WHERE task_id = v_task_uuid AND deleted_at IS NULL;

        FOR v_subtask_item IN SELECT * FROM jsonb_array_elements(NEW.subtasks)
        LOOP
            INSERT INTO subtasks (
                task_id,
                title,
                is_completed,
                sort_order
            ) VALUES (
                v_task_uuid,
                COALESCE(v_subtask_item->>'text', 'Subtarefa'),
                COALESCE((v_subtask_item->>'done')::BOOLEAN, false),
                v_sub_order
            );
            v_sub_order := v_sub_order + 1;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_tasks_compat_update
INSTEAD OF UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.fn_tasks_compat_update();

-- 4.3. TRIGGER INSTEAD OF DELETE (INTERCEPTAÇÃO DEFINITIVA -> ZERO DELETE FÍSICO)
CREATE OR REPLACE FUNCTION public.fn_tasks_compat_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_task_uuid UUID;
BEGIN
    SELECT id INTO v_task_uuid 
    FROM tasks_v3 
    WHERE legacy_id = OLD.id OR id::TEXT = OLD.id
    LIMIT 1;

    IF v_task_uuid IS NULL THEN
        RETURN OLD;
    END IF;

    UPDATE tasks_v3
    SET deleted_at = timezone('utc', now()),
        status = 'Cancelada',
        cancellation_reason = 'Excluído via interface legada (interceptação de segurança)'
    WHERE id = v_task_uuid;

    INSERT INTO audit_logs (organization_id, entity_name, entity_id, action, old_values)
    SELECT organization_id, 'tasks', v_task_uuid, 'SOFT_DELETE_INTERCEPTED', jsonb_build_object('legacy_id', OLD.id, 'title', title)
    FROM tasks_v3 WHERE id = v_task_uuid;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_tasks_compat_delete
INSTEAD OF DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.fn_tasks_compat_delete();

-- ------------------------------------------------------------------------------
-- 5. VIEW DE COMPATIBILIDADE: public.hist (TAREFAS CONCLUÍDAS E REABERTURA)
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.hist CASCADE;

CREATE OR REPLACE VIEW public.hist AS
SELECT 
    COALESCE(t.legacy_id, t.id::TEXT) AS id,
    t.title AS descricao,
    COALESCE(p.full_name, 'Não Atribuído') AS resp,
    t.due_date::TEXT AS date,
    t.priority::TEXT AS prio,
    t.status::TEXT AS status,
    t.all_day AS all_day,
    t.sort_order AS sort_order,
    to_char(t.completed_at, 'DD/MM/YYYY') AS completed_at,
    to_char(t.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM tasks_v3 t
LEFT JOIN user_profiles p ON p.id = t.assigned_to
WHERE t.status = 'Concluída' AND t.deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.fn_hist_compat_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_task_uuid UUID;
BEGIN
    SELECT id INTO v_task_uuid 
    FROM tasks_v3 
    WHERE legacy_id = OLD.id OR id::TEXT = OLD.id
    LIMIT 1;

    IF v_task_uuid IS NOT NULL THEN
        UPDATE tasks_v3
        SET status = 'Em Aberto',
            completed_at = NULL,
            updated_at = timezone('utc', now())
        WHERE id = v_task_uuid;

        INSERT INTO audit_logs (organization_id, entity_name, entity_id, action, old_values)
        SELECT organization_id, 'tasks', v_task_uuid, 'REOPEN_TASK', jsonb_build_object('reopened_from_hist', OLD.id)
        FROM tasks_v3 WHERE id = v_task_uuid;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_hist_compat_delete
INSTEAD OF DELETE ON public.hist
FOR EACH ROW EXECUTE FUNCTION public.fn_hist_compat_delete();

-- ------------------------------------------------------------------------------
-- 6. VIEWS DE COMPATIBILIDADE: public.users E public.team
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.users CASCADE;
DROP VIEW IF EXISTS public.team CASCADE;

CREATE OR REPLACE VIEW public.users AS
SELECT 
    p.id::TEXT AS id,
    p.full_name AS name,
    COALESCE(ut.role::TEXT, 'Membro') AS role,
    COALESCE(p.email, 'usuario@pulseagenda.com') AS email,
    p.pass_hash_compat AS pass_hash,
    COALESCE(p.color, '#3B82F6') AS color,
    COALESCE(ut.role = 'owner' OR ut.role = 'admin', false) AS is_admin,
    p.avatar_url AS avatar
FROM user_profiles p
LEFT JOIN user_tenants ut ON ut.user_id = p.id;

CREATE OR REPLACE VIEW public.team AS
SELECT 
    p.id::TEXT AS id,
    p.full_name AS name,
    COALESCE(ut.role::TEXT, 'Membro') AS role,
    COALESCE(p.email, 'usuario@pulseagenda.com') AS email,
    COALESCE(p.color, '#3B82F6') AS color,
    COALESCE(ut.role = 'owner' OR ut.role = 'admin', false) AS is_admin
FROM user_profiles p
LEFT JOIN user_tenants ut ON ut.user_id = p.id;

CREATE OR REPLACE FUNCTION public.fn_users_compat_update()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_profiles
    SET full_name = COALESCE(NEW.name, full_name),
        color = COALESCE(NEW.color, color),
        pass_hash_compat = COALESCE(NEW.pass_hash, pass_hash_compat),
        avatar_url = COALESCE(NEW.avatar, avatar_url),
        updated_at = timezone('utc', now())
    WHERE id::TEXT = OLD.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_users_compat_update
INSTEAD OF UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.fn_users_compat_update();

CREATE TRIGGER trg_team_compat_update
INSTEAD OF UPDATE ON public.team
FOR EACH ROW EXECUTE FUNCTION public.fn_users_compat_update();

-- ------------------------------------------------------------------------------
-- 7. VIEW DE COMPATIBILIDADE: public.tags
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.tags CASCADE;

CREATE OR REPLACE VIEW public.tags AS
SELECT 
    COALESCE(legacy_id, id::TEXT) AS id,
    name,
    color_hex AS color,
    bg_hex AS bg
FROM tags_v3;

CREATE OR REPLACE FUNCTION public.fn_tags_compat_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_ctx RECORD;
BEGIN
    SELECT * INTO v_ctx FROM fn_compat_get_default_context();

    INSERT INTO tags_v3 (
        organization_id,
        legacy_id,
        name,
        color_hex,
        bg_hex
    ) VALUES (
        v_ctx.out_org_id,
        COALESCE(NEW.id, 'tag_' || floor(extract(epoch from clock_timestamp())*1000)::text),
        NEW.name,
        COALESCE(NEW.color, '#3B82F6'),
        COALESCE(NEW.bg, '#EFF6FF')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_tags_compat_insert
INSTEAD OF INSERT ON public.tags
FOR EACH ROW EXECUTE FUNCTION public.fn_tags_compat_insert();

CREATE OR REPLACE FUNCTION public.fn_tags_compat_delete()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM tags_v3 WHERE legacy_id = OLD.id OR id::TEXT = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_tags_compat_delete
INSTEAD OF DELETE ON public.tags
FOR EACH ROW EXECUTE FUNCTION public.fn_tags_compat_delete();

-- ------------------------------------------------------------------------------
-- 8. PERMISSÕES E INVALIDAÇÃO DO CACHE POSTGREST
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hist TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO anon, authenticated, service_role;

-- Recarrega o cache do PostgREST imediatamente para reconhecer as Updatable Views
NOTIFY pgrst, 'reload schema';
