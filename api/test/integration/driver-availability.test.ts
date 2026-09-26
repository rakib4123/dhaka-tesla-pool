import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';
import { goOffline, goOnline } from '../helpers/scenario';

describe('driver availability', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('puts Jashim and Bullet online at Banani Road 11', async () => {
    const res = await goOnline('jashim', 'Banani');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Bullet', isOnline: true, currentZone: { name: 'Banani' } });
    const me = await api().get('/api/me').set(bearer(await loginAs('jashim')));
    expect(me.body.vehicle.isOnline).toBe(true);
  });

  it('takes Jashim offline again', async () => {
    await goOnline('jashim', 'Banani');
    const res = await goOffline('jashim');
    expect(res.body).toMatchObject({ isOnline: false, currentZone: null });
  });

  it('needs a zone to go online', async () => {
    const res = await api().put('/api/driver/availability').set(bearer(await loginAs('jashim'))).send({ online: true });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('zoneId');
  });

  it('rejects an unknown zone', async () => {
    const res = await api().put('/api/driver/availability').set(bearer(await loginAs('jashim'))).send({ online: true, zoneId: 99999 });
    expect(res.status).toBe(400);
  });

  it('is for drivers only', async () => {
    const res = await api().put('/api/driver/availability').set(bearer(await loginAs('nusrat'))).send({ online: false });
    expect(res.status).toBe(403);
  });
});
