import { lancerNavigateur, BASE } from './_harness.mjs';
const b = await lancerNavigateur();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('dialog', d => d.accept());
let ok = 0, ko = 0;
const c = (l, v, x = '') => { v ? ok++ : ko++; console.log(`${v ? '✓' : '✗'} ${l}${x ? ' — ' + x : ''}`); };

await p.goto(BASE + '/');
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(900);

// La charge utile envoyée à la base contient bien la présence
const payload = await p.evaluate(async () => {
  const { pickPersisted, PERSISTED_FIELDS } = await import('/js/persisted.js');
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  st.dayPresence = { '2026-09-02': ['p1'] };
  return { champs: PERSISTED_FIELDS, envoye: Object.keys(pickPersisted(st)), presence: pickPersisted(st).dayPresence };
});
c('dayPresence dans la liste des champs persistés', payload.champs.includes('dayPresence'));
c('dayPresence dans la charge utile envoyée', payload.envoye.includes('dayPresence'));
c('valeur transmise intacte', JSON.stringify(payload.presence) === '{"2026-09-02":["p1"]}', JSON.stringify(payload.presence));
c('aucun dérivé transmis', !payload.envoye.includes('nextId') && !payload.envoye.includes('schedule'), payload.envoye.join(','));

// Décocher une présence sur la page Jours EFI, puis simuler un rechargement
// depuis la base : la case doit rester décochée.
await p.goto(BASE + '/#/jours'); await p.waitForTimeout(700);
const boxes = p.locator('#main input[type=checkbox]');
const n = await boxes.count();
c('page Jours EFI chargée', n > 0, `${n} cases`);

const avant = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('efi-planning-v1')).dayPresence || {}).length);
// on décoche la première case de présence trouvée
for (let i = 0; i < n; i++) {
  const bx = boxes.nth(i);
  if (await bx.isChecked()) { await bx.uncheck(); break; }
}
await p.waitForTimeout(700);
const apres = await p.evaluate(() => JSON.parse(localStorage.getItem('efi-planning-v1')).dayPresence || {});
c('la présence est enregistrée localement', Object.keys(apres).length > avant, JSON.stringify(apres).slice(0, 80));

// Aller-retour base : ce qui part = ce qui revient
const rt = await p.evaluate(async () => {
  const { pickPersisted } = await import('/js/persisted.js');
  const { migrate } = await import('/js/store.js');
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  const recharge = migrate(structuredClone(pickPersisted(st)));
  return { avant: st.dayPresence, apres: recharge.dayPresence };
});
c('présence identique après aller-retour base', JSON.stringify(rt.avant) === JSON.stringify(rt.apres),
  `${JSON.stringify(rt.avant).slice(0,50)} → ${JSON.stringify(rt.apres).slice(0,50)}`);

c('aucune erreur JS', errs.length === 0, errs.join(' ; '));
console.log(`\n${ok}/${ok + ko} OK`);
await b.close(); process.exit(ko ? 1 : 0);
