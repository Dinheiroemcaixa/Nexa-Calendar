-- ==============================================================================
-- PULSE AGENDA 3.0 — DDL RELACIONAL DEFINITIVO (HOMOLOGAÇÃO / STAGING)
-- ==============================================================================
-- Versão: 3.0.0-staging (Padronização Canônica)
-- Diretriz: PRESERVAÇÃO INTEGRAL DE DADOS, SOFT DELETE E RESTRICT REFERENCIAL
-- Proibições: SEM CASCADE DESTRUTIVO, SEM POLICIES 'USING true', SEM DELETE FÍSICO
-- ==============================================================================

-- 1. EXTENSÕES OBRIGATÓRIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TIPOS ENUMERADOS
-- ==============================================================================

-- Status oficial da tarefa (Soft Delete e Arquivamento incluídos)
DO $$ BEGIN
    CREATE TYPE task_status AS ENUM (
        'Em Aberto',
        'Em Andamento',
        'Concluída',
        'Cancelada',
        'Arquivada'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Prioridades
DO $$ BEGIN
    CREATE TYPE task_priority AS ENUM (
        'Baixa',
        'Média',
        'Alta'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tipos de Recorrência
DO $$ BEGIN
    CREATE TYPE task_recur_type AS ENUM (
        'none',
        'daily',
        'weekdays',
        'weekly',
        'monthly',
        'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Papéis de Tenant
DO $$ BEGIN
    CREATE TYPE tenant_role AS ENUM (
        'owner',
        'admin',
        'member',
        'viewer'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 3. ESTRUTURA ORGANIZACIONAL, TENANTS E USUÁRIOS
-- ==============================================================================

-- 3.1 Tabela de Organizações (Multi-Tenancy)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    cnpj TEXT DEFAULT '00000000000199',
    plan_tier TEXT DEFAULT 'enterprise',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_organizations_slug UNIQUE (slug)
);

-- 3.2 Tabela de Tenants (Unidades / Filiais da Organização)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_tenants_org_slug UNIQUE (organization_id, slug)
);

-- 3.3 Tabela de Papéis Legados (Roles)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_roles_code UNIQUE (code)
);

INSERT INTO roles (code, name, description)
VALUES 
    ('super_admin', 'Super Administrador', 'Acesso total de gestão e auditoria do sistema'),
    ('admin', 'Administrador', 'Gestão completa da organização, equipe e backups'),
    ('member', 'Membro da Equipe', 'Operação diária de tarefas, reuniões e histórico')
ON CONFLICT (code) DO NOTHING;

-- 3.4 Tabela de Perfis de Usuário (User Profiles - Desacoplada de auth.users na Fase 1)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Vínculo opcional para Fase 2
    organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    job_title TEXT DEFAULT 'Membro',
    color TEXT NOT NULL DEFAULT '#4f6ef7',
    avatar_url TEXT,
    pass_hash_compat TEXT, -- Permite autenticação legada sem quebra
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_user_profiles_email UNIQUE (email)
);

-- 3.5 Tabela Associativa de Usuários e Tenants (RBAC)
CREATE TABLE IF NOT EXISTS user_tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    role tenant_role NOT NULL DEFAULT 'member',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_user_tenants UNIQUE (user_id, organization_id, tenant_id)
);

-- ==============================================================================
-- 4. OPERAÇÃO (TAGS_V3, RECURRENCE_GROUPS, TASKS_V3, SUBTASKS, TASK_TAGS)
-- ==============================================================================

-- 4.1 Tabela de Tags / Categorias (tags_v3)
CREATE TABLE IF NOT EXISTS tags_v3 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    legacy_id TEXT,
    name TEXT NOT NULL,
    color_hex TEXT NOT NULL DEFAULT '#4f6ef7',
    bg_hex TEXT NOT NULL DEFAULT 'rgba(79,110,247,0.12)',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_tags_v3_org_name UNIQUE (organization_id, name)
);

-- 4.2 Tabela de Grupos de Recorrência (recurrence_groups)
CREATE TABLE IF NOT EXISTS recurrence_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    recurrence_pattern TEXT NOT NULL DEFAULT 'daily',
    interval_value INTEGER NOT NULL DEFAULT 1,
    days_of_week JSONB NOT NULL DEFAULT '[]'::jsonb,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4.3 Tabela de Tarefas Definitiva (tasks_v3)
CREATE TABLE IF NOT EXISTS tasks_v3 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legacy_id TEXT UNIQUE,
    legacy_recur_group_id TEXT,
    
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES user_profiles(id) ON DELETE RESTRICT,
    created_by UUID REFERENCES user_profiles(id) ON DELETE RESTRICT,
    
    due_date DATE,
    start_time TIME,
    end_time TIME,
    all_day BOOLEAN NOT NULL DEFAULT true,
    
    priority task_priority NOT NULL DEFAULT 'Média',
    status task_status NOT NULL DEFAULT 'Em Aberto',
    
    recurrence_group_id UUID REFERENCES recurrence_groups(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    
    -- Conclusão e Auditoria
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES user_profiles(id) ON DELETE RESTRICT,
    
    -- Preservação Obrigatória: Soft Delete
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES user_profiles(id) ON DELETE RESTRICT,
    cancellation_reason TEXT DEFAULT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4.4 Tabela de Subtarefas (Checklist Normalizado com is_completed canônico)
CREATE TABLE IF NOT EXISTS subtasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks_v3(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT false, -- Padronização canônica
    sort_order INTEGER NOT NULL DEFAULT 0,
    
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES user_profiles(id) ON DELETE RESTRICT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4.5 Tabela Associativa de Tarefas e Tags (N:M)
CREATE TABLE IF NOT EXISTS task_tags (
    task_id UUID NOT NULL REFERENCES tasks_v3(id) ON DELETE RESTRICT,
    tag_id UUID NOT NULL REFERENCES tags_v3(id) ON DELETE RESTRICT,
    PRIMARY KEY (task_id, tag_id)
);

-- ==============================================================================
-- 5. AUDITORIA E LOGS (AUDIT_LOGS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    actor_id UUID REFERENCES user_profiles(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    entity_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ==============================================================================
-- 6. CONFIGURAÇÃO (SETTINGS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    updated_by UUID REFERENCES user_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_settings_org_key UNIQUE (organization_id, key)
);

-- ==============================================================================
-- 7. MIGRAÇÃO E RASTREABILIDADE (LEGACY_ID_MAPPING)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS legacy_id_mapping (
    legacy_id TEXT NOT NULL,
    new_uuid UUID NOT NULL,
    entity_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (legacy_id, entity_type)
);

-- ==============================================================================
-- 8. ÍNDICES DE PERFORMANCE (B-TREE OTIMIZADOS)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_tasks_v3_org_active ON tasks_v3(organization_id, status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_v3_assigned_to ON tasks_v3(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_v3_recur_group ON tasks_v3(recurrence_group_id) WHERE recurrence_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_v3_sort_order ON tasks_v3(organization_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_v3_deleted_at ON tasks_v3(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_v3_completed_at ON tasks_v3(completed_at) WHERE status = 'Concluída';
CREATE INDEX IF NOT EXISTS idx_tasks_v3_legacy_id ON tasks_v3(legacy_id);

CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legacy_mapping_lookup ON legacy_id_mapping(new_uuid);

-- ==============================================================================
-- 9. SEGURANÇA E ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- 9.1 Funções Utilitárias de Segurança (Security Definer)
CREATE OR REPLACE FUNCTION get_auth_org_id()
RETURNS UUID AS $$
    SELECT organization_id FROM user_profiles WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM user_tenants ut
        JOIN user_profiles p ON p.id = ut.user_id
        WHERE p.auth_user_id = auth.uid() AND ut.role IN ('owner', 'admin') AND p.is_active = true
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 9.2 Habilitar RLS nas Tabelas Físicas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurrence_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_id_mapping ENABLE ROW LEVEL SECURITY;

-- 9.3 Políticas de Segurança: ORGANIZATIONS & TENANTS
CREATE POLICY "org_select_own" ON organizations FOR SELECT TO authenticated USING (id = get_auth_org_id());
CREATE POLICY "tenants_select_own" ON tenants FOR SELECT TO authenticated USING (organization_id = get_auth_org_id());

-- 9.4 Políticas de Segurança: USER_PROFILES
CREATE POLICY "profiles_select_same_org" ON user_profiles FOR SELECT TO authenticated USING (organization_id = get_auth_org_id());
CREATE POLICY "profiles_update_self_or_admin" ON user_profiles FOR UPDATE TO authenticated USING (auth_user_id = auth.uid() OR is_admin());

-- 9.5 Políticas de Segurança: TAGS_V3
CREATE POLICY "tags_v3_select_org" ON tags_v3 FOR SELECT TO authenticated USING (organization_id = get_auth_org_id());
CREATE POLICY "tags_v3_insert_org" ON tags_v3 FOR INSERT TO authenticated WITH CHECK (organization_id = get_auth_org_id());
CREATE POLICY "tags_v3_update_org" ON tags_v3 FOR UPDATE TO authenticated USING (organization_id = get_auth_org_id());
CREATE POLICY "tags_v3_delete_admin" ON tags_v3 FOR DELETE TO authenticated USING (organization_id = get_auth_org_id() AND is_admin());

-- 9.6 Políticas de Segurança: TASKS_V3
CREATE POLICY "tasks_v3_select_org" ON tasks_v3 FOR SELECT TO authenticated USING (organization_id = get_auth_org_id());
CREATE POLICY "tasks_v3_insert_org" ON tasks_v3 FOR INSERT TO authenticated WITH CHECK (organization_id = get_auth_org_id());
CREATE POLICY "tasks_v3_update_org" ON tasks_v3 FOR UPDATE TO authenticated USING (organization_id = get_auth_org_id());

-- BLOQUEIO INEGOCIÁVEL DE EXCLUSÃO FÍSICA
CREATE POLICY "tasks_v3_prohibit_physical_delete" ON tasks_v3 FOR DELETE TO authenticated USING (false);

-- 9.7 Políticas de Segurança: SUBTASKS
CREATE POLICY "subtasks_select_via_task" ON subtasks FOR SELECT TO authenticated 
    USING (task_id IN (SELECT id FROM tasks_v3 WHERE organization_id = get_auth_org_id()));
CREATE POLICY "subtasks_insert_via_task" ON subtasks FOR INSERT TO authenticated 
    WITH CHECK (task_id IN (SELECT id FROM tasks_v3 WHERE organization_id = get_auth_org_id()));
CREATE POLICY "subtasks_update_via_task" ON subtasks FOR UPDATE TO authenticated 
    USING (task_id IN (SELECT id FROM tasks_v3 WHERE organization_id = get_auth_org_id()));
CREATE POLICY "subtasks_prohibit_physical_delete" ON subtasks FOR DELETE TO authenticated USING (false);

-- 9.8 Políticas de Segurança: TASK_TAGS
CREATE POLICY "task_tags_select_org" ON task_tags FOR SELECT TO authenticated 
    USING (task_id IN (SELECT id FROM tasks_v3 WHERE organization_id = get_auth_org_id()));
CREATE POLICY "task_tags_insert_org" ON task_tags FOR INSERT TO authenticated 
    WITH CHECK (task_id IN (SELECT id FROM tasks_v3 WHERE organization_id = get_auth_org_id()));
CREATE POLICY "task_tags_delete_org" ON task_tags FOR DELETE TO authenticated 
    USING (task_id IN (SELECT id FROM tasks_v3 WHERE organization_id = get_auth_org_id()));

-- 9.9 Políticas de Segurança: AUDIT_LOGS
CREATE POLICY "audit_logs_select_admin" ON audit_logs FOR SELECT TO authenticated USING (organization_id = get_auth_org_id() AND is_admin());
CREATE POLICY "audit_logs_insert_org" ON audit_logs FOR INSERT TO authenticated WITH CHECK (organization_id = get_auth_org_id());
CREATE POLICY "audit_logs_no_update" ON audit_logs FOR UPDATE TO authenticated USING (false);
CREATE POLICY "audit_logs_no_delete" ON audit_logs FOR DELETE TO authenticated USING (false);

-- 9.10 Políticas de Segurança: SETTINGS & LEGACY_MAPPING
CREATE POLICY "settings_select_org" ON settings FOR SELECT TO authenticated USING (organization_id = get_auth_org_id());
CREATE POLICY "legacy_mapping_select_admin" ON legacy_id_mapping FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "legacy_mapping_no_delete" ON legacy_id_mapping FOR DELETE TO authenticated USING (false);
