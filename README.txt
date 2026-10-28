NEL_AI - Version avec données réelles via API-Football

FICHIERS
- index.html, style.css, script.js : interface HTML/CSS/JS
- api/matches.js : récupère les vrais matchs et scores du jour
- api/predict.js : calcule des probabilités simplifiées à partir des derniers matchs des équipes
- vercel.json : routage de l'application

AVANT DE COMMENCER
La clé API précédemment partagée dans une conversation doit être considérée comme exposée. Régénère-la dans le tableau de bord API-Football avant le déploiement. Ne mets jamais la clé dans index.html ou script.js.

CONFIGURATION
1. Ouvre https://dashboard.api-football.com/ et copie ta clé API régénérée.
2. Déploie ce dossier sur Vercel.
3. Dans Vercel > Project > Settings > Environment Variables, ajoute :
   Name: API_FOOTBALL_KEY
   Value: ta nouvelle clé API-Football
   Environment: Production (et Preview si nécessaire)
4. Enregistre puis redéploie le projet.
5. Ouvre le site et sélectionne une date. Si l'API ne fournit aucun match, le site l'indiquera et n'affichera pas de matchs fictifs.

IMPORTANT
- La clé est utilisée uniquement côté serveur dans /api.
- Les routes /api nécessitent Vercel ou un environnement compatible avec les fonctions serverless. Ouvrir index.html directement ou utiliser Live Server ne suffit pas.
- L'offre gratuite API-Football annonce 100 requêtes par jour. Consulte ton tableau de bord pour les limites en vigueur.
- Les compétitions, saisons et données disponibles dépendent de la couverture de l'API et de ton compte.
- Les probabilités sont calculées par un modèle statistique simplifié à partir des derniers résultats récupérés. Elles ne sont ni des prédictions garanties ni une promesse de gain.

DOCUMENTATION OFFICIELLE
https://www.api-football.com/documentation-v3
https://www.api-football.com/
