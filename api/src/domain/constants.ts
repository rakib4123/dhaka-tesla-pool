/** Fare model (spec §3.3). Money is always integer paisa: 100 paisa = ৳1. */
export const BASE_FARE_PAISA = 3000; // ৳30 per seat
export const PER_KM_PAISA = 2000; // ৳20 per km per seat
export const POOL_DISCOUNT_PCT = 25; // applied only if the ride is actually pooled at STARTED

/** Matching (spec §3.2). */
export const DESTINATION_CLUSTER_KM = 2;

/** The largest Tesla in the fleet (Bullet) has 3 seats. */
export const MAX_SEATS_PER_REQUEST = 3;
