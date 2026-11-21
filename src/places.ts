export type MapPoint = { x: number; z: number };
type Place = MapPoint & {
  id: string;
  name: string;
  district: string;
  kind: 'vista' | 'landmark' | 'drive';
  description: string;
  approach?: MapPoint;
};

export const SCENIC_STOPS = [
  { id: 'sierra-vista', name: 'Sierra Vista', district: 'Sierra Verde', x: 190, z: -1086,
    from: { x: 192.46, z: -1058.32 }, road: 'Sierra Coast Highway', width: 18, depth: 14, color: '#adc6a2',
    description: 'A stone terrace looking back across the Verde ridgeline.' },
  { id: 'lake-overlook', name: 'Silver Lake Overlook', district: 'Silver Lake', x: 1125, z: -735,
    from: { x: 1147.76, z: -749.90 }, road: 'Silver Lake Circuit', width: 16, depth: 16, color: '#a4d8ce',
    description: 'A quiet viewpoint over the lake and its skyline.' },
  { id: 'sunset-point', name: 'Sunset Point', district: 'Isla Luz', x: 80, z: 944,
    from: { x: 100, z: 944 }, road: 'Isla Luz Loop', width: 16, depth: 16, color: '#e6bd86',
    description: 'An island pull-off with an open view across the sea.' },
];

export const PLACES: Place[] = [
  ...SCENIC_STOPS.map(stop => ({ ...stop, kind: 'vista' as const })),
  { id: 'beach', name: 'Sunspoke Beach', district: 'Sunspoke Beach', kind: 'landmark', x: -65, z: 160, description: 'The coastal boulevard beside three timber boardwalks and the beachfront pavilion.' },
  { id: 'palm', name: 'Palm Quarter', district: 'Palm Quarter', kind: 'landmark', x: 280, z: 0, description: 'Palm-lined resort streets inland from the promenade.' },
  { id: 'ramp', name: 'Ramp Time', district: 'Sunspoke Beach', kind: 'drive', x: -101, z: 0, approach: { x: -65, z: 0 }, description: 'Enter through the gold and teal arch off the boulevard.' },
  { id: 'crown', name: 'Crown Downtown', district: 'Crown Downtown', kind: 'drive', x: 720, z: 80, description: 'A grid of city blocks and the Downtown Switchbacks course.' },
  { id: 'canals', name: 'Canal Gardens', district: 'Canal Gardens', kind: 'landmark', x: 1080, z: 80, description: 'Villas, landscaped banks, and short bridges over the canal.' },
  { id: 'port', name: 'Southport Harbour', district: 'Southport', kind: 'landmark', x: 900, z: 650, description: 'The entrance to the harbour bridge and working waterfront.' },
  { id: 'airfield', name: 'Runway 07', district: 'Coast Airfield', kind: 'drive', x: 110, z: 520, description: 'The west end of the airfield runway, via the taxiway.' },
  { id: 'bridge', name: 'Verde Skyline Bridge', district: 'Sierra Verde', kind: 'landmark', x: 730, z: -737, description: 'The cable-stayed crossing between Sierra Verde and Silver Lake.' },
  { id: 'gallery', name: 'NAREN Grand Gallery', district: 'Silver Lake', kind: 'landmark', x: 930, z: -980, approach: { x: 930, z: -904 }, description: 'An eight-piece drive-through gallery with automatic glass doors.' },
  { id: 'isla-verde', name: 'Isla Verde Waterfront', district: 'Isla Verde', kind: 'drive', x: 480, z: -1510, description: 'The north island’s waterfront loop, reached by causeway from Sierra Verde.' },
];
