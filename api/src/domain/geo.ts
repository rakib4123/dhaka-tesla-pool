import { DESTINATION_CLUSTER_KM } from './constants';

export interface GridPoint {
  gridX: number;
  gridY: number;
}

/** Manhattan distance in km on the 1 km zone grid. Dhaka traffic doesn't travel in straight lines. */
export function distanceKm(from: GridPoint, to: GridPoint): number {
  return Math.abs(from.gridX - to.gridX) + Math.abs(from.gridY - to.gridY);
}

/** A drop-off fits a pool only if it is close to every drop-off already in it. */
export function fitsDestinationCluster(dropoff: GridPoint, existingDropoffs: GridPoint[]): boolean {
  return existingDropoffs.every((other) => distanceKm(dropoff, other) <= DESTINATION_CLUSTER_KM);
}
