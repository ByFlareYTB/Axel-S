# Annexe — automatisation de Claude Code (outil de développement)

Ces fichiers configurent **Claude Code**, l'outil avec lequel l'application est
développée. Ils ne font pas partie du runtime de SiteForge AI : ils sont là pour
préserver le quota pendant le développement.

Ils sont versionnés ici plutôt qu'appliqués automatiquement, parce qu'ils
modifient votre dossier personnel `~/.claude/` — à vous de décider quand.

## 1. Modèle par défaut réglé sur Haiku

`settings.json` fixe Haiku comme modèle principal **et** comme modèle des
sous-agents.

```bash
mkdir -p ~/.claude
# Fusionnez avec votre settings.json existant si vous en avez déjà un.
cp tooling/claude/settings.json ~/.claude/settings.json
```

Si `~/.claude/settings.json` existe déjà, n'écrasez pas le fichier : recopiez
seulement les clés `model`, `subagentModel` et `hooks.PreModelSwitch`.

## 2. Hook `PreModelSwitch` — garde-fou de quota

`hooks/model_guard.py` intercepte les changements de modèle :

| Cible | Comportement |
| --- | --- |
| Opus | **bloqué** tant que l'heure de reset du quota n'est pas atteinte |
| Sonnet | **confirmation demandée** avant la bascule |
| Haiku | toujours autorisé |

```bash
mkdir -p ~/.claude/hooks
cp tooling/claude/hooks/model_guard.py ~/.claude/hooks/model_guard.py
chmod +x ~/.claude/hooks/model_guard.py
```

Le hook lit l'heure de réinitialisation dans `~/.claude/quota_reset.json` :

```json
{ "reset_at": "2026-09-14T18:00:00Z" }
```

Chemin modifiable via la variable d'environnement `SITEFORGE_QUOTA_FILE`.
En l'absence de ce fichier, la garde reste active — c'est le comportement
voulu au quotidien. Un hook qui échoue laisse toujours passer la bascule :
une garde ne doit jamais bloquer une session de travail.

Test manuel :

```bash
echo '{"to_model":"claude-opus-5"}' | python3 tooling/claude/hooks/model_guard.py
# {"decision": "deny", "reason": "Bascule vers claude-opus-5 bloquée : ..."}

echo '{"to_model":"claude-haiku-4-5"}' | python3 tooling/claude/hooks/model_guard.py
# {"decision": "allow", "reason": ""}
```

## 3. Serveur MCP Perplexity

Permet à Claude Code de faire ses recherches de développement via Perplexity,
sans consommer le quota Claude.

```bash
claude mcp add perplexity --env PERPLEXITY_API_KEY=votre_cle -- npx -y server-perplexity-ask
```

Ou, pour une configuration versionnée par projet, recopiez
`mcp-perplexity.json` dans `.mcp.json` à la racine du dépôt et exportez
`PERPLEXITY_API_KEY` dans votre shell.

Vérification : `claude mcp list` doit afficher `perplexity` comme connecté.

## Note sur le modèle de l'application

Le modèle utilisé par Claude Code (Haiku, pour le quota) et celui utilisé par
l'application pour **générer les sites clients** sont deux réglages distincts.
Le second se règle avec `ANTHROPIC_MODEL` dans `.env.local` — voir le README
principal.
