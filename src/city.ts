// A coastal county: the original resort remains its western urban district.
import { BEACH } from './geography';

const bounds = {minX:BEACH.originalShoreX-BEACH.extension-8,maxX:1380,minZ:-1590,maxZ:1040};
export const CITY = {
  ...bounds,
  originalArea: (210 + 116) * 620,
  area: (bounds.maxX-bounds.minX)*(bounds.maxZ-bounds.minZ),
};
