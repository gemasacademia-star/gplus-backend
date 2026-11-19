import test from 'node:test';
import assert from 'node:assert/strict';

import { quitarTildes, buscarUsuarioPorUsername } from '../src/shared/utils/username.util.js';
import { authSchema } from '../src/features/auth/auth.schema.js';
import { registroLogic } from '../src/features/usuarios/logic/registro.logic.js';

// Simula prisma: findUnique exacto + $queryRaw que aplica el mismo translate que el SQL.
const dbFalsa = (usernames) => {
  const traducir = (u) => u.replace(/[áéíóúüñ]/g, (c) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' })[c]);
  return {
    usuarios: {
      findUnique: async ({ where }) => (usernames.includes(where.username) ? { username: where.username } : null),
    },
    $queryRaw: async (_strings, valor) =>
      usernames.filter((u) => traducir(u) === valor).slice(0, 2).map((username) => ({ username })),
  };
};

test('quitarTildes quita tildes, diéresis y la ñ', () => {
  assert.equal(quitarTildes('katherine.sánchez1127'), 'katherine.sanchez1127');
  assert.equal(quitarTildes('iñaki.güemes7'), 'inaki.guemes7');
  assert.equal(quitarTildes('á'), 'a'); // "á" descompuesta
  assert.equal(quitarTildes('luis.garcia1192'), 'luis.garcia1192');
});

test('buscarUsuarioPorUsername: coincidencia exacta tiene prioridad', async () => {
  const db = dbFalsa(['katherine.sánchez1127']);
  assert.deepEqual(await buscarUsuarioPorUsername(db, 'katherine.sánchez1127', {}), {
    username: 'katherine.sánchez1127',
  });
});

test('buscarUsuarioPorUsername: sin tilde ni ñ encuentra el username con tilde', async () => {
  const db = dbFalsa(['katherine.sánchez1127', 'jose.muñoz40']);
  assert.equal((await buscarUsuarioPorUsername(db, 'katherine.sanchez1127', {})).username, 'katherine.sánchez1127');
  assert.equal((await buscarUsuarioPorUsername(db, 'jose.munoz40', {})).username, 'jose.muñoz40');
  // también con la tilde mal puesta
  assert.equal((await buscarUsuarioPorUsername(db, 'katherine.sanchéz1127', {})).username, 'katherine.sánchez1127');
});

test('buscarUsuarioPorUsername: si sin tildes coincide con dos usuarios no elige ninguno', async () => {
  const db = dbFalsa(['ana.peña3', 'ána.pena3']);
  assert.equal(await buscarUsuarioPorUsername(db, 'ana.pena3', {}), null);
});

test('buscarUsuarioPorUsername: inexistente devuelve null', async () => {
  assert.equal(await buscarUsuarioPorUsername(dbFalsa(['a.b1']), 'x.y2', {}), null);
});

test('loginSchema y forgotPasswordSchema normalizan a NFC', () => {
  const descompuesto = 'Katherine.Sánchez1127 ';
  const login = authSchema.loginSchema.parse({ username: descompuesto, password: 'x' });
  assert.equal(login.username, 'katherine.sánchez1127');
  assert.equal(login.username, login.username.normalize('NFC'));
  assert.equal(authSchema.forgotPasswordSchema.parse({ username: descompuesto }).username, 'katherine.sánchez1127');
});

test('loginSchema sigue rechazando caracteres no permitidos', () => {
  assert.throws(() => authSchema.loginSchema.parse({ username: 'juan perez', password: 'x' }));
});

test('generarFallbackUsername ya no genera tildes ni ñ', () => {
  assert.equal(registroLogic.generarFallbackUsername('Katherine', 'Sánchez Correa', 1127), 'katherine.sanchez1127');
  assert.equal(registroLogic.generarFallbackUsername('Iñaki José', 'Muñoz', 5), 'inaki.munoz5');
  assert.match(registroLogic.generarFallbackUsername('Ángel', 'Núñez', 9), /^[a-z0-9._]+$/);
});
