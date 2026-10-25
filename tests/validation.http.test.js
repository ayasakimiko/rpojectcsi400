import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import loginRouter from '../router/LoginRouter.js'
import forgotPasswordRouter from '../router/ForgotPasswordRouter.js'
import { MESSAGES } from '../src/utils/validators.js'

let server
let baseUrl

before(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', loginRouter)
  app.use('/api/auth', forgotPasswordRouter)
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(() => new Promise((resolve) => server.close(resolve)))

const post = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

test('login rejects missing credentials with 400', async () => {
  const { status, body } = await post('/api/auth/login', {})
  assert.equal(status, 400)
  assert.equal(body.message, 'รูปแบบข้อมูลไม่ถูกต้อง')
})

test('login rejects a non-numeric username with 400', async () => {
  const { status, body } = await post('/api/auth/login', { username: 'admin', password: 'secret1' })
  assert.equal(status, 400)
  assert.match(body.message, /ถูกต้อง/)
})

test('login rejects an unknown role with 400 before touching the database', async () => {
  const { status, body } = await post('/api/auth/login', { username: '1100200000001', password: 'secret1', role: 'Root' })
  assert.equal(status, 400)
  assert.equal(body.message, 'สิทธิ์ผู้ใช้งานไม่ถูกต้อง')
})

test('forgot-password lookup rejects a short idcard', async () => {
  const { status, body } = await post('/api/auth/forgot-password/lookup', { idcard: '123' })
  assert.equal(status, 400)
  assert.equal(body.message, MESSAGES.idcard)
})

test('forgot-password verify rejects malformed OTP', async () => {
  const { status, body } = await post('/api/auth/forgot-password/verify-otp', { idcard: '1100200000001', otp: '12ab' })
  assert.equal(status, 400)
  assert.equal(body.message, MESSAGES.otp)
})

test('forgot-password reset rejects a weak password before checking the token', async () => {
  const { status, body } = await post('/api/auth/forgot-password/reset', { reset_token: 'x', new_password: '123' })
  assert.equal(status, 400)
  assert.equal(body.message, MESSAGES.password)
})

test('forgot-password reset rejects an invalid token with 401', async () => {
  const { status } = await post('/api/auth/forgot-password/reset', { reset_token: 'not-a-jwt', new_password: 'secret12' })
  assert.equal(status, 401)
})
