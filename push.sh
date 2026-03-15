#!/bin/bash
# ============================================================
# push.sh — Envia as últimas alterações para o GitHub
# Uso: ./push.sh "mensagem do commit"
# ============================================================

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "📁 Repositório: $REPO_DIR"
echo ""

# Verifica se há alterações
if git diff --quiet && git diff --cached --quiet; then
  # Sem alterações locais — apenas faz push do que já está commitado
  echo "✅ Nenhuma alteração nova. Fazendo push dos commits pendentes..."
else
  # Há alterações — faz commit automático
  MESSAGE="${1:-"chore: atualização automática via push.sh"}"
  echo "📝 Commit: $MESSAGE"
  git add -A
  git commit -m "$MESSAGE"
fi

echo ""
echo "🚀 Enviando para o GitHub..."
git push origin main

echo ""
echo "✅ Push concluído! Vercel irá fazer o deploy automaticamente."
