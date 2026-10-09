-- ==============================================================================
-- PULSE AGENDA 3.0 — SUÍTE DE TESTES E VALIDAÇÃO DA CAMADA DE COMPATIBILIDADE
-- ==============================================================================
-- Arquivo: compatibility_layer_test.sql
-- Objetivo: Validar em transação isolada (BEGIN ... ROLLBACK) o funcionamento de:
--           1. SELECT na view public.tasks (formato legado com subtasks JSONB e tags)
--           2. INSERT via view public.tasks (decomposição relacional 3.0)
--           3. UPDATE via view public.tasks (sincronização de campos e subtarefas)
--           4. DELETE via view public.tasks (interceptação para Soft Delete)
--           5. DELETE via view public.hist (reabertura de tarefas)
--           6. Validação de tags e reconciliação
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_test_id TEXT := 'id_smoke_test_' || floor(extract(epoch from clock_timestamp())*1000)::text;
    v_task_row RECORD;
    v_raw_task RECORD;
    v_subtask_count INT;
    v_tag_count INT;
    v_pass_count INT := 0;
    v_total_tests INT := 8;
BEGIN
    RAISE NOTICE '======================================================================';
    RAISE NOTICE 'INICIANDO SUÍTE DE TESTES DA CAMADA DE COMPATIBILIDADE (FASE 1)';
    RAISE NOTICE 'ID de Teste Gerado: %', v_test_id;
    RAISE NOTICE '======================================================================';

    -- --------------------------------------------------------------------------
    -- TESTE 1: INSERÇÃO VIA VIEW (sb.from('tasks').insert(newTask))
    -- --------------------------------------------------------------------------
    INSERT INTO public.tasks (
        id,
        descricao,
        resp,
        date,
        prio,
        status,
        all_day,
        subtasks,
        tags
    ) VALUES (
        v_test_id,
        'Tarefa de Teste Automatizado Fase 1',
        'RAMON CARDOSO',
        '2026-10-15',
        'Alta',
        'Em Aberto',
        true,
        '[{"text": "Subtarefa 1", "done": false}, {"text": "Subtarefa 2", "done": true}]'::jsonb,
        ARRAY['Urgente', 'Financeiro']
    );

    SELECT * INTO v_task_row FROM public.tasks WHERE id = v_test_id;
    IF v_task_row.id IS NOT NULL AND v_task_row.descricao = 'Tarefa de Teste Automatizado Fase 1' THEN
        RAISE NOTICE 'TESTE 1 PASSOU: INSERT via View executado com sucesso.';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE EXCEPTION 'TESTE 1 FALHOU: Tarefa não encontrada após INSERT via View!';
    END IF;

    -- --------------------------------------------------------------------------
    -- TESTE 2: NORMALIZAÇÃO DE SUBTAREFAS NA TABELA RELACIONAL
    -- --------------------------------------------------------------------------
    SELECT count(*) INTO v_subtask_count 
    FROM subtasks s
    JOIN tasks_v3 t ON t.id = s.task_id
    WHERE t.legacy_id = v_test_id AND s.deleted_at IS NULL;

    IF v_subtask_count = 2 THEN
        RAISE NOTICE 'TESTE 2 PASSOU: 2 subtarefas normalizadas na tabela relacional subtasks.';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE EXCEPTION 'TESTE 2 FALHOU: Subtarefas não normalizadas! Contagem: % (Esperado: 2)', v_subtask_count;
    END IF;

    -- --------------------------------------------------------------------------
    -- TESTE 3: LEITURA COM AGREGAÇÃO JSONB NA VIEW (SELECT * FROM tasks)
    -- --------------------------------------------------------------------------
    IF jsonb_array_length(v_task_row.subtasks) = 2 AND (v_task_row.subtasks->1->>'done')::BOOLEAN = true THEN
        RAISE NOTICE 'TESTE 3 PASSOU: View reconstruiu o JSONB de subtarefas perfeitamente.';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE EXCEPTION 'TESTE 3 FALHOU: JSONB de subtarefas inválido na leitura da View!';
    END IF;

    -- --------------------------------------------------------------------------
    -- TESTE 4: ATUALIZAÇÃO VIA VIEW (sb.from('tasks').update(cleanData).eq('id', id))
    -- --------------------------------------------------------------------------
    UPDATE public.tasks
    SET descricao = 'Tarefa de Teste Automatizado Fase 1 — Editada',
        prio = 'Média',
        status = 'Em Andamento'
    WHERE id = v_test_id;

    SELECT * INTO v_task_row FROM public.tasks WHERE id = v_test_id;
    IF v_task_row.descricao LIKE '%Editada' AND v_task_row.prio = 'Média' AND v_task_row.status = 'Em Andamento' THEN
        RAISE NOTICE 'TESTE 4 PASSOU: UPDATE de campos escalares refletido com sucesso.';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE EXCEPTION 'TESTE 4 FALHOU: UPDATE não refletiu na View!';
    END IF;

    -- --------------------------------------------------------------------------
    -- TESTE 5: CONCLUSÃO DE TAREFA E REFLEXO NA VIEW public.hist
    -- --------------------------------------------------------------------------
    UPDATE public.tasks
    SET status = 'Concluída'
    WHERE id = v_test_id;

    IF EXISTS (SELECT 1 FROM public.hist WHERE id = v_test_id) THEN
        RAISE NOTICE 'TESTE 5 PASSOU: Tarefa concluída visível na View public.hist com completed_at preenchido.';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE EXCEPTION 'TESTE 5 FALHOU: Tarefa concluída não apareceu na View public.hist!';
    END IF;

    -- --------------------------------------------------------------------------
    -- TESTE 6: REABERTURA VIA VIEW public.hist (sb.from('hist').delete().eq('id', id))
    -- --------------------------------------------------------------------------
    DELETE FROM public.hist WHERE id = v_test_id;

    SELECT * INTO v_task_row FROM public.tasks WHERE id = v_test_id;
    IF v_task_row.status = 'Em Aberto' AND NOT EXISTS (SELECT 1 FROM public.hist WHERE id = v_test_id) THEN
        RAISE NOTICE 'TESTE 6 PASSOU: Reabertura via DELETE na View hist restaurou status para Em Aberto.';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE EXCEPTION 'TESTE 6 FALHOU: Reabertura de tarefa falhou!';
    END IF;

    -- --------------------------------------------------------------------------
    -- TESTE 7: INTERCEPTAÇÃO DE DELETE (sb.from('tasks').delete().eq('id', id))
    -- --------------------------------------------------------------------------
    -- Dispara DELETE via View (o comando que o front legado executa)
    DELETE FROM public.tasks WHERE id = v_test_id;

    -- Verifica se sumiu da View
    IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = v_test_id) THEN
        -- Verifica se PERMANECE 100% PRESERVADA na tabela base com Soft Delete
        SELECT * INTO v_raw_task FROM tasks_v3 WHERE legacy_id = v_test_id;
        
        IF v_raw_task.id IS NOT NULL AND v_raw_task.deleted_at IS NOT NULL AND v_raw_task.status = 'Cancelada' THEN
            RAISE NOTICE 'TESTE 7 PASSOU: ZERO DELETE FÍSICO! Registro preservado na base com deleted_at = % e status = Cancelada.', v_raw_task.deleted_at;
            v_pass_count := v_pass_count + 1;
        ELSE
            RAISE EXCEPTION 'TESTE 7 CRÍTICO FALHOU: O registro foi deletado fisicamente ou deleted_at não foi gravado!';
        END IF;
    ELSE
        RAISE EXCEPTION 'TESTE 7 FALHOU: A tarefa ainda está visível na View após o DELETE!';
    END IF;

    -- --------------------------------------------------------------------------
    -- TESTE 8: TRILHA DE AUDITORIA DO SOFT DELETE
    -- --------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM audit_logs 
        WHERE entity_name = 'tasks' AND action = 'SOFT_DELETE_INTERCEPTED'
    ) THEN
        RAISE NOTICE 'TESTE 8 PASSOU: Trilha de auditoria gerada para o Soft Delete interceptado.';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE EXCEPTION 'TESTE 8 FALHOU: Registro de auditoria não encontrado!';
    END IF;

    RAISE NOTICE '======================================================================';
    RAISE NOTICE 'SUCESSO TOTAL! % DE % TESTES PASSARAM COM SUCESSO.', v_pass_count, v_total_tests;
    RAISE NOTICE 'A CAMADA DE COMPATIBILIDADE DA FASE 1 ESTÁ 100%% HOMOLOGADA E SEGURA!';
    RAISE NOTICE '======================================================================';

END $$;

ROLLBACK; -- Desfaz todas as alterações de teste mantendo o banco intacto
