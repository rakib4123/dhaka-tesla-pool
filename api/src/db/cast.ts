/** The story cast from the brief. Seed data, tests and the demo all use these same people. */
export const DEMO_PASSWORD = 'bullet123';

export const ZONES = [
  { name: 'Banani', gridX: 0, gridY: 0 },
  { name: 'Mohakhali', gridX: 0, gridY: -2 },
  { name: 'Gulshan 1', gridX: 1, gridY: -2 },
  { name: 'Gulshan 2', gridX: 1, gridY: 0 },
  { name: 'Bashundhara', gridX: 5, gridY: 3 },
  { name: 'Farmgate', gridX: -2, gridY: -4 },
  { name: 'Dhanmondi', gridX: -3, gridY: -5 },
  { name: 'Mirpur', gridX: -4, gridY: 1 },
  { name: 'Uttara', gridX: -3, gridY: 9 },
] as const;

export type ZoneName = (typeof ZONES)[number]['name'];

export type CastKey = 'jashim' | 'monir' | 'nusrat' | 'rafiq' | 'shirin';

export const castEmail = (key: CastKey) => `${key}@teslapool.test`;

export const PASSENGERS = [
  { key: 'nusrat', name: 'Nusrat', phone: '+8801711000001' },
  { key: 'rafiq', name: 'Rafiq', phone: '+8801711000002' },
  { key: 'shirin', name: 'Shirin', phone: '+8801711000003' },
] as const;

export const DRIVERS = [
  { key: 'jashim', name: 'Jashim', phone: '+8801811000001', vehicle: { name: 'Bullet', plate: 'DHK-TESLA-11', capacity: 3 } },
  // Monir and Toofan are our addition to the cast. The multi-driver scenarios need a second driver.
  { key: 'monir', name: 'Monir', phone: '+8801811000002', vehicle: { name: 'Toofan', plate: 'DHK-TESLA-22', capacity: 2 } },
] as const;

export const CAST_EMAILS: string[] = [...PASSENGERS, ...DRIVERS].map((person) => castEmail(person.key));
