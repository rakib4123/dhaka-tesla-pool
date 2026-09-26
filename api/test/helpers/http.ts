import request from 'supertest';
import { createApp } from '../../src/app';
import { castEmail, DEMO_PASSWORD, type CastKey } from '../../src/db/cast';

export const app = createApp();
export const api = () => request(app);

const tokens = new Map<CastKey, string>();

/** Logs in a cast member once per test file and reuses the token. */
export async function loginAs(who: CastKey): Promise<string> {
  const cached = tokens.get(who);
  if (cached) return cached;
  const res = await api().post('/api/auth/login').send({ email: castEmail(who), password: DEMO_PASSWORD });
  if (res.status !== 200) throw new Error(`loginAs(${who}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  tokens.set(who, res.body.token);
  return res.body.token as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
