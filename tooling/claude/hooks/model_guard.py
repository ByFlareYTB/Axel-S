#!/usr/bin/env python3
"""
Hook PreModelSwitch pour Claude Code.

But : préserver le quota en gardant Haiku comme modèle de travail.
  · toute bascule vers Opus est bloquée tant que l'heure de reset n'est pas atteinte ;
  · toute bascule vers Sonnet demande une confirmation explicite ;
  · le retour vers Haiku est toujours autorisé.

Installation : voir tooling/claude/README.md
Le hook lit l'événement sur stdin (JSON) et répond sur stdout (JSON).
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

# Fichier écrit par Claude Code quand un quota est épuisé ; il contient
# l'horodatage de réinitialisation. Ajustable via SITEFORGE_QUOTA_FILE.
FICHIER_QUOTA = os.environ.get(
    "SITEFORGE_QUOTA_FILE", os.path.expanduser("~/.claude/quota_reset.json")
)

MODELES_BLOQUES = ("opus",)
MODELES_A_CONFIRMER = ("sonnet",)


def heure_de_reset() -> datetime | None:
    """Horodatage de réinitialisation du quota, ou None si inconnu."""
    try:
        with open(FICHIER_QUOTA, encoding="utf-8") as fichier:
            donnees = json.load(fichier)
    except (OSError, ValueError):
        return None

    brut = donnees.get("reset_at") or donnees.get("resetAt")
    if not brut:
        return None
    try:
        return datetime.fromisoformat(str(brut).replace("Z", "+00:00"))
    except ValueError:
        return None


def quota_reinitialise() -> bool:
    """Vrai si l'heure de reset est passée (ou n'a jamais été renseignée)."""
    reset = heure_de_reset()
    if reset is None:
        # Aucun quota épuisé enregistré : on reste prudent et on garde la garde
        # active, c'est le comportement voulu au quotidien.
        return False
    if reset.tzinfo is None:
        reset = reset.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) >= reset


def famille(modele: str) -> str:
    return (modele or "").lower()


def repondre(decision: str, raison: str) -> None:
    """`allow` laisse passer, `deny` bloque, `ask` demande confirmation."""
    json.dump({"decision": decision, "reason": raison}, sys.stdout)
    sys.stdout.write("\n")
    sys.exit(0)


def main() -> None:
    try:
        evenement = json.load(sys.stdin)
    except ValueError:
        # Un hook qui plante ne doit jamais bloquer la session.
        repondre("allow", "Événement illisible, garde ignorée.")
        return

    cible = famille(evenement.get("to_model") or evenement.get("model") or "")

    if any(marqueur in cible for marqueur in MODELES_BLOQUES):
        if quota_reinitialise():
            repondre("ask", f"Quota réinitialisé. Confirmer la bascule vers {cible} ?")
        reset = heure_de_reset()
        moment = reset.astimezone().strftime("%H:%M") if reset else "inconnue"
        repondre(
            "deny",
            f"Bascule vers {cible} bloquée : quota non réinitialisé (reset prévu à {moment}). "
            "Restez sur Haiku, ou attendez la réinitialisation.",
        )

    if any(marqueur in cible for marqueur in MODELES_A_CONFIRMER):
        repondre(
            "ask",
            f"{cible} consomme davantage de quota que Haiku. Confirmer la bascule ?",
        )

    repondre("allow", "")


if __name__ == "__main__":
    main()
