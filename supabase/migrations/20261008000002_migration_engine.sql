-- ==============================================================================
-- PULSE AGENDA 3.0 — CARD 2.1: ENGINE DE MIGRAÇÃO E RECONCILIAÇÃO
-- ==============================================================================
-- Objetivo: Infraestrutura técnica de migração automatizada, mapeamento legado -> UUID,
--           tabela de reconciliação, validação de integridade e divergência zero.
-- ==============================================================================

-- 1. TABELA DE AUDITORIA E RECONCILIAÇÃO DE MIGRAÇÃO
CREATE TABLE IF NOT EXISTS migration_reconciliation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL,
    entity_type TEXT NOT NULL,         -- 'users', 'tags', 'tasks_active', 'tasks_completed', 'subtasks'
    legacy_count INTEGER NOT NULL DEFAULT 0,
    migrated_count INTEGER NOT NULL DEFAULT 0,
    divergence INTEGER GENERATED ALWAYS AS (migrated_count - legacy_count) STORED,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'APPROVED', 'DIVERGENT', 'FAILED'
    validation_details JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_reconciliation_batch_entity UNIQUE (batch_id, entity_type)
);

-- Habilitar RLS na tabela de reconciliação
ALTER TABLE migration_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reconciliation_admin_only" ON migration_reconciliation
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- ==============================================================================
-- 2. FUNÇÕES AUXILIARES DE CONVERSÃO E MAPEAMENTO (PARSERS RESILIENTES)
-- ==============================================================================

-- 2.1 Conversor Seguro de Data Legada (Suporta ISO YYYY-MM-DD e BR DD/MM/YYYY)
CREATE OR REPLACE FUNCTION fn_convert_legacy_date(p_date_str TEXT)
RETURNS DATE AS $$
BEGIN
    IF p_date_str IS NULL OR TRIM(p_date_str) = '' OR TRIM(p_date_str) = '—' THEN
        RETURN NULL;
    END IF;

    -- Formato ISO: YYYY-MM-DD
    IF p_date_str ~ '^\d{4}-\d{2}-\d{2}' THEN
        RETURN SUBSTRING(p_date_str FROM 1 FOR 10)::DATE;
    END IF;

    -- Formato Brasileiro: DD/MM/YYYY
    IF p_date_str ~ '^\d{2}/\d{2}/\d{4}' THEN
        RETURN to_date(SUBSTRING(p_date_str FROM 1 FOR 10), 'DD/MM/YYYY');
    END IF;

    RETURN NULL;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2.2 Conversor Seguro de Timestamp Legado (Completed_at DD/MM/YYYY ou ISO)
CREATE OR REPLACE FUNCTION fn_convert_legacy_timestamp(p_ts_str TEXT)
RETURNS TIMESTAMPTZ AS $$
BEGIN
    IF p_ts_str IS NULL OR TRIM(p_ts_str) = '' OR TRIM(p_ts_str) = '—' THEN
        RETURN NULL;
    END IF;

    -- Formato Brasileiro: DD/MM/YYYY
    IF p_ts_str ~ '^\d{2}/\d{2}/\d{4}' THEN
        RETURN to_timestamp(SUBSTRING(p_ts_str FROM 1 FOR 10) || ' 12:00:00', 'DD/MM/YYYY HH24:MI:SS');
    END IF;

    -- Formato ISO com timezone ou hora
    IF p_ts_str ~ '^\d{4}-\d{2}-\d{2}' THEN
        RETURN p_ts_str::TIMESTAMPTZ;
    END IF;

    RETURN NULL;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2.2.1 Wrapper de Tolerância de Grafia (fn_convert_legacy_timestamptz -> fn_convert_legacy_timestamp)
CREATE OR REPLACE FUNCTION fn_convert_legacy_timestamptz(p_ts_str TEXT)
RETURNS TIMESTAMPTZ AS $$
BEGIN
    RETURN fn_convert_legacy_timestamp(p_ts_str);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2.3 Mapeador Idempotente Legado -> UUID
CREATE OR REPLACE FUNCTION fn_map_legacy_id(
    p_legacy_id TEXT,
    p_entity_type TEXT
)
RETURNS UUID AS $$
DECLARE
    v_new_uuid UUID;
BEGIN
    IF p_legacy_id IS NULL OR TRIM(p_legacy_id) = '' THEN
        RETURN NULL;
    END IF;

    -- 1. Verifica se já existe mapeamento prévio
    SELECT new_uuid INTO v_new_uuid 
    FROM legacy_id_mapping 
    WHERE legacy_id = p_legacy_id AND entity_type = p_entity_type;

    -- 2. Se não existir, gera novo UUID determinístico baseado no ID legado (UUID v5 / namespace)
    IF v_new_uuid IS NULL THEN
        v_new_uuid := uuid_generate_v5(uuid_ns_url(), 'pulse-agenda/' || p_entity_type || '/' || p_legacy_id);
        
        INSERT INTO legacy_id_mapping (legacy_id, new_uuid, entity_type)
        VALUES (p_legacy_id, v_new_uuid, p_entity_type)
        ON CONFLICT (legacy_id, entity_type) DO UPDATE SET created_at = legacy_id_mapping.created_at
        RETURNING new_uuid INTO v_new_uuid;
    END IF;

    RETURN v_new_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 3. MOTOR DE RECONCILIAÇÃO E AUDITORIA AUTOMATIZADA
-- ==============================================================================

CREATE OR REPLACE FUNCTION fn_audit_reconciliation_batch(
    p_batch_id UUID,
    p_entity_type TEXT,
    p_legacy_count INTEGER,
    p_migrated_count INTEGER,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
DECLARE
    v_status TEXT;
BEGIN
    IF (p_migrated_count - p_legacy_count) = 0 THEN
        v_status := 'APPROVED';
    ELSE
        v_status := 'DIVERGENT';
    END IF;

    INSERT INTO migration_reconciliation (
        batch_id,
        entity_type,
        legacy_count,
        migrated_count,
        status,
        validation_details,
        completed_at
    ) VALUES (
        p_batch_id,
        p_entity_type,
        p_legacy_count,
        p_migrated_count,
        v_status,
        p_details,
        timezone('utc', now())
    )
    ON CONFLICT (batch_id, entity_type) DO UPDATE SET
        legacy_count = EXCLUDED.legacy_count,
        migrated_count = EXCLUDED.migrated_count,
        status = EXCLUDED.status,
        validation_details = EXCLUDED.validation_details,
        completed_at = EXCLUDED.completed_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 4. GERADOR DE RELATÓRIO DE CONSISTÊNCIA E INTEGRIDADE
-- ==============================================================================

CREATE OR REPLACE FUNCTION fn_generate_migration_report(p_batch_id UUID)
RETURNS TABLE (
    entidade TEXT,
    total_esperado INTEGER,
    total_migrado INTEGER,
    divergencia INTEGER,
    resultado TEXT,
    detalhes JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mr.entity_type AS entidade,
        mr.legacy_count AS total_esperado,
        mr.migrated_count AS total_migrado,
        mr.divergence AS divergencia,
        mr.status AS resultado,
        mr.validation_details AS detalhes
    FROM migration_reconciliation mr
    WHERE mr.batch_id = p_batch_id
    ORDER BY mr.entity_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
