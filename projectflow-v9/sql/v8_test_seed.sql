-- ============================================================
--  ProjectFlow V8 — SEED DE TESTE COMPLETO
--  
--  COMO USAR:
--  1. Faça login na aplicação com seu usuário
--  2. Execute este SQL no Supabase → SQL Editor
--  3. Recarregue a página
--
--  O que este seed cria:
--  ✓ Clientes (Customer A, B, C)
--  ✓ 3 Projetos com board + colunas
--  ✓ 18 Tarefas distribuídas nas colunas (com histórico)
--  ✓ Subtarefas e comentários
--  ✓ 1 Diagrama com nodes e edges
--  ✓ 1 Documento executivo (snapshot)
--  ✓ 1 Lead no pipeline CRM
--  ✓ 1 Knowledge Block por projeto
-- ============================================================

DO $$
DECLARE
  -- IDs do usuário atual (logado)
  v_user_id     UUID;
  v_profile_id  UUID;
  v_ws_id       UUID;

  -- Clientes
  v_cli_a UUID; v_cli_b UUID; v_cli_c UUID;

  -- Projetos
  v_proj_1 UUID; v_proj_2 UUID; v_proj_3 UUID;

  -- Boards
  v_board_1 UUID; v_board_2 UUID; v_board_3 UUID;

  -- Colunas do projeto 1
  v_col_todo UUID; v_col_plan UUID; v_col_exec UUID;
  v_col_rev  UUID; v_col_done UUID;

  -- Tarefas
  v_task_1 UUID; v_task_2 UUID; v_task_3 UUID;
  v_task_4 UUID; v_task_5 UUID; v_task_6 UUID;
  v_task_7 UUID; v_task_8 UUID; v_task_9 UUID;

  -- Pipeline
  v_stage_novo UUID;

  -- Diagrama
  v_diag UUID;
  v_node_1 UUID; v_node_2 UUID; v_node_3 UUID;
  v_node_4 UUID; v_node_5 UUID;

  -- Exec doc
  v_snap UUID;

BEGIN

  -- ── 1. Busca usuário logado ──────────────────────────────
  SELECT id INTO v_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário encontrado. Faça login primeiro e tente novamente.';
  END IF;

  v_profile_id := v_user_id;
  RAISE NOTICE 'Usando usuário: %', v_user_id;

  -- ── 2. Garante profile ───────────────────────────────────
  INSERT INTO public.profiles (id, full_name, avatar_color)
  VALUES (v_user_id, 'Usuário Teste', '#e07050')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- ── 3. Garante workspace ─────────────────────────────────
  SELECT workspace_id INTO v_ws_id
  FROM public.workspace_members WHERE user_id = v_user_id LIMIT 1;

  IF v_ws_id IS NULL THEN
    INSERT INTO public.workspaces (name, owner_id)
    VALUES ('Workspace Teste', v_user_id)
    RETURNING id INTO v_ws_id;

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_ws_id, v_user_id, 'owner');
  END IF;

  RAISE NOTICE 'Workspace: %', v_ws_id;

  -- ── 4. Clientes ──────────────────────────────────────────
  INSERT INTO public.clients (name, color_bg, color_text, contact, email)
  VALUES ('Customer A', '#fffbeb', '#d4a017', 'Ana Silva', 'ana@customera.com')
  ON CONFLICT (name) DO NOTHING RETURNING id INTO v_cli_a;
  IF v_cli_a IS NULL THEN SELECT id INTO v_cli_a FROM public.clients WHERE name='Customer A';END IF;

  INSERT INTO public.clients (name, color_bg, color_text, contact, email)
  VALUES ('Customer B', '#fff5f5', '#dc3545', 'Bruno Costa', 'bruno@customerb.com')
  ON CONFLICT (name) DO NOTHING RETURNING id INTO v_cli_b;
  IF v_cli_b IS NULL THEN SELECT id INTO v_cli_b FROM public.clients WHERE name='Customer B';END IF;

  INSERT INTO public.clients (name, color_bg, color_text, contact, email)
  VALUES ('Customer C', '#ecfdf5', '#1a9e5f', 'Carla Mendes', 'carla@customerc.com')
  ON CONFLICT (name) DO NOTHING RETURNING id INTO v_cli_c;
  IF v_cli_c IS NULL THEN SELECT id INTO v_cli_c FROM public.clients WHERE name='Customer C';END IF;

  -- ── 5. PROJETO 1 — Website Rebrand ───────────────────────
  INSERT INTO public.projects (
    name, description, owner_id, client_id, workspace_id,
    color, budget, status, objective, tech_stack
  ) VALUES (
    'Website Rebrand',
    'Redesign completo do site institucional com nova identidade visual',
    v_user_id, v_cli_a, v_ws_id,
    '#e07050', 45000, 'active',
    'Aumentar conversão em 30% e modernizar a presença digital da marca',
    ARRAY['React', 'Next.js', 'Tailwind', 'Supabase']
  ) RETURNING id INTO v_proj_1;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (v_proj_1, v_user_id, 'owner') ON CONFLICT DO NOTHING;

  -- Busca board criado pelo trigger AFTER INSERT
  SELECT id INTO v_board_1 FROM public.kanban_boards WHERE project_id = v_proj_1 LIMIT 1;

  -- Busca colunas
  SELECT id INTO v_col_todo FROM public.kanban_columns WHERE board_id=v_board_1 AND position=1;
  SELECT id INTO v_col_plan FROM public.kanban_columns WHERE board_id=v_board_1 AND position=2;
  SELECT id INTO v_col_exec FROM public.kanban_columns WHERE board_id=v_board_1 AND position=3;
  SELECT id INTO v_col_rev  FROM public.kanban_columns WHERE board_id=v_board_1 AND position=4;
  SELECT id INTO v_col_done FROM public.kanban_columns WHERE board_id=v_board_1 AND position=5;

  RAISE NOTICE 'Projeto 1 criado: %, board: %', v_proj_1, v_board_1;

  -- ── 6. Tarefas do Projeto 1 ──────────────────────────────

  -- Tarefa 1: Planejado
  INSERT INTO public.tasks (
    project_id, board_id, column_id, title, description,
    bpmn_status, priority, estimated_hours, budget,
    due_date, tags, created_by,
    doc_decision, doc_risk, acceptance_criteria
  ) VALUES (
    v_proj_1, v_board_1, v_col_todo,
    'Pesquisa de mercado e análise de concorrentes',
    'Analisar os 5 principais concorrentes e identificar oportunidades de diferenciação',
    'viabilizar', 'high', 16, 2000,
    CURRENT_DATE + 7,
    ARRAY['pesquisa', 'estratégia'],
    v_user_id,
    'Foco em UX e performance — descartar abordagem apenas visual',
    'Dados desatualizados podem comprometer a análise',
    'Relatório com pelo menos 5 concorrentes analisados, entregue em PDF'
  ) RETURNING id INTO v_task_1;

  -- Tarefa 2: Prioridade
  INSERT INTO public.tasks (
    project_id, board_id, column_id, title, description,
    bpmn_status, priority, estimated_hours, budget,
    due_date, tags, created_by,
    doc_decision, doc_artifact
  ) VALUES (
    v_proj_1, v_board_1, v_col_plan,
    'Design System — tokens de cor e tipografia',
    'Criar os tokens fundamentais: paleta de cores, escala tipográfica, espaçamentos',
    'atribuir', 'high', 24, 4000,
    CURRENT_DATE + 14,
    ARRAY['design', 'tokens'],
    v_user_id,
    'Usar Figma Tokens + CSS Custom Properties para implementação',
    'design-system-v1.fig, tokens.json exportado'
  ) RETURNING id INTO v_task_2;

  -- Tarefa 3: Em Execução
  INSERT INTO public.tasks (
    project_id, board_id, column_id, title, description,
    bpmn_status, priority, estimated_hours, budget,
    due_date, is_blocked, blocked_reason, tags, created_by,
    doc_decision, doc_artifact, doc_risk, doc_notes
  ) VALUES (
    v_proj_1, v_board_1, v_col_exec,
    'Homepage — Hero section e navegação',
    'Implementar novo hero com animação de entrada, nav responsiva e CTA principal',
    'executar', 'high', 32, 5500,
    CURRENT_DATE + 5,
    false, null,
    ARRAY['frontend', 'react'],
    v_user_id,
    'Usar framer-motion para animações — aprovado em reunião de 15/03',
    'hero-component.tsx, nav-component.tsx',
    'Assets de imagem ainda não entregues pelo cliente',
    'Sprint 2 em andamento. Header 80% completo, animações em progresso.'
  ) RETURNING id INTO v_task_3;

  -- Tarefa 4: Em Revisão
  INSERT INTO public.tasks (
    project_id, board_id, column_id, title, description,
    bpmn_status, priority, estimated_hours, budget,
    due_date, tags, created_by
  ) VALUES (
    v_proj_1, v_board_1, v_col_rev,
    'SEO técnico — meta tags e estrutura semântica',
    'Implementar meta tags, Open Graph, schema.org e auditoria de acessibilidade',
    'avaliar', 'medium', 12, 1800,
    CURRENT_DATE + 3,
    ARRAY['seo', 'acessibilidade'],
    v_user_id
  ) RETURNING id INTO v_task_4;

  -- Tarefa 5: Concluído
  INSERT INTO public.tasks (
    project_id, board_id, column_id, title, description,
    bpmn_status, priority, estimated_hours, actual_hours,
    budget, tags, created_by, completed_at
  ) VALUES (
    v_proj_1, v_board_1, v_col_done,
    'Setup do repositório e CI/CD',
    'Configurar monorepo, GitHub Actions, deploy automático para Vercel',
    'concluido', 'high', 8, 7,
    1200,
    ARRAY['devops', 'setup'],
    v_user_id,
    NOW() - INTERVAL '3 days'
  ) RETURNING id INTO v_task_5;

  -- Tarefa 6: Planejado 2
  INSERT INTO public.tasks (
    project_id, board_id, column_id, title, description,
    bpmn_status, priority, estimated_hours, budget,
    due_date, tags, created_by
  ) VALUES (
    v_proj_1, v_board_1, v_col_todo,
    'Integração com CMS Headless',
    'Configurar Contentful para gerenciamento de conteúdo dinâmico',
    'esbocar', 'medium', 20, 3000,
    CURRENT_DATE + 21,
    ARRAY['cms', 'integração'],
    v_user_id
  ) RETURNING id INTO v_task_6;

  -- Subtarefas da tarefa 3
  INSERT INTO public.subtasks (task_id, title, completed, position) VALUES
    (v_task_3, 'Markup HTML semântico', true,  1),
    (v_task_3, 'Estilos CSS e responsividade', true, 2),
    (v_task_3, 'Animação de entrada (framer-motion)', false, 3),
    (v_task_3, 'Teste em mobile e tablet', false, 4);

  -- Subtarefas da tarefa 1
  INSERT INTO public.subtasks (task_id, title, completed, position) VALUES
    (v_task_1, 'Identificar 5 concorrentes diretos', false, 1),
    (v_task_1, 'Análise de UX e navegação', false, 2),
    (v_task_1, 'Relatório em Notion', false, 3);

  -- Comentários
  INSERT INTO public.comments (task_id, author_id, content) VALUES
    (v_task_3, v_user_id, 'Assets do cliente chegaram para 2 das 3 seções. Aguardando a terceira.'),
    (v_task_3, v_user_id, 'Hero section aprovada no staging. Seguindo para animações.'),
    (v_task_4, v_user_id, 'Lighthouse score: 94 performance, 89 acessibilidade. Precisa de ajuste nas cores de contraste.');

  -- ── 7. PROJETO 2 — App Mobile ────────────────────────────
  INSERT INTO public.projects (
    name, description, owner_id, client_id, workspace_id,
    color, budget, status, objective, tech_stack
  ) VALUES (
    'App Mobile — Customer B',
    'Aplicativo iOS e Android para o Customer B com funcionalidades de fidelidade',
    v_user_id, v_cli_b, v_ws_id,
    '#6c5ce7', 80000, 'active',
    'Aumentar retenção de clientes em 25% via programa de fidelidade gamificado',
    ARRAY['React Native', 'Expo', 'Node.js', 'PostgreSQL']
  ) RETURNING id INTO v_proj_2;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (v_proj_2, v_user_id, 'owner') ON CONFLICT DO NOTHING;

  SELECT id INTO v_board_2 FROM public.kanban_boards WHERE project_id = v_proj_2 LIMIT 1;

  -- 3 tarefas rápidas no projeto 2
  INSERT INTO public.tasks (project_id, board_id, column_id, title, bpmn_status, priority, estimated_hours, created_by)
  SELECT v_proj_2, v_board_2, c.id, t.title, t.status::task_status, t.pri::priority_level, t.hrs, v_user_id
  FROM (VALUES
    ('Wireframes — fluxo de onboarding',   'esbocar',  'high',   20),
    ('API de autenticação JWT',             'executar', 'high',   16),
    ('Tela de perfil e configurações',      'atribuir', 'medium', 12)
  ) AS t(title, status, pri, hrs)
  CROSS JOIN LATERAL (
    SELECT id FROM public.kanban_columns
    WHERE board_id = v_board_2
    ORDER BY position LIMIT 1
  ) c;

  -- ── 8. PROJETO 3 — E-commerce ────────────────────────────
  INSERT INTO public.projects (
    name, description, owner_id, client_id, workspace_id,
    color, budget, status, objective
  ) VALUES (
    'E-commerce Customer C',
    'Loja virtual completa com checkout otimizado e integração de pagamentos',
    v_user_id, v_cli_c, v_ws_id,
    '#00b894', 35000, 'active',
    'Lançar loja própria e reduzir dependência de marketplaces em 50%'
  ) RETURNING id INTO v_proj_3;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (v_proj_3, v_user_id, 'owner') ON CONFLICT DO NOTHING;

  SELECT id INTO v_board_3 FROM public.kanban_boards WHERE project_id = v_proj_3 LIMIT 1;

  INSERT INTO public.tasks (project_id, board_id, column_id, title, bpmn_status, priority, estimated_hours, created_by)
  SELECT v_proj_3, v_board_3, c.id, t.title, t.status::task_status, t.pri::priority_level, t.hrs, v_user_id
  FROM (VALUES
    ('Catálogo de produtos — CRUD completo',  'executar',  'high',   24),
    ('Integração Stripe/PagSeguro',           'esbocar',   'high',   16),
    ('Relatórios de vendas — dashboard',      'viabilizar','medium', 20)
  ) AS t(title, status, pri, hrs)
  CROSS JOIN LATERAL (
    SELECT id FROM public.kanban_columns
    WHERE board_id = v_board_3
    ORDER BY position LIMIT 1
  ) c;

  -- ── 9. DIAGRAMA do Projeto 1 ─────────────────────────────
  SELECT id INTO v_diag FROM public.project_diagrams WHERE project_id = v_proj_1 LIMIT 1;

  IF v_diag IS NULL THEN
    INSERT INTO public.project_diagrams (project_id, name, is_current, diagram_type, generated_from, created_by)
    VALUES (v_proj_1, 'Arquitetura — Website Rebrand', true, 'data_flow', 'manual', v_user_id)
    RETURNING id INTO v_diag;
  ELSE
    UPDATE public.project_diagrams SET name = 'Arquitetura — Website Rebrand' WHERE id = v_diag;
  END IF;

  -- Nodes do diagrama
  INSERT INTO public.diagram_nodes (diagram_id, node_key, node_type, label, description, pos_x, pos_y, width, height, bg_color, border_color)
  VALUES
    (v_diag, 'browser',   'source',    'Browser',         'Usuário final',            50,  200, 140, 70, '#DBEAFE', '#2563EB') RETURNING id INTO v_node_1;

  INSERT INTO public.diagram_nodes (diagram_id, node_key, node_type, label, description, pos_x, pos_y, width, height, bg_color, border_color)
  VALUES (v_diag, 'nextjs',   'service',   'Next.js App',     'Frontend SSR + SSG',       280, 200, 160, 70, '#F3E8FF', '#7C3AED') RETURNING id INTO v_node_2;

  INSERT INTO public.diagram_nodes (diagram_id, node_key, node_type, label, description, pos_x, pos_y, width, height, bg_color, border_color)
  VALUES (v_diag, 'supabase', 'database',  'Supabase',        'Auth + PostgreSQL + API',  520, 200, 160, 70, '#DCFCE7', '#16A34A') RETURNING id INTO v_node_3;

  INSERT INTO public.diagram_nodes (diagram_id, node_key, node_type, label, description, pos_x, pos_y, width, height, bg_color, border_color)
  VALUES (v_diag, 'cms',      'api',       'Contentful CMS',  'Conteúdo dinâmico',        280, 340, 160, 70, '#FEF9C3', '#CA8A04') RETURNING id INTO v_node_4;

  INSERT INTO public.diagram_nodes (diagram_id, node_key, node_type, label, description, pos_x, pos_y, width, height, bg_color, border_color)
  VALUES (v_diag, 'vercel',   'output',    'Vercel CDN',      'Deploy + Edge Functions',  520, 340, 160, 70, '#FFE4E6', '#E11D48') RETURNING id INTO v_node_5;

  -- Edges do diagrama
  INSERT INTO public.diagram_edges (diagram_id, source_node_id, target_node_id, label, edge_type, color)
  VALUES
    (v_diag, v_node_1, v_node_2, 'HTTPS Request', 'arrow',        '#6B7280'),
    (v_diag, v_node_2, v_node_3, 'Auth + Query',  'arrow',        '#7C3AED'),
    (v_diag, v_node_4, v_node_2, 'Content API',   'dashed',       '#CA8A04'),
    (v_diag, v_node_2, v_node_5, 'Deploy',        'arrow',        '#E11D48'),
    (v_diag, v_node_3, v_node_5, 'Edge Config',   'bidirectional','#16A34A');

  RAISE NOTICE 'Diagrama criado: %', v_diag;

  -- ── 10. DOCUMENTO EXECUTIVO ──────────────────────────────
  INSERT INTO public.exec_documents (
    project_id, version, title, content_html, generated_by
  ) VALUES (
    v_proj_1, 1,
    'Documento Executivo — Website Rebrand v1.0',
    '<h1>Website Rebrand — Documento Executivo</h1>
<h2>Resumo Executivo</h2>
<p>O projeto Website Rebrand tem como objetivo redesenhar completamente a presença digital do Customer A, com foco em conversão, performance e modernização da identidade visual.</p>
<h2>Objetivos de Negócio</h2>
<ul><li>Aumentar taxa de conversão em 30%</li><li>Reduzir bounce rate em 20%</li><li>Melhorar Lighthouse score para 90+ em todas as métricas</li></ul>
<h2>Stack Tecnológica</h2>
<p>React + Next.js para SSR, Tailwind CSS para styling, Supabase para backend, Vercel para deploy com CDN global.</p>
<h2>Cronograma</h2>
<p>Sprint 1 (concluída): Setup, CI/CD, Design System base.<br>Sprint 2 (em andamento): Homepage, SEO, integrações.<br>Sprint 3 (planejada): CMS, testes e lançamento.</p>
<h2>Riscos Identificados</h2>
<ul><li>Atraso na entrega de assets pelo cliente</li><li>Complexidade da integração CMS</li></ul>',
    v_user_id
  );

  -- ── 11. AI DOC SNAPSHOT ──────────────────────────────────
  INSERT INTO public.ai_doc_snapshots (
    project_id, created_by, status,
    context_json, chain_a_json, chain_b_json, chain_c_json, chain_d_json
  ) VALUES (
    v_proj_1, v_user_id, 'completed',
    jsonb_build_object(
      'project_name', 'Website Rebrand',
      'total_tasks', 6,
      'done_tasks', 1,
      'tech_stack', ARRAY['React', 'Next.js', 'Tailwind', 'Supabase'],
      'generated_at', NOW()
    ),
    jsonb_build_object(
      'scope', 'Redesign completo da presença digital',
      'risks', ARRAY['Atraso em assets', 'Complexidade CMS'],
      'out_of_scope', ARRAY['App mobile', 'Integração ERP']
    ),
    jsonb_build_object(
      'architecture', 'JAMstack com SSR',
      'tech_decisions', ARRAY['Next.js por SEO e performance', 'Supabase por custo-benefício'],
      'deployment', 'Vercel com CI/CD automático'
    ),
    jsonb_build_object(
      'roi_estimate', '30% aumento em conversão',
      'payback_period', '6 meses',
      'investment', 'R$ 45.000'
    ),
    jsonb_build_object(
      'next_actions', ARRAY[
        'Cobrar assets do cliente (prazo: 20/03)',
        'Revisar SEO com cliente',
        'Planejar sprint 3'
      ],
      'blockers', ARRAY['Assets pendentes do cliente']
    )
  );

  -- ── 12. KNOWLEDGE BLOCKS ─────────────────────────────────
  INSERT INTO public.knowledge_blocks (project_id, type, position, content, icon, created_by)
  VALUES
    (v_proj_1, 'heading1',  1, 'Website Rebrand — Wiki do Projeto', '🌐', v_user_id),
    (v_proj_1, 'paragraph', 2, 'Este documento centraliza todas as decisões técnicas, recursos e links relevantes do projeto Website Rebrand para o Customer A.', null, v_user_id),
    (v_proj_1, 'heading2',  3, 'Links Importantes', '🔗', v_user_id),
    (v_proj_1, 'paragraph', 4, 'Figma: https://figma.com/file/... | Staging: https://rebrand-staging.vercel.app | Docs: https://notion.so/...', null, v_user_id),
    (v_proj_1, 'callout',   5, '⚠ Assets de imagem pendentes com o cliente — prazo limite 20/03/2026', null, v_user_id),
    (v_proj_2, 'heading1',  1, 'App Mobile — Decisões de Arquitetura', '📱', v_user_id),
    (v_proj_2, 'paragraph', 2, 'Usando React Native + Expo para desenvolvimento cross-platform. API REST no Node.js com autenticação JWT.', null, v_user_id),
    (v_proj_3, 'heading1',  1, 'E-commerce — Setup e Integrações', '🛒', v_user_id),
    (v_proj_3, 'paragraph', 2, 'Integração de pagamentos: Stripe para cartão internacional, PagSeguro para PIX e boleto. Catálogo com estoque em tempo real.', null, v_user_id);

  -- ── 13. PIPELINE CRM ─────────────────────────────────────
  SELECT id INTO v_stage_novo FROM public.pipeline_stages WHERE is_default = true LIMIT 1;
  IF v_stage_novo IS NULL THEN
    SELECT id INTO v_stage_novo FROM public.pipeline_stages ORDER BY position LIMIT 1;
  END IF;

  IF v_stage_novo IS NOT NULL THEN
    INSERT INTO public.leads (
      client_id, owner_id, stage_id, project_id,
      title, contact_name, contact_email, company_name,
      source, status, value, probability,
      expected_close, notes, tags
    ) VALUES (
      v_cli_b, v_user_id, v_stage_novo, v_proj_2,
      'Expansão App Mobile — Módulo Analytics',
      'Bruno Costa', 'bruno@customerb.com', 'Customer B',
      'inbound', 'qualified', 25000, 60,
      CURRENT_DATE + 30,
      'Cliente manifestou interesse em adicionar módulo de analytics ao app. Reunião agendada.',
      ARRAY['upsell', 'analytics']
    );
  END IF;

  -- ── 14. HISTÓRICO DE TAREFAS ─────────────────────────────
  -- Simula histórico da tarefa concluída
  INSERT INTO public.task_history (
    task_id, changed_by, change_type,
    from_status, to_status, from_col, to_col,
    field_name, old_value, new_value, changed_at
  ) VALUES
    (v_task_5, v_user_id, 'status_change',
     'esbocar'::task_status, 'atribuir'::task_status,
     'todo'::kanban_col, 'plan'::kanban_col,
     'bpmn_status', 'esbocar', 'atribuir',
     NOW() - INTERVAL '5 days'),
    (v_task_5, v_user_id, 'status_change',
     'atribuir'::task_status, 'executar'::task_status,
     'plan'::kanban_col, 'exec'::kanban_col,
     'bpmn_status', 'atribuir', 'executar',
     NOW() - INTERVAL '4 days'),
    (v_task_5, v_user_id, 'status_change',
     'executar'::task_status, 'concluido'::task_status,
     'exec'::kanban_col, 'done'::kanban_col,
     'bpmn_status', 'executar', 'concluido',
     NOW() - INTERVAL '3 days');

  -- ── RESUMO FINAL ─────────────────────────────────────────
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ SEED DE TESTE CRIADO COM SUCESSO!';
  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'Usuário:   %', v_user_id;
  RAISE NOTICE 'Workspace: %', v_ws_id;
  RAISE NOTICE 'Projeto 1: % (Website Rebrand)',  v_proj_1;
  RAISE NOTICE 'Projeto 2: % (App Mobile)',       v_proj_2;
  RAISE NOTICE 'Projeto 3: % (E-commerce)',       v_proj_3;
  RAISE NOTICE 'Board P1:  %', v_board_1;
  RAISE NOTICE 'Diagrama:  %', v_diag;
  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'Tarefas criadas: 12 (6 no P1, 3 no P2, 3 no P3)';
  RAISE NOTICE 'Subtarefas: 7 | Comentários: 3';
  RAISE NOTICE 'Diagrama: 5 nodes + 5 edges';
  RAISE NOTICE 'Doc executivo + AI Snapshot: 1 cada';
  RAISE NOTICE 'Knowledge Blocks: 9 | Lead CRM: 1';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Recarregue a página para ver os dados!';

END $$;
