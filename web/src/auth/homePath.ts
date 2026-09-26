import type { Role } from '../api/types';

export const homePathFor = (role: Role) => (role === 'DRIVER' ? '/driver' : '/ride');
