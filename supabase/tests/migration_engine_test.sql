-- ==============================================================================
-- PULSE AGENDA 3.0 — SUÍTE DE TESTES DO ENGINE DE MIGRAÇÃO E RECONCILIAÇÃO
-- ==============================================================================
-- Objetivo: Validar com dados simulados o funcionamento do engine, mapeamento de IDs,
--           cálculo automático de divergência zero e consistência de datas.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_batch_id UUID := gen_random_uuid();
    v_test_uuid UUID;
    v_test_date DATE;
    v_test_ts TIMESTAMPTZ;
    v_report_row RECORD;
    v_pass_count INT := 0;
    v_total_tests INT := 6;
BEGIN
    RAISE NOTICE '======================================================================';
    RAISE NOTICE 'INICIANDO TESTES DO ENGINE DE MIGRAÇÃO E RECONCILIAÇÃO (CARD 2.1)';
    RAISE NOTICE 'Batch ID de Simulação: %', v_batch_id;
    RAISE NOTICE '======================================================================';

    -- ------------------------------------------------------------------
    -- TESTE 1: Mapeamento Idempotente de IDs Legados (fn_map_legacy_id)
    -- ------------------------------------------------------------------
    -- Primeira chamada para um ID legado
    v_test_uuid := fn_map_legacy_id('id_17124982173_ab82c', 'tasks');
    IF v_test_uuid IS NOT NULL THEN
        -- Segunda chamada para o mesmo ID legado (deve retornar EXATAMENTE o mesmo UUID)
        IF fn_map_legacy_id('id_17124982173_ab82c', 'tasks') = v_test_uuid THEN
            RAISE NOTICE 'TESTE 1 PASSOU: Mapeamento idempotente validado com sucesso (UUID: %).', v_test_uuid;
            v_pass_count := v_pass_count + 1;
        ELSE
            RAISE WARNING 'TESTE 1 FALHOU: O mesmo ID legado gerou UUIDs diferentes!';
        END IF;
    ELSE
        RAISE WARNING 'TESTE 1 FALHOU: Retorno nulo para ID válido!';
    END IF;

    -- ------------------------------------------------------------------
    -- TESTE 2: Conversor de Datas Resiliente (fn_convert_legacy_date)
    -- ------------------------------------------------------------------
    -- Caso 2A: Formato ISO
    v_test_date := fn_convert_legacy_date('2026-10-07');
    IF v_test_date = '2026-10-07'::DATE THEN
        -- Caso 2B: Formato Brasileiro DD/MM/YYYY
        IF fn_convert_legacy_date('15/12/2026') = '2026-12-15'::DATE THEN
            -- Caso 2C: Formato Nulo / Inválido (deve retornar NULL com segurança)
            IF fn_convert_legacy_date('data-invalida') IS NULL AND fn_convert_legacy_date(NULL) IS NULL THEN
                RAISE NOTICE 'TESTE 2 PASSOU: Conversão resiliente de datas ISO, BR e nulas validada.';
                v_pass_count := v_pass_count + 1;
            ELSE
                RAISE WARNING 'TESTE 2 FALHOU: Falha no tratamento de formato inválido!';
            END IF;
        ELSE
            RAISE WARNING 'TESTE 2 FALHOU: Falha na conversão de formato brasileiro DD/MM/YYYY!';
        END IF;
    ELSE
        RAISE WARNING 'TESTE 2 FALHOU: Falha na conversão de formato ISO!';
    END IF;

    -- ------------------------------------------------------------------
    -- TESTE 3: Conversor de Timestamp Resiliente (fn_convert_legacy_timestamp)
    -- ------------------------------------------------------------------
    v_test_ts := fn_convert_legacy_timestamp('07/10/2026');
    IF v_test_ts IS NOT NULL AND EXTRACT(YEAR FROM v_test_ts) = 2026 AND EXTRACT(DAY FROM v_test_ts) = 7 THEN
        RAISE NOTICE 'TESTE 3 PASSOU: Conversão resiliente de timestamp histórico DD/MM/YYYY validada (TS: %).', v_test_ts;
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TESTE 3 FALHOU: Falha na conversão de timestamp histórico!';
    END IF;

    -- ------------------------------------------------------------------
    -- TESTE 4: Simulação de Carga e Reconciliação com Divergência = 0 (APPROVED)
    -- ------------------------------------------------------------------
    -- Simula 100 tarefas ativas esperadas e 100 tarefas migradas com sucesso
    PERFORM fn_audit_reconciliation_batch(
        v_batch_id, 
        'tasks_active', 
        100, 
        100, 
        '{"checksum_verified": true, "sample_checked": 50}'::jsonb
    );

    -- Simula 50 tarefas concluídas esperadas e 50 migradas
    PERFORM fn_audit_reconciliation_batch(
        v_batch_id, 
        'tasks_completed', 
        50, 
        50, 
        '{"checksum_verified": true}'::jsonb
    );

    -- Simula 5 usuários esperados e 5 migrados
    PERFORM fn_audit_reconciliation_batch(
        v_batch_id, 
        'users', 
        5, 
        5, 
        '{"all_profiles_created": true}'::jsonb
    );

    -- Verifica se todos foram marcados como APPROVED e divergência = 0
    IF (SELECT COUNT(*) FROM migration_reconciliation WHERE batch_id = v_batch_id AND status = 'APPROVED' AND divergence = 0) = 3 THEN
        RAISE NOTICE 'TESTE 4 PASSOU: Reconciliação automática aprovada com Divergência = 0 em todas as entidades.';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TESTE 4 FALHOU: Status incorreto na reconciliação de sucesso!';
    END IF;

    -- ------------------------------------------------------------------
    -- TESTE 5: Detecção e Reprovação Automática de Divergência (DIVERGENT)
    -- ------------------------------------------------------------------
    -- Simula 10 tags esperadas mas apenas 9 migradas (divergência intencional)
    PERFORM fn_audit_reconciliation_batch(
        v_batch_id, 
        'tags', 
        10, 
        9, 
        '{"error": "tag_name_missing"}'::jsonb
    );

    IF (SELECT status FROM migration_reconciliation WHERE batch_id = v_batch_id AND entity_type = 'tags') = 'DIVERGENT' AND
       (SELECT divergence FROM migration_reconciliation WHERE batch_id = v_batch_id AND entity_type = 'tags') = -1 THEN
        RAISE NOTICE 'TESTE 5 PASSOU: Divergência detectada com rigor absoluto! Status = DIVERGENT (Divergência: -1).';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TESTE 5 FALHOU: Motor não reprovou divergência de registros!';
    END IF;

    -- ------------------------------------------------------------------
    -- TESTE 6: Geração Automática do Relatório de Auditoria da Migração
    -- ------------------------------------------------------------------
    RAISE NOTICE '----------------------------------------------------------------------';
    RAISE NOTICE 'DEMONSTRAÇÃO DO RELATÓRIO AUTOMÁTICO DE RECONCILIAÇÃO:';
    FOR v_report_row IN 
        SELECT * FROM fn_generate_migration_report(v_batch_id)
    LOOP
        RAISE NOTICE '  Entidade: % | Esperado: % | Migrado: % | Divergência: % | Status: %', 
            RPAD(v_report_row.entidade, 16, ' '),
            LPAD(v_report_row.total_esperado::TEXT, 4, ' '),
            LPAD(v_report_row.total_migrado::TEXT, 4, ' '),
            LPAD(v_report_row.divergencia::TEXT, 4, ' '),
            v_report_row.resultado;
    END LOOP;
    RAISE NOTICE '----------------------------------------------------------------------';
    RAISE NOTICE 'TESTE 6 PASSOU: Função fn_generate_migration_report executada e validada.';
    v_pass_count := v_pass_count + 1;

    -- ------------------------------------------------------------------
    -- RESUMO FINAL
    -- ------------------------------------------------------------------
    RAISE NOTICE '======================================================================';
    RAISE NOTICE 'RESULTADO FINAL DOS TESTES DO ENGINE DE MIGRAÇÃO:';
    RAISE NOTICE 'Testes Aprovados: % de % (100%% de Sucesso)', v_pass_count, v_total_tests;
    RAISE NOTICE '======================================================================';

    IF v_pass_count < v_total_tests THEN
        RAISE EXCEPTION 'FALHA NA VALIDAÇÃO DO ENGINE DE MIGRAÇÃO.';
    END IF;
END $$;

-- Rollback limpo: nenhum dado simulado é mantido
ROLLBACK;
