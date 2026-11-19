/**
 * G-14: usernames con tildes / ñ.
 *
 * Los usernames viejos se generaron con tildes ("katherine.sánchez1127") y el
 * login/recuperación buscaban por coincidencia exacta, así que quien lo escribía
 * sin tilde quedaba fuera. No se renombra a nadie: si no hay coincidencia exacta
 * se busca ignorando tildes y ñ, y solo se acepta si hay UN único candidato.
 */

/** Quita tildes, diéresis y la virgulilla de la ñ: "sánchez" -> "sanchez", "ñ" -> "n". */
export const quitarTildes = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Busca un usuario por username: primero exacto y, si no hay, ignorando tildes y ñ.
 * Devuelve null si no existe o si sin tildes coincide con más de un usuario.
 *
 * @param {import('@prisma/client').PrismaClient} db prisma o una transacción
 * @param {string} username tal como lo escribió el usuario (ya trim/lowercase/NFC)
 * @param {object} select el mismo `select` de prisma que usaría el llamador
 */
export const buscarUsuarioPorUsername = async (db, username, select) => {
  const exacto = await db.usuarios.findUnique({ where: { username }, select });
  if (exacto) return exacto;

  const sinTildes = quitarTildes(username);
  // Los usernames guardados están en NFC y en minúsculas, así que basta con traducir
  // las vocales con tilde y la ñ que genera generarFallbackUsername.
  const candidatos = await db.$queryRaw`
    SELECT username FROM usuarios
    WHERE translate(username, 'áéíóúüñ', 'aeiouun') = ${sinTildes}
    LIMIT 2`;
  if (candidatos.length !== 1) return null;

  return db.usuarios.findUnique({ where: { username: candidatos[0].username }, select });
};
