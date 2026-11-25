# Kalos Business — version GitHub Pages

Application web **statique** : aucun serveur Django, aucun hébergeur payant.
Le code s'exécute directement dans le navigateur et les données sont conservées dans le `localStorage`.

## Fonctionnalités

- Boutique : recherche, filtres par catégorie, tri, pagination, fiches produits.
- Panier quantity, code promo, frais de livraison, récapitulatif.
- Commande et paiement simulé : carte (validation Luhn), PayPal, paiement à la livraison.
- Récapitulatif de commande avec référence et transaction.
- Création de compte et connexion (comptes locaux au navigateur).
- Espace client : « Mes commandes ».
- Messagerie : formulaire de contact et conversation.
- Tableau de bord admin : statistiques, commandes, messages, stock et paramètres.

## Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Admin | `admin` | `KalosAdmin2026!` |
| Client | `demo` | `Kalos2026!` |

## ⚠️ Important

Les comptes, commandes, messages et réglages sont enregistrés **dans chaque navigateur**, pas sur un serveur central. Deux visiteurs ne partagent donc pas les mêmes données. Les mots de passe sont stockés en clair dans le `localStorage` : **ne saisissez jamais vos vrais mots de passe**. Cette version est une démonstration/vitrine.

## Publier sur GitHub Pages

1. Créez un dépôt public, par exemple `kalos-business`.
2. Copiez tout le contenu de ce dossier dans le dépôt.
3. Dans le dépôt : **Settings → Pages → Build and deployment**.
   - Source : **Deploy from a branch**
   - Branch : `main` / `/ (root)`
4. Enregistrez. L'application sera disponible sur :
   `https://VOTRE_COMPTE.github.io/kalos-business/`

## Régénérer les produits

Les données viennent de `assets/data.json`, exporté depuis la base Django avec :

```powershell
python ..\exporter_donnees_statiques.py
```

Puis recommitez le fichier mis à jour.
