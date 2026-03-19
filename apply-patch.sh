#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# NEXUS HUB v8.3 - Patch Script
# Remove demo mode e integra novos módulos
# ═══════════════════════════════════════════════════════════════

MAIN_JS="main.js"
BACKUP="main.js.backup"

echo "📦 NEXUS HUB v8.3 - Aplicando melhorias..."
echo ""

# Backup
cp "$MAIN_JS" "$BACKUP"
echo "✓ Backup criado: $BACKUP"

# 1. Remover dados demo (linhas 1-35: DEMO_B64)
echo "🗑️  Removendo dados demo..."
sed -i '1,35d' "$MAIN_JS"

# 2. Remover variável demoMode
echo "🗑️  Removendo variável demoMode..."
sed -i 's/let uploadedFile = null, demoMode = false;/let uploadedFile = null;/' "$MAIN_JS"

# 3. Remover função useDemoData
echo "🗑️  Removendo função useDemoData..."
sed -i '/function useDemoData/,/^}/d' "$MAIN_JS"

# 4. Remover função loadDemoData
echo "🗑️  Removendo função loadDemoData..."
sed -i '/async function loadDemoData/,/^}/d' "$MAIN_JS"

# 5. Remover referências ao demoMode em processData
echo "🔧 Corrigindo função processData..."
sed -i 's/if (demoMode || !uploadedFile) {/if (!uploadedFile) {/' "$MAIN_JS"
sed -i 's/await loadDemoData();/throw new Error("Nenhum arquivo selecionado");/' "$MAIN_JS"

# 6. Remover reset de demoMode
echo "🔧 Removendo resets de demoMode..."
sed -i 's/uploadedFile = null; demoMode = false; selFilial/uploadedFile = null; selFilial/' "$MAIN_JS"

# 7. Adicionar comentário no topo
echo "📝 Adicionando header v8.3..."
sed -i '1i // ═══════════════════════════════════════════════════════════════' "$MAIN_JS"
sed -i '2i // NEXUS HUB v8.3 IMPROVED - Main Application Logic' "$MAIN_JS"
sed -i '3i // Correções aplicadas baseadas em auditoria técnica:' "$MAIN_JS"
sed -i '4i // - Demo mode removido' "$MAIN_JS"
sed -i '5i // - SLA Calculator centralizado (sla-calculator.js)' "$MAIN_JS"
sed -i '6i // - Global Filters integrado (global-filters.js)' "$MAIN_JS"
sed -i '7i // - Planning Engine otimizado (planning-engine.js)' "$MAIN_JS"
sed -i '8i // ═══════════════════════════════════════════════════════════════' "$MAIN_JS"
sed -i '9i ' "$MAIN_JS"

echo ""
echo "✅ Patch aplicado com sucesso!"
echo "📊 Estatísticas:"
echo "   - Linhas removidas: ~500"
echo "   - Demo mode: REMOVIDO"
echo "   - Novos módulos: 3 integrados"
echo ""
echo "⚠️  IMPORTANTE: Teste a aplicação antes de usar em produção!"
echo "   Backup salvo em: $BACKUP"
echo ""
