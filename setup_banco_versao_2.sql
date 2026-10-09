-- Tabela TASKS
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  resp TEXT NOT NULL,
  date TEXT,
  prio TEXT NOT NULL DEFAULT 'Média',
  status TEXT NOT NULL DEFAULT 'Em Aberto',
  all_day BOOLEAN DEFAULT true,
  time_start TEXT,
  time_end TEXT,
  tags JSONB DEFAULT '[]',
  recur TEXT DEFAULT 'none',
  recur_days JSONB DEFAULT '[]',
  recur_start TEXT,
  recur_group_id TEXT,
  subtasks JSONB DEFAULT '[]',
  notes TEXT,
  is_meeting BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  completed_at TEXT,
  moved_at TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela HIST (Histórico de tarefas concluídas)
CREATE TABLE hist (
  id TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  resp TEXT NOT NULL,
  date TEXT,
  prio TEXT DEFAULT 'Média',
  status TEXT DEFAULT 'Concluída',
  all_day BOOLEAN DEFAULT true,
  time_start TEXT,
  time_end TEXT,
  tags JSONB DEFAULT '[]',
  recur TEXT DEFAULT 'none',
  recur_days JSONB DEFAULT '[]',
  recur_start TEXT,
  recur_group_id TEXT,
  subtasks JSONB DEFAULT '[]',
  notes TEXT,
  is_meeting BOOLEAN DEFAULT false,
  completed_at TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela MEETINGS
CREATE TABLE meets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT,
  time TEXT,
  resp TEXT,
  parts JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela TEAM (Membros da equipe)
CREATE TABLE team (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  color TEXT,
  is_admin BOOLEAN DEFAULT false
);

-- Tabela TAGS
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  bg TEXT
);

-- Tabela BACKUPS
CREATE TABLE backup_tasks (
  id TEXT PRIMARY KEY,
  backup_date TEXT,
  backup_label TEXT,
  tasks_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar Políticas de Acessos liberados (Apenas para Testes/Homologação)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE meets ENABLE ROW LEVEL SECURITY;
ALTER TABLE team ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for ALL on tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for ALL on hist" ON hist FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for ALL on meets" ON meets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for ALL on team" ON team FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for ALL on tags" ON tags FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for ALL on backup_tasks" ON backup_tasks FOR ALL USING (true) WITH CHECK (true);
