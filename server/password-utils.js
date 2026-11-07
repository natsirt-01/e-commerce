export function isStrongPassword(password) {
  return typeof password === 'string' &&
    password.length >= 10 &&
    /[^A-Za-z0-9]/.test(password)
}
