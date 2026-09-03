# POINTAGE

Application mobile PWA de gestion de bons de livraison en entrepôt pour fournitures scolaires.

## Fonctionnalités

- **Multi-BL** : Gestion simultanée de plusieurs bons de livraison
- **3 étapes indépendantes** : Préparation → Chargement → Pointage
- **Recherche rapide** : SMART, N°, Référence, EAN, Désignation
- **Scanner de codes-barres** : Scan EAN-13/EAN-8 via caméra
- **Arithmétique d'emballages** : Cartons ext/int + unités avec calcul automatique
- **Cartons de transport** : Répartition par carton (A, B, C...)
- **Corrections de BL** : Modification de quantités avec historique et raison
- **Statuts de ligne** : Actif, Annulé, Introuvable, Supprimé par révision
- **Produits extra** : Enregistrement de produits hors BL
- **Récapitulatif** : Vue problèmes, audit complet
- **Sauvegarde** : Export/Import/Partage JSON
- **100% hors-ligne** : PWA installable, IndexedDB local
- **0€ de coût** : Pas de serveur, pas de base de données cloud

## Stack technique

- React 19 + TypeScript
- Vite 8
- Dexie (IndexedDB)
- @zxing/browser (scanner)
- vite-plugin-pwa (PWA/offline)
- CSS vanilla

## Commandes

```bash
# Installer les dépendances
npm install --legacy-peer-deps

# Lancer en développement
npm run dev

# Lancer les tests
npm test

# Build de production
npm run build

# Prévisualiser le build
npm run preview
```

## Déploiement GitHub Pages

1. Créer un dépôt GitHub et pousser le code
2. Dans **Settings → Pages** : choisir **GitHub Actions** comme source
3. Le workflow `.github/workflows/deploy.yml` déploie automatiquement à chaque push sur `main`

```bash
git init
git add .
git commit -m "Initial commit - POINTAGE v1.0"
git remote add origin https://github.com/VOTRE_USERNAME/pointage.git
git branch -M main
git push -u origin main
```

## Installation sur Samsung Galaxy A54

1. Ouvrir l'URL GitHub Pages dans Chrome Android
2. Chrome affichera une bannière "Installer POINTAGE" ou menu ⋮ → "Installer l'application"
3. L'app apparaît sur l'écran d'accueil
4. Fonctionne 100% hors-ligne après installation

## Import de BL

1. Photographier les pages du BL
2. Utiliser le bouton **COPIER PROMPT D'EXTRACTION** dans l'app
3. Coller le prompt dans ChatGPT/Gemini avec les photos
4. Copier le JSON généré
5. Coller dans l'écran **IMPORTER** de l'app
6. Vérifier et importer

### Format JSON accepté

```json
{
  "bills": [
    {
      "billNumber": "BL/OU126/03221",
      "client": "NOM DU CLIENT",
      "date": "2026-08-24",
      "lines": [
        {
          "no": "1",
          "page": 1,
          "reference": "25073",
          "ean": "6941782117149",
          "designation": "ETIQUETTE ECOLIER...",
          "quantity": 32,
          "packagesRaw": null
        }
      ]
    }
  ]
}
```

## Licence

Usage privé.
