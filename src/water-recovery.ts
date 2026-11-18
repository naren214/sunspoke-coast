import { isLand, waterLevel } from './geography';
import { insideStunt } from './stunt';
import type { DriveState } from './types';
import { VEHICLE } from './vehicle';

export function isSubmerged({position:{x,y,z},airborne}:DriveState) {
  return !airborne&&!insideStunt(x,z)&&!isLand(x,z)&&y+VEHICLE.height+.08<waterLevel(x,z);
}
