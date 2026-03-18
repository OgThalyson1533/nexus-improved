-- ============================================================
--  ProjectFlow V9 — SQL Migration
--  Execute no Supabase SQL Editor → Run
--  Adiciona novos campos, tabelas e constraints para as melhorias V9
--  Script IDEMPOTENTE — pode ser executado múltiplas vezes com segurança
-- ============================================================

-- ════════════════════════════════════════════════════════════
--  MIGRATION 1: Novos campos nas tasks (Kanban V9)
--  Campos: solicitante, área, cliente, pessoas-chave, checklist
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS request_date    DATE,
  ADD COLUMN IF NOT EXISTS requester       TEXT,
  ADD COLUMN IF NOT EXISTS area            TEXT,
  ADD COLUMN IF NOT EXISTS client_name     TEXT,
  ADD COLUMN IF NOT EXISTS key_people      TEXT,
  ADD COLUMN IF NOT EXISTS checklist       JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB;

-- Comentários nos campos novos
COMMENT ON COLUMN public.tasks.request_date  IS 'Data de geração da solicitação (V9)';
COMMENT ON COLUMN public.tasks.requester     IS 'Nome do solicitante da tarefa (V9)';
COMMENT ON COLUMN public.tasks.area          IS 'Área solicitante (ex: TI, Marketing) (V9)';
COMMENT ON COLUMN public.tasks.client_name   IS 'Cliente vinculado à tarefa (V9)';
COMMENT ON COLUMN public.tasks.key_people    IS 'Pessoas-chave / stakeholders da tarefa (V9)';
COMMENT ON COLUMN public.tasks.checklist     IS 'Checklist interativo JSON [{id,text,done}] (V9)';

-- ════════════════════════════════════════════════════════════
--  MIGRATION 2: Tabela de tarefas recorrentes (aprimorada V9)
--  Garante coluna is_locked na coluna "Planejado"
-- ════════════════════════════════════════════════════════════

-- Garante que a coluna Planejado seja sempre is_locked=false e primeira
-- (A criação já acontece via trigger handle_new_project)
-- Mas ajustamos o trigger para garantir is_locked=FALSE na col Planejado

CREATE OR REPLACE FUNCTION public.handle_new_project()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_board_id UUID;
BEGIN
  -- Membro owner
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  -- Board padrão
  INSERT INTO public.kanban_boards (project_id, name, is_default)
  VALUES (NEW.id, 'Board Principal', TRUE)
  RETURNING id INTO v_board_id;

  -- 6 colunas padrão — "Planejado" sempre na posição 1, is_locked=FALSE (fixa mas editável)
  INSERT INTO public.kanban_columns
    (board_id, name, position, wip_limit, color, bpmn_mapping, is_done_col, is_locked)
  VALUES
    (v_board_id, 'Planejado',    1, 4,    '#9A9A94', '{esbocar,viabilizar}',              FALSE, FALSE),
    (v_board_id, 'Prioridade',   2, 2,    '#6C5CE7', '{atribuir}',                         FALSE, FALSE),
    (v_board_id, 'Em Execução',  3, 3,    '#C48A0A', '{executar}',                         FALSE, FALSE),
    (v_board_id, 'Em Revisão',   4, 3,    '#3B6CDB', '{avaliar,corrigir,validar_cliente}', FALSE, FALSE),
    (v_board_id, 'Concluído',    5, NULL, '#1A9E5F', '{concluido}',                        TRUE,  FALSE),
    (v_board_id, 'Recorrentes',  6, NULL, '#E07050', '{}',                                 FALSE, TRUE)
  ON CONFLICT (board_id, position) DO NOTHING;

  -- Diagrama inicial V9 (content_json com versão fabric)
  INSERT INTO public.project_diagrams
    (project_id, name, is_current, generated_from, content_json)
  VALUES
    (NEW.id, 'Diagrama Principal', TRUE, 'auto',
     '{"canvas":{"objects":[],"version":"5.3.1"},"zoom":1,"vt":[1,0,0,1,0,0],"engine":"fabric-v9"}')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

-- ════════════════════════════════════════════════════════════
--  MIGRATION 3: Tabela de recorrências enriquecida (V9)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.recurring_tasks_v9 (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  board_id        UUID REFERENCES public.kanban_boards(id) ON DELETE SET NULL,
  column_id       UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  title           TEXT NOT NULL CHECK (length(title) >= 2),
  description     TEXT,
  priority        TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  area            TEXT,
  assigned_to     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  schedule        TEXT NOT NULL, -- 'daily' | 'weekly:mon' | 'weekly:mon,thu'
  last_run_date   DATE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_v9_proj ON public.recurring_tasks_v9(project_id);

-- RLS para recurring_tasks_v9
ALTER TABLE public.recurring_tasks_v9 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "p_rec_v9_all" ON public.recurring_tasks_v9;
CREATE POLICY "p_rec_v9_all" ON public.recurring_tasks_v9
  FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.can_write_project(project_id));

-- ════════════════════════════════════════════════════════════
--  MIGRATION 4: Diagrama V9 — garante colunas novas
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.project_diagrams
  ADD COLUMN IF NOT EXISTS engine       TEXT DEFAULT 'fabric-v9',
  ADD COLUMN IF NOT EXISTS linked_task  UUID REFERENCES public.tasks(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.project_diagrams.engine      IS 'Motor de renderização: fabric-v9 | svg-v8';
COMMENT ON COLUMN public.project_diagrams.linked_task IS 'Tarefa específica vinculada ao diagrama (rastreabilidade V9)';

-- ════════════════════════════════════════════════════════════
--  MIGRATION 5: Wiki — Supabase persistence (knowledge_blocks V9)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.knowledge_blocks
  ADD COLUMN IF NOT EXISTS linked_task UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS color       TEXT;

COMMENT ON COLUMN public.knowledge_blocks.linked_task IS 'Tarefa vinculada ao bloco (rastreabilidade V9)';

-- ════════════════════════════════════════════════════════════
--  MIGRATION 6: AI Doc Snapshots — rastreabilidade
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.ai_doc_snapshots
  ADD COLUMN IF NOT EXISTS linked_task UUID REFERENCES public.tasks(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ai_doc_snapshots.linked_task IS 'Tarefa vinculada ao snapshot (rastreabilidade V9)';

-- ════════════════════════════════════════════════════════════
--  MIGRATION 7: Índices de performance adicionais
-- ════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_tasks_area       ON public.tasks(area) WHERE area IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_requester  ON public.tasks(requester) WHERE requester IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_client_nm  ON public.tasks(client_name) WHERE client_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_req_date   ON public.tasks(request_date) WHERE request_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_recurring  ON public.tasks(is_recurring) WHERE is_recurring = TRUE;
CREATE INDEX IF NOT EXISTS idx_diag_task        ON public.project_diagrams(linked_task) WHERE linked_task IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_task          ON public.knowledge_blocks(linked_task) WHERE linked_task IS NOT NULL;

-- ════════════════════════════════════════════════════════════
--  MIGRATION 8: Trigger de auditoria ampliado (V9)
--  Agora rastreia também: area, requester, client_name
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_task_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Status BPMN
  IF OLD.bpmn_status IS DISTINCT FROM NEW.bpmn_status THEN
    INSERT INTO public.task_history
      (task_id,changed_by,change_type,from_status,to_status,from_col,to_col,field_name,old_value,new_value)
    VALUES
      (NEW.id,auth.uid(),'status_change',OLD.bpmn_status,NEW.bpmn_status,OLD.kanban_col,NEW.kanban_col,
       'bpmn_status',OLD.bpmn_status::TEXT,NEW.bpmn_status::TEXT);
  END IF;

  -- Título
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.task_history (task_id,changed_by,change_type,field_name,old_value,new_value)
    VALUES (NEW.id,auth.uid(),'field_change','title',OLD.title,NEW.title);
  END IF;

  -- Responsável
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.task_history (task_id,changed_by,change_type,field_name,old_value,new_value)
    VALUES (NEW.id,auth.uid(),'field_change','assigned_to',OLD.assigned_to::TEXT,NEW.assigned_to::TEXT);
  END IF;

  -- Prioridade
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.task_history (task_id,changed_by,change_type,field_name,old_value,new_value)
    VALUES (NEW.id,auth.uid(),'field_change','priority',OLD.priority::TEXT,NEW.priority::TEXT);
  END IF;

  -- Área (V9)
  IF OLD.area IS DISTINCT FROM NEW.area THEN
    INSERT INTO public.task_history (task_id,changed_by,change_type,field_name,old_value,new_value)
    VALUES (NEW.id,auth.uid(),'field_change','area',OLD.area,NEW.area);
  END IF;

  RETURN NEW;
END; $$;

-- Recria o trigger com o nome correto
DROP TRIGGER IF EXISTS task_audit ON public.tasks;
CREATE TRIGGER task_audit
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.audit_task_changes();

-- ════════════════════════════════════════════════════════════
--  MIGRATION 9: View enriquecida para o Dashboard V9
--  JOIN com projetos para facilitar filtros por cliente/área
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v9_tasks_dashboard AS
SELECT
  t.id,
  t.title,
  t.bpmn_status,
  t.kanban_col,
  t.priority,
  t.due_date,
  t.estimated_hours,
  t.budget,
  t.is_blocked,
  t.is_recurring,
  t.request_date,
  t.requester,
  t.area,
  t.client_name,
  t.key_people,
  t.checklist,
  t.assigned_to,
  t.project_id,
  t.column_id,
  t.created_at,
  t.updated_at,
  -- Dados do projeto
  p.name        AS project_name,
  p.color       AS project_color,
  p.client_name AS project_client,
  p.status      AS project_status,
  -- Dados do responsável
  pr.full_name  AS assignee_name,
  pr.initials   AS assignee_initials,
  pr.avatar_color AS assignee_color
FROM public.tasks        t
LEFT JOIN public.projects  p  ON p.id  = t.project_id
LEFT JOIN public.profiles  pr ON pr.id = t.assigned_to
WHERE public.is_project_member(t.project_id);

GRANT SELECT ON public.v9_tasks_dashboard TO authenticated;

-- ════════════════════════════════════════════════════════════
--  MIGRATION 10: Função helper para Dashboard V9
--  Retorna todas as tarefas com filtros opcionais
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_all_tasks_v9(
  p_project_id  UUID     DEFAULT NULL,
  p_status      TEXT     DEFAULT NULL,
  p_priority    TEXT     DEFAULT NULL,
  p_assigned_to UUID     DEFAULT NULL,
  p_area        TEXT     DEFAULT NULL,
  p_date_from   DATE     DEFAULT NULL,
  p_date_to     DATE     DEFAULT NULL
)
RETURNS SETOF public.v9_tasks_dashboard
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.v9_tasks_dashboard
  WHERE
    (p_project_id  IS NULL OR project_id  = p_project_id)
    AND (p_status  IS NULL OR bpmn_status::TEXT = p_status)
    AND (p_priority IS NULL OR priority::TEXT = p_priority)
    AND (p_assigned_to IS NULL OR assigned_to = p_assigned_to)
    AND (p_area    IS NULL OR area = p_area)
    AND (p_date_from IS NULL OR due_date >= p_date_from)
    AND (p_date_to   IS NULL OR due_date <= p_date_to)
  ORDER BY
    CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
    due_date ASC NULLS LAST,
    created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_tasks_v9 TO authenticated;

-- ════════════════════════════════════════════════════════════
--  VERIFICAÇÃO FINAL
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  col_cnt  INT;
  tbl_cnt  INT;
BEGIN
  -- Verifica novas colunas em tasks
  SELECT COUNT(*) INTO col_cnt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'tasks'
    AND column_name  IN ('request_date','requester','area','client_name','key_people','checklist');

  -- Verifica novas tabelas
  SELECT COUNT(*) INTO tbl_cnt
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('recurring_tasks_v9');

  IF col_cnt = 6 THEN
    RAISE NOTICE '✅ [V9] Novos campos em tasks: OK (6/6)';
  ELSE
    RAISE WARNING '[V9] Apenas %/6 campos novos em tasks encontrados', col_cnt;
  END IF;

  IF tbl_cnt >= 1 THEN
    RAISE NOTICE '✅ [V9] Tabela recurring_tasks_v9: OK';
  END IF;

  RAISE NOTICE '✅ ProjectFlow V9 Migration concluída com sucesso!';
END $$;
