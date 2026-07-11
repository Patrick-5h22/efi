// Groupes Entra ID : restriction d'accès et attribution des rôles.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAllowedGroups, parseGroupRoles, isAllowed, roleFromGroups } from '../api/_groups.js';

const G_GEST = '11111111-aaaa-4bbb-8ccc-000000000001';
const G_ASSIST = '11111111-aaaa-4bbb-8ccc-000000000002';
const G_COMM = '11111111-aaaa-4bbb-8ccc-000000000003';

test('parse : listes et mappings, entrées invalides ignorées', () => {
  assert.deepEqual(parseAllowedGroups(` ${G_GEST} , ${G_COMM} `), [G_GEST, G_COMM]);
  assert.deepEqual(parseAllowedGroups(''), []);
  assert.deepEqual(parseAllowedGroups(undefined), []);
  assert.deepEqual(parseGroupRoles(`${G_GEST}:gestionnaire, ${G_COMM} : commercial`),
    { [G_GEST]: 'gestionnaire', [G_COMM]: 'commercial' });
  assert.deepEqual(parseGroupRoles(`${G_GEST}:inconnu,malformé`), {}, 'rôle inconnu et paire malformée ignorés');
});

test('accès : sans restriction tout le monde passe, avec restriction il faut un groupe', () => {
  assert.equal(isAllowed([], []), true);
  assert.equal(isAllowed(undefined, []), true);
  assert.equal(isAllowed([G_COMM], [G_GEST, G_COMM]), true);
  assert.equal(isAllowed([G_ASSIST], [G_GEST]), false);
  assert.equal(isAllowed([], [G_GEST]), false);
  assert.equal(isAllowed(undefined, [G_GEST]), false);
});

test('rôles : le plus élevé l’emporte, aucun groupe mappé → null (rôle conservé)', () => {
  const map = parseGroupRoles(`${G_GEST}:gestionnaire,${G_ASSIST}:assistante,${G_COMM}:commercial`);
  assert.equal(roleFromGroups([G_COMM], map), 'commercial');
  assert.equal(roleFromGroups([G_COMM, G_GEST], map), 'gestionnaire', 'gestionnaire > commercial');
  assert.equal(roleFromGroups([G_ASSIST, G_COMM], map), 'assistante', 'assistante > commercial');
  assert.equal(roleFromGroups(['autre-groupe'], map), null);
  assert.equal(roleFromGroups([], map), null);
});
