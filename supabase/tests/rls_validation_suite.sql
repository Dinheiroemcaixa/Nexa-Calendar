-- ==============================================================================
-- PULSE AGENDA 3.0 — SUÍTE DE TESTES E VALIDAÇÃO DE SEGURANÇA RLS
-- ==============================================================================
-- Objetivo: Validar isolamento multi-tenant absoluto, bloqueio de acesso cruzado,
--           regras de privilégio administrativo e proibição de DELETE físico.
-- ==============================================================================

BEGIN;

-- 1. SETUP DE CENÁRIO DE TESTE
DO $$
DECLARE
    -- Organizações
    v_org_a UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
    v_org_b UUID := 'b0000000-0000-0000-0000-000000000002'::UUID;
    
    -- Papéis
    v_role_admin UUID;
    v_role_member UUID;
    
    -- Usuários
    v_admin_a UUID := 'a1111111-1111-1111-1111-111111111111'::UUID;
    v_member_a UUID := 'a2222222-2222-2222-2222-222222222222'::UUID;
    v_admin_b UUID := 'b1111111-1111-1111-1111-111111111111'::UUID;
    v_member_b UUID := 'b2222222-2222-2222-2222-222222222222'::UUID;
    
    -- Tarefas
    v_task_a1 UUID := 'a0001111-0000-0000-0000-000000000001'::UUID;
    v_task_b1 UUID := 'b0001111-0000-0000-0000-000000000001'::UUID;
    
    -- Contadores de Teste
    v_count INT;
    v_passed INT := 0;
    v_failed INT := 0;
    v_error_msg TEXT;
BEGIN
    RAISE NOTICE '======================================================================';
    RAISE NOTICE 'INICIANDO BATERIA DE TESTES DE SEGURANÇA RLS — PULSE AGENDA 3.0';
    RAISE NOTICE '======================================================================';

    -- Obter IDs dos papéis
    SELECT id INTO v_role_admin FROM roles WHERE code = 'admin';
    SELECT id INTO v_role_member FROM roles WHERE code = 'member';

    -- Inserir Organizações de Teste
    INSERT INTO organizations (id, name, slug) VALUES 
        (v_org_a, 'Org A - Dinheiro em Caixa', 'org-a-teste'),
        (v_org_b, 'Org B - Empresa Concorrente', 'org-b-teste')
    ON CONFLICT (slug) DO NOTHING;

    -- Inserir Perfis de Teste (Mock de auth.users via profiles)
    -- Nota: para testes de staging em transação com SECURITY DEFINER
    INSERT INTO profiles (id, org_id, role_id, name, email, job_title, color) VALUES
        (v_admin_a, v_org_a, v_role_admin, 'Admin Org A', 'admin@orga.com', 'Diretor', '#4f6ef7'),
        (v_member_a, v_org_a, v_role_member, 'Membro Org A', 'membro@orga.com', 'Analista', '#3dd68c'),
        (v_admin_b, v_org_b, v_role_admin, 'Admin Org B', 'admin@orgb.com', 'Gerente', '#ff4d6d'),
        (v_member_b, v_org_b, v_role_member, 'Membro Org B', 'membro@orgb.com', 'Assistente', '#ffa94d')
    ON CONFLICT (id) DO NOTHING;

    -- Inserir Configurações das Organizações
    INSERT INTO settings (org_id, key, value, description) VALUES
        (v_org_a, 'general.notifications', '{"email": true}'::jsonb, 'Notificações Org A'),
        (v_org_b, 'general.notifications', '{"email": false}'::jsonb, 'Notificações Org B')
    ON CONFLICT (org_id, key) DO NOTHING;

    -- Inserir Tarefas de Teste
    INSERT INTO tasks (id, org_id, created_by, assigned_to, title, due_date, priority, status) VALUES
        (v_task_a1, v_org_a, v_admin_a, v_member_a, 'Tarefa Confidencial Org A', '2026-10-15', 'Alta', 'Em Aberto'),
        (v_task_b1, v_org_b, v_admin_b, v_member_b, 'Tarefa Secreta Org B', '2026-10-20', 'Alta', 'Em Aberto')
    ON CONFLICT (id) DO NOTHING;

    -- Inserir Logs de Auditoria
    INSERT INTO audit_logs (org_id, actor_id, action, entity_type, entity_id, new_state) VALUES
        (v_org_a, v_admin_a, 'TASK_CREATED', 'tasks', v_task_a1, '{"title": "Tarefa Confidencial Org A"}'::jsonb),
        (v_org_b, v_admin_b, 'TASK_CREATED', 'tasks', v_task_b1, '{"title": "Tarefa Secreta Org B"}'::jsonb);

    RAISE NOTICE '✓ Setup de Dados e Cenário concluído com sucesso.';
    RAISE NOTICE '----------------------------------------------------------------------';

    -- ==================================================================
    -- TESTE 1: [POSITIVO] Usuário da Org A acessando dados da própria Org A
    -- ==================================================================
    -- Simula contexto de autenticação do Membro da Org A
    PERFORM set_config('request.jwt.claim.sub', v_member_a::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);

    SELECT COUNT(*) INTO v_count FROM tasks WHERE org_id = v_org_a;
    IF v_count >= 1 THEN
        RAISE NOTICE 'TESTE 1 PASSOU: Membro Org A visualizou suas tarefas da Org A com sucesso (Count: %).', v_count;
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 1 FALHOU: Membro Org A não conseguiu ler tarefas da sua própria org.';
        v_failed := v_failed + 1;
    END IF;

    -- ==================================================================
    -- TESTE 2: [NEGATIVO / CROSS-TENANT] Usuário da Org A tentando ler tarefas da Org B
    -- ==================================================================
    -- Membro da Org A tenta consultar tarefas da Org B
    SELECT COUNT(*) INTO v_count FROM tasks WHERE org_id = v_org_b;
    IF v_count = 0 THEN
        RAISE NOTICE 'TESTE 2 PASSOU: Isolamento absoluto! Membro Org A recebeu 0 tarefas da Org B (Count: 0).';
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 2 FALHOU: VAZAMENTO DE DADOS! Membro Org A conseguiu visualizar tarefas da Org B (Count: %)!', v_count;
        v_failed := v_failed + 1;
    END IF;

    -- ==================================================================
    -- TESTE 3: [NEGATIVO / CROSS-TENANT] Tentativa de Injeção de Tarefa em Outra Org
    -- ==================================================================
    -- Membro da Org A tenta forjar uma inserção apontando para a Org B
    BEGIN
        INSERT INTO tasks (org_id, created_by, title, priority, status)
        VALUES (v_org_b, v_member_a, 'Injeção Ilegítima na Org B', 'Alta', 'Em Aberto');
        
        RAISE WARNING 'TESTE 3 FALHOU: Usuário conseguiu inserir registro na Org B alheia!';
        v_failed := v_failed + 1;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'TESTE 3 PASSOU: RLS bloqueou inserção cruzada na Org B com sucesso. Erro capturado: %', SQLERRM;
        v_passed := v_passed + 1;
    END;

    -- ==================================================================
    -- TESTE 4: [NEGATIVO / CROSS-TENANT] Tentativa de Mutação em Tarefa da Org B
    -- ==================================================================
    -- Membro da Org A tenta atualizar a tarefa v_task_b1
    UPDATE tasks SET title = 'Titulo Adulterado' WHERE id = v_task_b1;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
        RAISE NOTICE 'TESTE 4 PASSOU: Adulteração cruzada bloqueada! 0 registros da Org B foram afetados.';
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 4 FALHOU: Membro Org A adulterou tarefa da Org B (Linhas afetadas: %)!', v_count;
        v_failed := v_failed + 1;
    END IF;

    -- ==================================================================
    -- TESTE 5: [PRIVILÉGIO] Membro vs Admin alterando Configurações (Settings)
    -- ==================================================================
    -- 5A: Membro tenta alterar Settings
    UPDATE settings SET value = '{"email": false}'::jsonb WHERE org_id = v_org_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
        RAISE NOTICE 'TESTE 5A PASSOU: Membro não-admin foi impedido de alterar configurações da organização (Linhas afetadas: 0).';
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 5A FALHOU: Membro sem privilégio conseguiu alterar configurações!';
        v_failed := v_failed + 1;
    END IF;

    -- 5B: Admin Org A altera Settings
    PERFORM set_config('request.jwt.claim.sub', v_admin_a::TEXT, true);
    UPDATE settings SET value = '{"email": false, "updated_by_admin": true}'::jsonb WHERE org_id = v_org_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 1 THEN
        RAISE NOTICE 'TESTE 5B PASSOU: Administrador da Org A atualizou configurações com sucesso (Linhas afetadas: 1).';
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 5B FALHOU: Administrador não conseguiu atualizar configurações da sua org.';
        v_failed := v_failed + 1;
    END IF;

    -- ==================================================================
    -- TESTE 6: [PRIVILÉGIO & AUDITORIA] Leitura de Logs de Auditoria
    -- ==================================================================
    -- 6A: Membro tenta ler Audit Logs
    PERFORM set_config('request.jwt.claim.sub', v_member_a::TEXT, true);
    SELECT COUNT(*) INTO v_count FROM audit_logs WHERE org_id = v_org_a;
    IF v_count = 0 THEN
        RAISE NOTICE 'TESTE 6A PASSOU: Membro foi impedido de visualizar logs confidenciais de auditoria (Count: 0).';
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 6A FALHOU: Membro acessou logs confidenciais de auditoria!';
        v_failed := v_failed + 1;
    END IF;

    -- 6B: Admin lê Audit Logs da própria Org
    PERFORM set_config('request.jwt.claim.sub', v_admin_a::TEXT, true);
    SELECT COUNT(*) INTO v_count FROM audit_logs WHERE org_id = v_org_a;
    IF v_count >= 1 THEN
        RAISE NOTICE 'TESTE 6B PASSOU: Administrador visualizou logs de auditoria da sua org com sucesso (Count: %).', v_count;
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 6B FALHOU: Administrador não conseguiu ler logs da sua própria org.';
        v_failed := v_failed + 1;
    END IF;

    -- 6C: Admin Org A tenta ler Audit Logs da Org B
    SELECT COUNT(*) INTO v_count FROM audit_logs WHERE org_id = v_org_b;
    IF v_count = 0 THEN
        RAISE NOTICE 'TESTE 6C PASSOU: Isolamento multi-tenant de auditoria garantido! Admin Org A recebeu 0 logs da Org B.';
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 6C FALHOU: Admin Org A visualizou logs de auditoria da Org B!';
        v_failed := v_failed + 1;
    END IF;

    -- ==================================================================
    -- TESTE 7: [SEGURANÇA MANDATÓRIA] Bloqueio Total de DELETE Físico em Tasks
    -- ==================================================================
    -- Admin Org A tenta executar DELETE físico na tarefa da sua própria Org
    DELETE FROM tasks WHERE id = v_task_a1;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
        RAISE NOTICE 'TESTE 7 PASSOU: DELETE físico bloqueado pelo RLS! Nenhuma tarefa foi apagada fisicamente (Linhas afetadas: 0).';
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 7 FALHOU: VIOLAÇÃO DE PRESERVAÇÃO! Tarefa foi apagada fisicamente do banco!';
        v_failed := v_failed + 1;
    END IF;

    -- Validação: a tarefa continua existindo intacta
    SELECT COUNT(*) INTO v_count FROM tasks WHERE id = v_task_a1;
    IF v_count = 1 THEN
        RAISE NOTICE '✓ Verificação pós-delete: Tarefa v_task_a1 permanece 100%% íntegra na tabela.';
    ELSE
        RAISE WARNING '✗ Falha de persistência: Tarefa desapareceu!';
    END IF;

    -- ==================================================================
    -- TESTE 8: [IMUTABILIDADE] Tentativa de Adulteração em Audit Logs
    -- ==================================================================
    UPDATE audit_logs SET action = 'ADULTERADO' WHERE org_id = v_org_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
        RAISE NOTICE 'TESTE 8A PASSOU: Imutabilidade de auditoria! Tentativa de UPDATE em audit_logs bloqueada (0 linhas).';
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 8A FALHOU: Logs de auditoria foram adulterados!';
        v_failed := v_failed + 1;
    END IF;

    DELETE FROM audit_logs WHERE org_id = v_org_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
        RAISE NOTICE 'TESTE 8B PASSOU: Imutabilidade de auditoria! Tentativa de DELETE em audit_logs bloqueada (0 linhas).';
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 8B FALHOU: Logs de auditoria foram excluídos!';
        v_failed := v_failed + 1;
    END IF;

    -- ==================================================================
    -- TESTE 9: [ACESSO ANÔNIMO] Tentativa de Acesso com Papel 'anon'
    -- ==================================================================
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);

    SELECT COUNT(*) INTO v_count FROM tasks;
    IF v_count = 0 THEN
        RAISE NOTICE 'TESTE 9 PASSOU: Acesso anônimo 100%% bloqueado! Visitante não autenticado visualizou 0 tarefas.';
        v_passed := v_passed + 1;
    ELSE
        RAISE WARNING 'TESTE 9 FALHOU: VULNERABILIDADE CRÍTICA! Usuário anônimo acessou % tarefas!', v_count;
        v_failed := v_failed + 1;
    END IF;

    -- ==================================================================
    -- RESUMO FINAL DA BATERIA
    -- ==================================================================
    RAISE NOTICE '----------------------------------------------------------------------';
    RAISE NOTICE 'RESULTADO FINAL DA SUÍTE DE TESTES RLS:';
    RAISE NOTICE 'Testes Aprovados: % | Testes Reprovados: %', v_passed, v_failed;
    RAISE NOTICE '======================================================================';

    IF v_failed > 0 THEN
        RAISE EXCEPTION 'FALHA NA SUÍTE DE SEGURANÇA RLS: % teste(s) reprovado(s).', v_failed;
    END IF;
END $$;

-- Rollback limpo para não sujar o ambiente com dados mockados
ROLLBACK;
