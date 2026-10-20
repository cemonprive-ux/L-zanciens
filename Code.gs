/**
 * Anciens de Louis · API du site (Google Apps Script)
 * À coller dans Extensions > Apps Script du Google Sheet, puis Déployer > Application Web
 * (Exécuter en tant que : moi · Accès : tout le monde).
 *
 * Lecture :  GET  <url>/exec?action=all&pwd=...
 * Écriture : POST <url>/exec  (corps JSON en text/plain)
 *   {"action":"addExpense","edition":"2026-clermont-ferrand","categorie":"Nourriture","libelle":"Pain","montant":12.5,"paye_par":"Fred"}
 *   {"action":"updateExpense","id":"...","categorie":"Nourriture","libelle":"Pain","montant":13,"paye_par":"Fred"}
 *   {"action":"setSettled","edition":"...","nom":"Fred","regle":true,"montant":128.58}
 *   {"action":"deleteExpense","id":"..."}
 *   {"action":"setParticipation","edition":"...","nom":"Vince","participe":true}
 */
var SHEET_EXP = 'Depenses';
var SHEET_PAR = 'Participants';
var SHEET_ED = 'Editions';
var SHEET_LOG = 'Journal';
var CATEGORIES = ['Nourriture', 'Transport', 'Activités', 'Location'];
var COMPTE = 'Compte des Anciens';
var MAX_WRITES_PER_WINDOW = 60;      // garde-fou contre les abus : écritures max par fenêtre
var WINDOW_SECONDS = 300;            // fenêtre de 5 minutes
var MAX_AMOUNT = 100000;

/* Mot de passe du site : propriété du script SITE_PASSWORD (Paramètres du projet > Propriétés du script).
 * Il n'est volontairement pas écrit dans le code, car ce fichier est publié sur GitHub. Sans cette propriété, tout accès est refusé. */
function pwdOk_(v) {
  var p = PropertiesService.getScriptProperties().getProperty('SITE_PASSWORD');
  return !!p && String(v || '').trim().toLowerCase() === String(p).trim().toLowerCase();
}
function denied_() { return ContentService.createTextOutput(JSON.stringify({ ok: false, auth: true, error: 'Mot de passe incorrect.' })).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) {
  if (!pwdOk_(e && e.parameter && e.parameter.pwd)) return denied_();
  return json_({ ok: true, data: readAll_() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'Serveur occupé, réessayez dans un instant.' });
  }
  try {
    var body = JSON.parse(e.postData.contents);
    if (!pwdOk_(body.pwd)) return denied_();
    checkRate_();
    var data = readAll_();
    var action = body.action;
    if (action === 'addExpense') addExpense_(body, data);
    else if (action === 'setSettled') setSettled_(body);
    else if (action === 'updateExpense') updateExpense_(body, data);
    else if (action === 'deleteExpense') deleteExpense_(body);
    else if (action === 'setParticipation') setParticipation_(body, data);
    else throw new Error('Action inconnue.');
    SpreadsheetApp.flush();
    return json_({ ok: true, data: readAll_() });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Lecture ---------- */
function table_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Onglet manquant : ' + name);
  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var o = {};
    for (var j = 0; j < head.length; j++) { if (head[j]) o[head[j]] = values[i][j]; }
    o._row = i + 1;
    rows.push(o);
  }
  return rows;
}
function day_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Paris', 'yyyy-MM-dd');
  return str_(v);
}
function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }

function readAll_() {
  var editions = table_(SHEET_ED).filter(function (r) { return str_(r.id); }).map(function (r) {
    return { id: str_(r.id), annee: num_(r.annee), lieu: str_(r.lieu) };
  });
  var expenses = table_(SHEET_EXP).filter(function (r) { return str_(r.id) && str_(r.edition); }).map(function (r) {
    return { id: str_(r.id), edition: str_(r.edition), categorie: str_(r.categorie), libelle: str_(r.libelle),
             montant: num_(r.montant), paye_par: str_(r.paye_par) };
  });
  var participants = table_(SHEET_PAR).filter(function (r) { return str_(r.edition) && str_(r.nom); }).map(function (r) {
    var rm = str_(r.regle_montant);
    return { edition: str_(r.edition), nom: str_(r.nom), verse: num_(r.verse),
             participe: num_(r.participe) === 1, detail: str_(r.detail),
             regle_le: day_(r.regle_le), regle_montant: rm === '' ? null : num_(r.regle_montant) };
  });
  return { editions: editions, expenses: expenses, participants: participants, updated: new Date().toISOString() };
}

/* ---------- Écriture ---------- */
function addExpense_(b, data) {
  var edition = str_(b.edition);
  if (!data.editions.some(function (x) { return x.id === edition; })) throw new Error('Séjour inconnu.');
  var cat = str_(b.categorie);
  if (CATEGORIES.indexOf(cat) < 0) throw new Error('Catégorie invalide.');
  var label = str_(b.libelle).replace(/^[=+\-@\s]+/, '').substring(0, 80);
  if (!label) throw new Error('Libellé manquant.');
  var amount = Math.round(Number(b.montant) * 100) / 100;
  if (!(amount > 0) || amount > MAX_AMOUNT) throw new Error('Montant invalide.');
  var payer = str_(b.paye_par);
  var known = data.participants.some(function (p) { return p.edition === edition && p.nom === payer; });
  if (payer !== COMPTE && !known) throw new Error('Payeur inconnu pour ce séjour.');
  var id = 'e' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  SpreadsheetApp.getActive().getSheetByName(SHEET_EXP).appendRow([id, edition, cat, label, amount, payer, new Date()]);
  log_('Ajout', edition + ' · ' + cat + ' · ' + label + ' · ' + amount + ' € · ' + payer);
  var who = str_(b.auteur).substring(0, 30);
  var isKnown = data.participants.some(function (p) { return p.nom === who; });
  notify_(isKnown ? who : 'Quelqu’un', cat);
}

function updateExpense_(b, data) {
  var id = str_(b.id);
  if (!id) throw new Error('Identifiant manquant.');
  var cat = str_(b.categorie);
  if (CATEGORIES.indexOf(cat) < 0) throw new Error('Catégorie invalide.');
  var label = str_(b.libelle).replace(/^[=+\-@\s]+/, '').substring(0, 80);
  if (!label) throw new Error('Libellé manquant.');
  var amount = Math.round(Number(b.montant) * 100) / 100;
  if (!(amount > 0) || amount > MAX_AMOUNT) throw new Error('Montant invalide.');
  var payer = str_(b.paye_par);
  var rows = table_(SHEET_EXP);
  for (var i = 0; i < rows.length; i++) {
    if (str_(rows[i].id) !== id) continue;
    var edition = str_(rows[i].edition);
    var known = data.participants.some(function (p) { return p.edition === edition && p.nom === payer; });
    if (payer !== COMPTE && !known) throw new Error('Payeur inconnu pour ce séjour.');
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_EXP);
    var head = sh.getDataRange().getValues()[0].map(function (h) { return String(h).trim(); });
    var set = function (col, v) { sh.getRange(rows[i]._row, head.indexOf(col) + 1).setValue(v); };
    set('categorie', cat); set('libelle', label); set('montant', amount); set('paye_par', payer);
    log_('Modification', edition + ' · avant : ' + rows[i].categorie + ' · ' + rows[i].libelle + ' · ' + rows[i].montant + ' € · ' + rows[i].paye_par +
         ' → après : ' + cat + ' · ' + label + ' · ' + amount + ' € · ' + payer);
    return;
  }
  throw new Error('Dépense introuvable (déjà supprimée ?).');
}

/* Virement effectué (le solde est positif) ou reçu (le solde est négatif) : date du jour et montant réglé. */
function setSettled_(b) {
  var edition = str_(b.edition), nom = str_(b.nom), want = b.regle === true;
  var montant = Math.round(Number(b.montant) * 100) / 100;
  if (want && !isFinite(montant)) throw new Error('Montant invalide.');
  var rows = table_(SHEET_PAR);
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PAR);
  var head = sh.getDataRange().getValues()[0].map(function (h) { return String(h).trim(); });
  ['regle_le', 'regle_montant'].forEach(function (c) {
    if (head.indexOf(c) < 0) { sh.getRange(1, head.length + 1).setValue(c); head.push(c); }
  });
  for (var i = 0; i < rows.length; i++) {
    if (str_(rows[i].edition) === edition && str_(rows[i].nom) === nom) {
      var cDate = sh.getRange(rows[i]._row, head.indexOf('regle_le') + 1);
      var cAmt = sh.getRange(rows[i]._row, head.indexOf('regle_montant') + 1);
      cDate.setNumberFormat('@');
      if (want) {
        cDate.setValue(Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd'));
        cAmt.setValue(montant);
      } else {
        cDate.setValue(''); cAmt.setValue('');
      }
      log_(want ? (montant > 0 ? 'Virement effectué' : 'Virement reçu') : 'Virement décoché', edition + ' · ' + nom + (want ? ' · ' + montant + ' €' : ''));
      return;
    }
  }
  throw new Error('Participant inconnu.');
}

function deleteExpense_(b) {
  var id = str_(b.id);
  if (!id) throw new Error('Identifiant manquant.');
  var rows = table_(SHEET_EXP);
  for (var i = 0; i < rows.length; i++) {
    if (str_(rows[i].id) === id) {
      SpreadsheetApp.getActive().getSheetByName(SHEET_EXP).deleteRow(rows[i]._row);
      log_('Suppression', rows[i].edition + ' · ' + rows[i].categorie + ' · ' + rows[i].libelle + ' · ' + rows[i].montant + ' € · ' + rows[i].paye_par);
      return;
    }
  }
  throw new Error('Dépense introuvable (déjà supprimée ?).');
}

function setParticipation_(b, data) {
  var edition = str_(b.edition), nom = str_(b.nom);
  var rows = table_(SHEET_PAR);
  for (var i = 0; i < rows.length; i++) {
    if (str_(rows[i].edition) === edition && str_(rows[i].nom) === nom) {
      var wantOn = b.participe === true || b.participe === 1;
      if (!wantOn) {
        var others = rows.filter(function (r) { return str_(r.edition) === edition && num_(r.participe) === 1 && str_(r.nom) !== nom; });
        if (!others.length) throw new Error('Au moins une personne doit partager le coût.');
      }
      var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PAR);
      var head = sh.getDataRange().getValues()[0].map(function (h) { return String(h).trim(); });
      sh.getRange(rows[i]._row, head.indexOf('participe') + 1).setValue(wantOn ? 1 : 0);
      log_('Participation', edition + ' · ' + nom + ' · ' + (wantOn ? 'partage le coût' : 'ne partage pas'));
      return;
    }
  }
  throw new Error('Participant inconnu.');
}

/* ---------- Notifications (Web Push via votre Worker Cloudflare) ----------
 * Propriétés du script (Paramètres du projet > Propriétés du script) :
 *   PUSH_URL     adresse du Worker Cloudflare, par exemple https://anciens-notifs.votre-compte.workers.dev
 *   PUSH_SECRET  code secret partagé avec le Worker (même valeur que son secret NOTIFY_SECRET)
 * Sans ces propriétés, aucune notification n'est envoyée et l'ajout de dépense fonctionne normalement. */
function notify_(auteur, categorie) {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty('PUSH_URL'), secret = props.getProperty('PUSH_SECRET');
    if (!url || !secret) return;
    var res = UrlFetchApp.fetch(url.replace(/\/+$/, '') + '/notify', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify({ auteur: auteur, categorie: categorie }), muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 300) log_('Notification', 'Échec ' + res.getResponseCode() + ' · ' + String(res.getContentText()).substring(0, 200));
  } catch (err) {
    log_('Notification', 'Erreur : ' + String(err && err.message ? err.message : err));
  }
}

/* ---------- Outils ---------- */
function checkRate_() {
  var cache = CacheService.getScriptCache();
  var key = 'writes';
  var n = Number(cache.get(key) || 0);
  if (n >= MAX_WRITES_PER_WINDOW) throw new Error('Trop de modifications en peu de temps. Réessayez dans quelques minutes.');
  cache.put(key, String(n + 1), WINDOW_SECONDS);
}
function log_(action, detail) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LOG);
  if (sh) sh.appendRow([new Date(), action, detail]);
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
