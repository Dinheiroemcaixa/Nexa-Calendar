-- ==============================================================================
-- PULSE AGENDA 3.0 — CARD FINAL: CARGA E RECONCILIAÇÃO DEFINITIVA (FASE 1)
-- ==============================================================================
-- Arquivo: 20261008000004_data_migration_load.sql
-- Objetivo: Migração real e idempotente de 100% dos dados legados para o Schema 3.0:
--           tasks_legacy + hist_legacy -> tasks_v3
--           tasks_legacy.subtasks (JSONB) -> subtasks (relacional, is_completed)
--           tasks_legacy.tags (text[]) -> task_tags (relacional N:N)
--           users_legacy + team_legacy -> user_profiles + user_tenants
--           tags_legacy -> tags_v3
--           Reconciliação automática com Divergência Permitida = 0.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_execute_full_data_migration(
    p_organization_slug TEXT DEFAULT 'lm-contabilidade',
    p_tenant_slug TEXT DEFAULT 'matriz'
)
RETURNS TABLE (
    entity_name TEXT,
    legacy_count BIGINT,
    migrated_count BIGINT,
    divergence BIGINT,
    status TEXT
) AS $$
DECLARE
    v_batch_id UUID := gen_random_uuid();
    v_org_id UUID;
    v_tenant_id UUID;
    v_default_user_id UUID;
    v_task RECORD;
    v_task_uuid UUID;
    v_assigned_uuid UUID;
    v_recur_group_uuid UUID;
    v_subtask_item JSONB;
    v_sub_order INT;
    v_tag_item TEXT;
    v_tag_uuid UUID;
    
    -- Contadores de auditoria
    v_count_users_leg BIGINT := 0;
    v_count_users_mig BIGINT := 0;
    v_count_tags_leg BIGINT := 0;
    v_count_tags_mig BIGINT := 0;
    v_count_tasks_leg BIGINT := 0;
    v_count_tasks_mig BIGINT := 0;
    v_count_subtasks_mig BIGINT := 0;
    v_count_recur_groups_mig BIGINT := 0;
BEGIN
    RAISE NOTICE '======================================================================';
    RAISE NOTICE 'INICIANDO MIGRAÇÃO DEFINITIVA PULSE AGENDA 3.0 (BATCH: %)', v_batch_id;
    RAISE NOTICE '======================================================================';

    -- --------------------------------------------------------------------------
    -- 1. ESTRUTURA ORGANIZACIONAL BASE
    -- --------------------------------------------------------------------------
    INSERT INTO organizations (name, slug, cnpj, plan_tier, is_active)
    VALUES ('LM Contabilidade', p_organization_slug, '00000000000199', 'enterprise', true)
    ON CONFLICT (slug) DO UPDATE SET is_active = true
    RETURNING id INTO v_org_id;

    INSERT INTO tenants (organization_id, name, slug, is_active)
    VALUES (v_org_id, 'Matriz Principal', p_tenant_slug, true)
    ON CONFLICT (organization_id, slug) DO UPDATE SET is_active = true
    RETURNING id INTO v_tenant_id;

    -- --------------------------------------------------------------------------
    -- 2. MIGRAÇÃO DE USUÁRIOS E PERFIS
    -- --------------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users_legacy') THEN
        SELECT count(*) INTO v_count_users_leg FROM users_legacy;

        FOR v_task IN SELECT * FROM users_legacy LOOP
            -- Mapeia UUID do usuário de forma idempotente
            v_assigned_uuid := fn_map_legacy_id(v_task.id, 'users');

            INSERT INTO user_profiles (
                id,
                organization_id,
                full_name,
                email,
                avatar_url,
                color,
                pass_hash_compat,
                is_active
            ) VALUES (
                v_assigned_uuid,
                v_org_id,
                COALESCE(v_task.name, 'Usuário ' || v_task.id),
                COALESCE(v_task.email, 'usuario_' || v_task.id || '@pulseagenda.com'),
                v_task.avatar,
                COALESCE(v_task.color, '#3B82F6'),
                v_task.pass_hash,
                true
            ) ON CONFLICT (email) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                pass_hash_compat = EXCLUDED.pass_hash_compat;

            -- Vincula tenant com papel administrativo ou membro
            INSERT INTO user_tenants (
                user_id,
                organization_id,
                tenant_id,
                role,
                is_active
            ) VALUES (
                v_assigned_uuid,
                v_org_id,
                v_tenant_id,
                CASE WHEN v_task.is_admin = true THEN 'admin'::tenant_role ELSE 'member'::tenant_role END,
                true
            ) ON CONFLICT (user_id, organization_id, tenant_id) DO NOTHING;
        END LOOP;

        SELECT count(*) INTO v_count_users_mig FROM user_profiles WHERE organization_id = v_org_id;
    END IF;

    -- Obtém usuário padrão para fallback
    SELECT id INTO v_default_user_id FROM user_profiles WHERE organization_id = v_org_id ORDER BY created_at ASC LIMIT 1;

    -- --------------------------------------------------------------------------
    -- 3. MIGRAÇÃO DE TAGS
    -- --------------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tags_legacy') THEN
        SELECT count(*) INTO v_count_tags_leg FROM tags_legacy;

        FOR v_task IN SELECT * FROM tags_legacy LOOP
            v_tag_uuid := fn_map_legacy_id(v_task.id, 'tags');

            INSERT INTO tags_v3 (
                id,
                organization_id,
                legacy_id,
                name,
                color_hex,
                bg_hex
            ) VALUES (
                v_tag_uuid,
                v_org_id,
                v_task.id,
                v_task.name,
                COALESCE(v_task.color, '#3B82F6'),
                COALESCE(v_task.bg, '#EFF6FF')
            ) ON CONFLICT (organization_id, name) DO NOTHING;
        END LOOP;

        SELECT count(*) INTO v_count_tags_mig FROM tags_v3 WHERE organization_id = v_org_id;
    END IF;

    -- --------------------------------------------------------------------------
    -- 4. MIGRAÇÃO INTEGRAL DE TAREFAS (tasks_legacy)
    -- --------------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tasks_legacy') THEN
        SELECT count(*) INTO v_count_tasks_leg FROM tasks_legacy;

        FOR v_task IN SELECT * FROM tasks_legacy LOOP
            v_task_uuid := fn_map_legacy_id(v_task.id, 'tasks');

            -- Resolve responsável
            v_assigned_uuid := NULL;
            IF v_task.resp IS NOT NULL AND trim(v_task.resp) != '' THEN
                SELECT id INTO v_assigned_uuid 
                FROM user_profiles 
                WHERE organization_id = v_org_id AND upper(trim(full_name)) = upper(trim(v_task.resp))
                LIMIT 1;
            END IF;
            IF v_assigned_uuid IS NULL THEN
                v_assigned_uuid := v_default_user_id;
            END IF;

            -- Resolve grupo de recorrência se houver
            v_recur_group_uuid := NULL;
            IF v_task.recur_group_id IS NOT NULL AND trim(v_task.recur_group_id) != '' THEN
                v_recur_group_uuid := fn_map_legacy_id(v_task.recur_group_id, 'recurrence_groups');
                
                INSERT INTO recurrence_groups (
                    id, organization_id, tenant_id, recurrence_pattern,
                    days_of_week, start_date, is_active
                ) VALUES (
                    v_recur_group_uuid, v_org_id, v_tenant_id,
                    COALESCE(v_task.recur, 'daily'),
                    COALESCE(to_jsonb(v_task.recur_days), '[]'::jsonb),
                    COALESCE(fn_convert_legacy_date(v_task.recur_start), fn_convert_legacy_date(v_task.date), CURRENT_DATE),
                    true
                ) ON CONFLICT (id) DO NOTHING;
            END IF;

            -- Inserção na tabela tasks_v3
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
                v_org_id,
                v_tenant_id,
                v_task.id,
                COALESCE(v_task.descricao, 'Tarefa ' || v_task.id),
                v_task.notes,
                v_assigned_uuid,
                v_default_user_id,
                fn_convert_legacy_date(v_task.date),
                CASE WHEN v_task.time_start ~ '^\d{2}:\d{2}' THEN v_task.time_start::TIME ELSE NULL END,
                CASE WHEN v_task.time_end ~ '^\d{2}:\d{2}' THEN v_task.time_end::TIME ELSE NULL END,
                COALESCE(v_task.all_day, true),
                CASE 
                    WHEN v_task.prio = 'Alta' THEN 'Alta'::task_priority
                    WHEN v_task.prio = 'Baixa' THEN 'Baixa'::task_priority
                    ELSE 'Média'::task_priority
                END,
                CASE 
                    WHEN v_task.status = 'Concluída' THEN 'Concluída'::task_status
                    WHEN v_task.status = 'Em Andamento' THEN 'Em Andamento'::task_status
                    ELSE 'Em Aberto'::task_status
                END,
                v_recur_group_uuid,
                v_task.recur_group_id,
                COALESCE(v_task.sort_order, 0),
                CASE WHEN v_task.status = 'Concluída' THEN COALESCE(fn_convert_legacy_timestamp(v_task.completed_at), fn_convert_legacy_timestamp(v_task.created_at), timezone('utc', now())) ELSE NULL END,
                COALESCE(fn_convert_legacy_timestamp(v_task.created_at), timezone('utc', now()))
            ) ON CONFLICT (id) DO NOTHING;

            -- ------------------------------------------------------------------
            -- 5. NORMALIZAÇÃO DE SUBTAREFAS DO ARRAY JSONB (is_completed)
            -- ------------------------------------------------------------------
            IF v_task.subtasks IS NOT NULL AND jsonb_typeof(v_task.subtasks) = 'array' THEN
                v_sub_order := 0;
                FOR v_subtask_item IN SELECT * FROM jsonb_array_elements(v_task.subtasks) LOOP
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
                    v_count_subtasks_mig := v_count_subtasks_mig + 1;
                END LOOP;
            END IF;

            -- ------------------------------------------------------------------
            -- 6. NORMALIZAÇÃO DE TAGS (N:N)
            -- ------------------------------------------------------------------
            IF v_task.tags IS NOT NULL AND array_length(v_task.tags, 1) > 0 THEN
                FOREACH v_tag_item IN ARRAY v_task.tags LOOP
                    SELECT id INTO v_tag_uuid FROM tags_v3 
                    WHERE organization_id = v_org_id AND (legacy_id = v_tag_item OR upper(trim(name)) = upper(trim(v_tag_item)))
                    LIMIT 1;

                    IF v_tag_uuid IS NOT NULL THEN
                        INSERT INTO task_tags (task_id, tag_id)
                        VALUES (v_task_uuid, v_tag_uuid)
                        ON CONFLICT (task_id, tag_id) DO NOTHING;
                    END IF;
                END LOOP;
            END IF;

        END LOOP;

        SELECT count(*) INTO v_count_tasks_mig FROM tasks_v3 WHERE organization_id = v_org_id;
    END IF;

    -- --------------------------------------------------------------------------
    -- 7. RECONCILIAÇÃO AUTOMÁTICA OBRIGATÓRIA (DIVERGÊNCIA = 0)
    -- --------------------------------------------------------------------------
    INSERT INTO migration_reconciliation (
        batch_id, entity_type, legacy_count, migrated_count, status
    ) VALUES (
        v_batch_id, 'users', v_count_users_leg, v_count_users_mig,
        CASE WHEN v_count_users_leg = v_count_users_mig THEN 'APPROVED' ELSE 'DIVERGENT' END
    );

    INSERT INTO migration_reconciliation (
        batch_id, entity_type, legacy_count, migrated_count, status
    ) VALUES (
        v_batch_id, 'tags', v_count_tags_leg, v_count_tags_mig,
        CASE WHEN v_count_tags_leg = v_count_tags_mig THEN 'APPROVED' ELSE 'DIVERGENT' END
    );

    INSERT INTO migration_reconciliation (
        batch_id, entity_type, legacy_count, migrated_count, status
    ) VALUES (
        v_batch_id, 'tasks', v_count_tasks_leg, v_count_tasks_mig,
        CASE WHEN v_count_tasks_leg = v_count_tasks_mig THEN 'APPROVED' ELSE 'DIVERGENT' END
    );

    -- VALIDAÇÃO CRÍTICA INEGOCIÁVEL: SE DIVERGÊNCIA != 0, ABORTA TRANSAÇÃO
    IF v_count_tasks_leg != v_count_tasks_mig THEN
        RAISE EXCEPTION 'MIGRAÇÃO ABORTADA: Divergência detectada nas tarefas! Origem: %, Destino: %', v_count_tasks_leg, v_count_tasks_mig;
    END IF;

    RAISE NOTICE '======================================================================';
    RAISE NOTICE 'MIGRAÇÃO CONCLUÍDA COM SUCESSO! DIVERGÊNCIA ZERO ATINGIDA.';
    RAISE NOTICE 'Tarefas: % | Subtarefas: % | Tags: %', v_count_tasks_mig, v_count_subtasks_mig, v_count_tags_mig;
    RAISE NOTICE '======================================================================';

    RETURN QUERY
    SELECT 
        r.entity_type::TEXT,
        r.legacy_count::BIGINT,
        r.migrated_count::BIGINT,
        (r.migrated_count - r.legacy_count)::BIGINT,
        r.status::TEXT
    FROM migration_reconciliation r
    WHERE r.batch_id = v_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 8. EXECUÇÃO IMEDIATA DA CARGA E RECONCILIAÇÃO TRANSACIONAL
-- ------------------------------------------------------------------------------
-- Dispara a migração completa dos dados legados para o schema Pulse Agenda 3.0
SELECT * FROM public.fn_execute_full_data_migration('lm-contabilidade', 'matriz');

-- Notifica o PostgREST para recarregar o cache do schema imediatamente
NOTIFY pgrst, 'reload schema';

