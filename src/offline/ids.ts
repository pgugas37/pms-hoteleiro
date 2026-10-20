/** Etiqueta única criada no próprio aparelho (vira o id do registro no banco). */
export function newId(): string {
  return crypto.randomUUID()
}
