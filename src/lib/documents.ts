function calcCheckDigit(nums: number[], weights: number[]): number {
  const sum = nums.reduce((acc, digit, index) => acc + digit * weights[index], 0)
  const remainder = sum % 11
  return remainder < 2 ? 0 : 11 - remainder
}

/** Valida um CPF pelo algoritmo oficial dos dígitos verificadores (não só a quantidade de dígitos). */
export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false // sequências tipo 111.111.111-11

  const nums = digits.split('').map(Number)
  const digit1 = calcCheckDigit(nums.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const digit2 = calcCheckDigit([...nums.slice(0, 9), digit1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])

  return nums[9] === digit1 && nums[10] === digit2
}

/** Valida um CNPJ pelo algoritmo oficial dos dígitos verificadores (não só a quantidade de dígitos). */
export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 14) return false
  if (/^(\d)\1{13}$/.test(digits)) return false

  const nums = digits.split('').map(Number)
  const digit1 = calcCheckDigit(nums.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const digit2 = calcCheckDigit([...nums.slice(0, 12), digit1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return nums[12] === digit1 && nums[13] === digit2
}
