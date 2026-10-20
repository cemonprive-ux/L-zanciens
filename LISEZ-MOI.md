# Anciens de Louis · Comptes

Site des comptes des séjours (2012 à aujourd'hui), publié sur GitHub Pages. Les séjours de 2026 et suivants se lisent et se modifient depuis le site : toute personne qui a le lien peut ajouter ou supprimer une dépense, et tous les soldes se recalculent aussitôt. Les données vivent dans un Google Sheet, qui reste le fichier de référence (téléchargeable en Excel à tout moment).

```
index.html                       le site (séjours 2012-2025 inclus)
manifest.webmanifest, *.png      icône de l'appli (écran d'accueil du smartphone)
sw.js                            reçoit et affiche les notifications (à déposer à la racine)
worker/worker.js                 serveur de notifications (à coller dans Cloudflare)
outils/generer-cles-vapid.html   outil local pour créer les clés des notifications
Comptes_Anciens_de_Louis.xlsx    classeur à importer dans Google Sheets
apps-script/Code.gs              script qui relie le site au Google Sheet
```

## Mise en place (environ 15 minutes)

### 1. Créer le Google Sheet
1. Ouvrez Google Drive, puis **Nouveau > Importer un fichier** et choisissez `Comptes_Anciens_de_Louis.xlsx`.
2. Ouvrez le fichier importé, puis **Fichier > Enregistrer en tant que feuille Google Sheets**.
3. Vérifiez l'onglet **Participants** : les colonnes F à J (avance, coût total, nombre de participants, part, solde) doivent afficher des montants, par exemple +1 027,52 € pour Maxens en 2026.

### 2. Installer le script
1. Dans le Google Sheet : **Extensions > Apps Script**.
2. Supprimez le code présent, collez le contenu de `apps-script/Code.gs`, puis cliquez sur **Enregistrer**.
3. **Paramètres du projet (roue dentée) > Propriétés du script > Ajouter une propriété** : nom `SITE_PASSWORD`, valeur le mot de passe du site (le même que celui dont l'empreinte figure dans `index.html`). Sans cette propriété, le script refuse tous les accès.
4. **Déployer > Nouveau déploiement > Type : Application Web**.
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
5. Cliquez sur **Déployer**, acceptez les autorisations demandées, puis copiez l'**URL de l'application Web** (elle se termine par `/exec`).

Si Google affiche « Application non validée », cliquez sur **Paramètres avancés > Accéder à (nom du projet)**. C'est normal pour un script personnel.

### 3. Publier le site sur GitHub
1. Créez un dépôt public sur GitHub (par exemple `anciens-de-louis`).
2. Ouvrez `index.html` dans un éditeur de texte et remplacez la ligne
   `const API_URL = '';`
   par
   `const API_URL = 'https://script.google.com/macros/s/.../exec';`
   (l'adresse copiée à l'étape 2).
3. Déposez `index.html` et les quatre images `.png` ainsi que `manifest.webmanifest` à la racine du dépôt (**Add file > Upload files**), puis validez.
4. **Settings > Pages > Source : Deploy from a branch > main / (root) > Save**.
5. Après une minute, le site est en ligne à l'adresse `https://<votre-compte>.github.io/anciens-de-louis/`.

Le bandeau du site affiche « À jour · HH:MM » quand la liaison fonctionne. Sans adresse dans `API_URL`, le site s'ouvre en démonstration et n'enregistre rien.

## Icône sur l'écran d'accueil
- **iPhone (Safari)** : ouvrir le site, bouton Partager, **Sur l'écran d'accueil**.
- **Android (Chrome)** : menu ⋮, **Installer l'application** ou **Ajouter à l'écran d'accueil**.
- Déposer à la racine du dépôt, avec `index.html`, les fichiers `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `favicon-32.png` et `manifest.webmanifest`.

## Notifications (Web Push, serveur Cloudflare)

À chaque dépense ajoutée, tous les appareils abonnés reçoivent : **Prénom** · « vient de rentrer une dépense dans la catégorie Nourriture ». Le prénom est celui choisi sur l'appareil à la première ouverture (« Qui êtes-vous ? »), modifiable dans la carte « Cet appareil » en bas de chaque écran. Aucun service extérieur : le standard Web Push est utilisé directement par un Worker Cloudflare qui vous appartient. Tout se fait dans un navigateur, sans terminal.

**1. Créer les clés (une seule fois)**
Ouvrez `outils/generer-cles-vapid.html` dans un navigateur et touchez **Générer les clés**. Notez les trois valeurs : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `NOTIFY_SECRET`. Elles sont créées dans votre navigateur et ne sont envoyées nulle part. Ne publiez jamais la clé privée ni le code secret.

**2. Créer le Worker**
1. Sur dash.cloudflare.com : **Workers & Pages > Create > Create Worker**, nommez-le (par exemple `anciens-notifs`), puis **Deploy**.
2. **Edit code**, remplacez tout le contenu par celui de `worker/worker.js`, puis **Deploy**.
3. **Storage & Databases > KV > Create** : créez un espace nommé `anciens-abonnes`.
4. Dans le Worker : **Settings > Bindings > Add > KV namespace** : nom de variable `SUBS`, espace `anciens-abonnes`.
5. **Settings > Variables and Secrets** : ajoutez
   - `VAPID_PUBLIC_KEY` (texte) : la clé publique
   - `VAPID_PRIVATE_KEY` (secret) : la clé privée
   - `NOTIFY_SECRET` (secret) : le code secret
   - `SITE_PASSWORD` (secret) : le mot de passe du site
   - `VAPID_SUBJECT` (texte) : `mailto:` suivi de votre adresse e-mail
   - `ALLOWED_ORIGIN` (texte) : `https://cemonprive-ux.github.io`
   - `SITE_URL` (texte) : `https://cemonprive-ux.github.io/L-zanciens/`
6. Notez l'adresse du Worker (du type `https://anciens-notifs.votre-compte.workers.dev`). Ouvrez-la dans un navigateur : elle doit afficher `{"ok":true,...}`.

**3. Relier le site et le script Google**
- Dans `index.html`, renseignez `const PUSH_URL = 'adresse du Worker';` et `const VAPID_PUBLIC_KEY = 'la clé publique';`. Déposez `index.html` et `sw.js` à la racine du dépôt.
- Dans Apps Script : **Paramètres du projet > Propriétés du script**, ajoutez `PUSH_URL` (adresse du Worker) et `PUSH_SECRET` (le même code secret que `NOTIFY_SECRET`). Collez le nouveau `Code.gs`, puis **Déployer > Gérer les déploiements > Modifier > Nouvelle version** et acceptez l'autorisation supplémentaire (appels vers un service externe).

**Activation sur les appareils**
- À la première connexion, le navigateur demande l'autorisation d'envoyer des notifications, juste après le mot de passe. Un bandeau « Activer les notifications » reste affiché tant que la question n'est pas réglée.
- **iPhone** : les notifications web ne fonctionnent que si l'appli est installée sur l'écran d'accueil (Partager > Sur l'écran d'accueil), puis ouverte depuis son icône (iOS 16.4 ou plus récent).
- **Android et ordinateur** : Chrome, Edge et Firefox fonctionnent directement.
- Aucun site ne peut activer les notifications à la place de la personne : chaque appareil doit accepter une fois. La carte « Cet appareil » permet de les désactiver ou de les réactiver.
- Si l'envoi échoue, l'ajout de la dépense n'est pas affecté, et l'erreur est notée dans l'onglet Journal. Les appareils qui ne répondent plus (appli désinstallée) sont retirés automatiquement.
- Le forfait gratuit de Cloudflare (Workers et KV) suffit largement pour un groupe de cette taille.

## Utilisation au quotidien

- **Ajouter une dépense** : onglet Dépenses (ou Synthèse, Soldes, Trajets) de l'année concernée, bouton jaune **+ Dépense**. Choisir la catégorie, le libellé, le montant et le payeur. « Compte des Anciens » signifie payé avec la caisse commune : le coût augmente, personne n'est remboursé.
- **Ajouter un trajet** : même bouton, catégorie **Transport**, payeur = la personne qui a roulé.
- **Modifier une dépense** : onglet Dépenses, bouton **Modifier** sur la ligne. On peut changer la catégorie, le libellé, le montant et le payeur ; les soldes se recalculent aussitôt. Chaque modification est notée dans l'onglet Journal (valeurs avant et après).
- **Supprimer une dépense** : bouton **Supprimer** sur la ligne, à toucher deux fois pour confirmer.
- **Qui partage le coût ?** : onglet Soldes, en bas. Décocher une personne l'exclut du partage (par exemple une absente) ; ses éventuelles avances lui sont alors remboursées.
- **Clôturer un solde** : onglet Soldes, ouvrir la ligne d'une personne. Si elle reçoit, la case « Virement effectué » se coche une fois l'argent viré ; si elle doit verser, la case « Virement reçu » se coche une fois l'argent reçu. La date du jour s'affiche et un voyant vert « Compte bon » apparaît à côté du prénom. Si une dépense modifie ensuite le solde, la case se décoche et signale que le solde a changé. Les dates sont gardées dans les colonnes `regle_le` et `regle_montant` de l'onglet Participants (créées automatiquement si absentes).
- **Cotisations versées** : à modifier directement dans le Google Sheet, onglet Participants, colonne `verse`.
- **Soldes** : calculés par le site et par le Google Sheet avec la même règle : solde = versé + dépenses avancées − (coût total ÷ nombre de participants). Positif : la personne reçoit. Négatif : elle doit verser.
- **Copie Excel** : dans le Google Sheet, **Fichier > Télécharger > Microsoft Excel (.xlsx)**.

## Ouvrir un nouveau séjour (par exemple 2028)
1. Onglet **Editions** : ajoutez une ligne (`id` sans espace ni accent, par exemple `2028-nantes`, puis l'année et le lieu).
2. Onglet **Participants** : copiez les lignes d'un séjour précédent, remplacez `edition` par le nouvel `id`, et mettez `participe` à 1 ou 0 et `verse` au montant des cotisations. Recopiez aussi les formules des colonnes F à J si la ligne est au-delà de la ligne 300.
3. Le site affiche le nouveau séjour dans la minute.

## À savoir
- **Mot de passe** : le site s'ouvre sur un écran d'entrée (mot de passe convenu entre vous, majuscules sans importance), mémorisé ensuite sur l'appareil. Le script Google vérifie le même mot de passe, enregistré dans la propriété de script `SITE_PASSWORD` (Apps Script > Paramètres du projet > Propriétés du script ; sans elle, tout accès est refusé) : sans lui, personne ne peut lire ni modifier les dépenses de 2026 et suivantes. Pour le changer : modifier `SITE_PASSWORD` (script Google et Worker Cloudflare) et le hash `PW_HASH` dans `index.html` (empreinte SHA-256 du mot de passe en minuscules), ou me demander un nouveau fichier. Le dépôt étant public, l'empreinte est lisible : choisissez un mot de passe long. Limite : les séjours 2012-2025 sont inclus dans `index.html` d'un dépôt public, un écran de mot de passe ne les cache pas à quelqu'un qui lit le code source.
- **Accès** : toute personne qui a l'adresse du site et le mot de passe peut modifier les dépenses. Le script refuse les saisies invalides et limite le nombre d'écritures (60 par tranche de 5 minutes pour tout le monde).
- **Retour en arrière** : l'onglet **Journal** garde la trace de chaque ajout, suppression ou changement de participation. **Fichier > Historique des versions** du Google Sheet permet de restaurer une version précédente.
- **Confidentialité** : un dépôt public et un site GitHub Pages rendent visibles les prénoms et les montants. N'y mettez rien de plus sensible.
- **Séjours 2012 à 2025** : ils sont figés dans `index.html`. Pour les corriger, il faut régénérer le fichier à partir du classeur d'origine.
- **Modifier le Google Sheet à la main** reste possible : les onglets Editions, Depenses et Participants sont relus par le site toutes les 30 secondes. Ne renommez pas les en-têtes de colonnes de la ligne 1.
- **Si vous modifiez `Code.gs`** : **Déployer > Gérer les déploiements > Modifier > Nouvelle version**, pour garder la même adresse.
