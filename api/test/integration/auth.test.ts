import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';

describe('auth', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('registers a new passenger and never returns the password hash', async () => {
    const res = await api().post('/api/auth/register').send({
      name: 'Tania', email: 'tania@teslapool.test', phone: '+8801711000099', password: 'rickshaw99',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: 'Tania', email: 'tania@teslapool.test', role: 'PASSENGER' });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('ignores an attempt to self-register as a driver', async () => {
    const res = await api().post('/api/auth/register').send({
      name: 'Sneaky', email: 'sneaky@teslapool.test', password: 'rickshaw99', role: 'DRIVER',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('PASSENGER');
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Nusrat Again', email: 'nusrat@teslapool.test', password: 'rickshaw99' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects an invalid body with field details', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'T', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('logs Nusrat in (email is case-insensitive) and returns her profile from /me', async () => {
    const login = await api().post('/api/auth/login').send({ email: 'NUSRAT@teslapool.test', password: 'bullet123' });
    expect(login.status).toBe(200);
    const me = await api().get('/api/me').set(bearer(login.body.token));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ name: 'Nusrat', role: 'PASSENGER', vehicle: null });
  });

  it("shows Jashim's Tesla on /me", async () => {
    const me = await api().get('/api/me').set(bearer(await loginAs('jashim')));
    expect(me.body).toMatchObject({
      name: 'Jashim',
      role: 'DRIVER',
      vehicle: { name: 'Bullet', plate: 'DHK-TESLA-11', capacity: 3, isOnline: false, currentZone: null },
    });
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const wrong = await api().post('/api/auth/login').send({ email: 'rafiq@teslapool.test', password: 'nope-nope' });
    const unknown = await api().post('/api/auth/login').send({ email: 'ghost@teslapool.test', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it.each([
    ['no header', undefined],
    ['a garbage token', 'Bearer not.a.jwt'],
    ['a token signed with another secret', `Bearer ${jwt.sign({ role: 'PASSENGER', name: 'X' }, 'some-other-secret-value', { subject: '00000000-0000-4000-8000-000000000000' })}`],
    ['an expired token', `Bearer ${jwt.sign({ role: 'PASSENGER', name: 'X' }, 'test-only-secret-not-for-production', { subject: '00000000-0000-4000-8000-000000000000', expiresIn: -10 })}`],
  ])('rejects /me with %s as 401', async (_label, header) => {
    const req = api().get('/api/me');
    const res = header ? await req.set('Authorization', header) : await req;
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
