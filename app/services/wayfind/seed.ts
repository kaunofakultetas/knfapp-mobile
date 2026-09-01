// -----------------------------------------------------------
//  [*] wayfind — the bundled seed
//
//  The building graph the map tab starts from before the
//  server has answered once (or ever, offline): the two-floor
//  faculty walk as an engine BuildingGraph, its two schematic
//  plans as SVG text, and the bundled panoramas the nodes
//  point at. Generated from the old curated walk — node
//  positions are laid out on a 1000 × 600 px plan at 0.05 m
//  per pixel so the plan distances reproduce the walk's
//  metres; each node's panoYaw is the plan bearing its photo's
//  centre column faces, derived from where the next waypoint
//  sat in that photo. The server's published graph replaces
//  this the moment it is newer (revision > 0); plan and pano
//  references that start with 'plan:' / 'pano:' resolve here,
//  '/api/…' references resolve to the server.
//
//  Used by:
//    - hooks/useBuildingGraph.ts — the seed and the cache floor
//    - app/(main)/tabs/map.tsx — bundled plans and panoramas
// -----------------------------------------------------------

import type { BuildingGraph } from '@knf/wayfindengine';


export const KNF_BUILDING_ID = 'knf';

export const KNF_GRAPH: BuildingGraph = {
  "version": 1,
  "building": "knf",
  "levels": [
    {
      "id": "L1",
      "label": "1 aukštas",
      "plan": "plan:L1",
      "viewBox": [
        0,
        0,
        1000,
        600
      ],
      "metersPerPixel": 0.05,
      "ordinal": 1
    },
    {
      "id": "L2",
      "label": "2 aukštas",
      "plan": "plan:L2",
      "viewBox": [
        0,
        0,
        1000,
        600
      ],
      "metersPerPixel": 0.05,
      "ordinal": 2
    }
  ],
  "nodes": [
    {
      "id": "n-entrance",
      "level": "L1",
      "x": 100,
      "y": 300,
      "kind": "entrance",
      "pano": "pano:1.1.03",
      "panoYaw": 40,
      "panoHeading": {
        "source": "manual"
      }
    },
    {
      "id": "n-stairs1",
      "level": "L1",
      "x": 840,
      "y": 300,
      "kind": "stairs",
      "pano": "pano:1.1.00",
      "panoYaw": 260,
      "panoHeading": {
        "source": "manual"
      },
      "landmark": "Laiptai"
    },
    {
      "id": "n-stairs2",
      "level": "L2",
      "x": 900,
      "y": 300,
      "kind": "stairs",
      "pano": "pano:1.2.01",
      "panoYaw": 260,
      "panoHeading": {
        "source": "manual"
      },
      "landmark": "Laiptai"
    },
    {
      "id": "n-a",
      "level": "L2",
      "x": 700,
      "y": 300,
      "kind": "corridor",
      "pano": "pano:1.2.05",
      "panoYaw": 225,
      "panoHeading": {
        "source": "manual"
      }
    },
    {
      "id": "n-b",
      "level": "L2",
      "x": 500,
      "y": 300,
      "kind": "corridor",
      "pano": "pano:2.2.04",
      "panoYaw": 240,
      "panoHeading": {
        "source": "manual"
      }
    },
    {
      "id": "n-c",
      "level": "L2",
      "x": 300,
      "y": 300,
      "kind": "corridor",
      "pano": "pano:2.2.05",
      "panoYaw": 205,
      "panoHeading": {
        "source": "manual"
      }
    },
    {
      "id": "n-d",
      "level": "L2",
      "x": 100,
      "y": 300,
      "kind": "corridor",
      "pano": "pano:2.2.02",
      "panoYaw": 135,
      "panoHeading": {
        "source": "manual"
      }
    },
    {
      "id": "n-e",
      "level": "L2",
      "x": 100,
      "y": 100,
      "kind": "corridor",
      "pano": "pano:2.2.01",
      "panoYaw": 170,
      "panoHeading": {
        "source": "manual"
      }
    }
  ],
  "edges": [
    {
      "id": "n-entrance--n-stairs1",
      "a": "n-entrance",
      "b": "n-stairs1",
      "kind": "hallway"
    },
    {
      "id": "n-stairs1--n-stairs2",
      "a": "n-stairs1",
      "b": "n-stairs2",
      "kind": "stairs",
      "lengthM": 22
    },
    {
      "id": "n-stairs2--n-a",
      "a": "n-stairs2",
      "b": "n-a",
      "kind": "hallway"
    },
    {
      "id": "n-a--n-b",
      "a": "n-a",
      "b": "n-b",
      "kind": "hallway"
    },
    {
      "id": "n-b--n-c",
      "a": "n-b",
      "b": "n-c",
      "kind": "hallway"
    },
    {
      "id": "n-c--n-d",
      "a": "n-c",
      "b": "n-d",
      "kind": "hallway"
    },
    {
      "id": "n-d--n-e",
      "a": "n-d",
      "b": "n-e",
      "kind": "hallway"
    }
  ],
  "rooms": [
    {
      "id": "r-pr",
      "name": "Viešųjų ryšių skyrius",
      "nameKey": "navigation.rooms.publicRelations",
      "level": "L1",
      "nodeId": "n-entrance",
      "category": "office",
      "polygon": [
        [
          40,
          140
        ],
        [
          260,
          140
        ],
        [
          260,
          250
        ],
        [
          40,
          250
        ]
      ]
    },
    {
      "id": "r-aud12",
      "name": "1 AUD ir 2 AUD",
      "nameKey": "navigation.rooms.aud1and2",
      "level": "L2",
      "nodeId": "n-stairs2",
      "category": "lecture",
      "polygon": [
        [
          800,
          140
        ],
        [
          980,
          140
        ],
        [
          980,
          250
        ],
        [
          800,
          250
        ]
      ],
      "aliases": [
        "1 AUD",
        "2 AUD"
      ]
    },
    {
      "id": "r-intl",
      "name": "Tarptautiniai ryšiai",
      "nameKey": "navigation.rooms.internationalRelations",
      "level": "L2",
      "nodeId": "n-a",
      "category": "office",
      "polygon": [
        [
          610,
          350
        ],
        [
          790,
          350
        ],
        [
          790,
          460
        ],
        [
          610,
          460
        ]
      ]
    },
    {
      "id": "r-avl2",
      "name": "AVL2",
      "level": "L2",
      "nodeId": "n-b",
      "category": "lecture",
      "polygon": [
        [
          410,
          140
        ],
        [
          590,
          140
        ],
        [
          590,
          250
        ],
        [
          410,
          250
        ]
      ]
    },
    {
      "id": "r-vega",
      "name": "VeGa auditorija",
      "level": "L2",
      "nodeId": "n-c",
      "category": "lecture",
      "polygon": [
        [
          210,
          350
        ],
        [
          390,
          350
        ],
        [
          390,
          460
        ],
        [
          210,
          460
        ]
      ],
      "aliases": [
        "VeGa"
      ]
    },
    {
      "id": "r-aud5",
      "name": "5 AUD",
      "level": "L2",
      "nodeId": "n-d",
      "category": "lecture",
      "polygon": [
        [
          20,
          140
        ],
        [
          180,
          140
        ],
        [
          180,
          250
        ],
        [
          20,
          250
        ]
      ]
    },
    {
      "id": "r-gronsko",
      "name": "Gronsko auditorija",
      "level": "L2",
      "nodeId": "n-e",
      "category": "lecture",
      "polygon": [
        [
          20,
          10
        ],
        [
          180,
          10
        ],
        [
          180,
          80
        ],
        [
          20,
          80
        ]
      ],
      "aliases": [
        "Gronskas"
      ]
    }
  ],
  "entranceNodeId": "n-entrance",
  "northDeg": null,
  "revision": 0,
  "publishedAt": null
};


// Node.pano → the bundled asset (the stage takes a number)
export const BUNDLED_PANOS: Record<string, number> = {
  'pano:1.1.00': require('@/assets/navigation/1.1.00.jpg') as number,
  'pano:1.1.03': require('@/assets/navigation/1.1.03.jpg') as number,
  'pano:1.2.01': require('@/assets/navigation/1.2.01.jpg') as number,
  'pano:1.2.05': require('@/assets/navigation/1.2.05.jpg') as number,
  'pano:2.2.01': require('@/assets/navigation/2.2.01.jpg') as number,
  'pano:2.2.02': require('@/assets/navigation/2.2.02.jpg') as number,
  'pano:2.2.04': require('@/assets/navigation/2.2.04.jpg') as number,
  'pano:2.2.05': require('@/assets/navigation/2.2.05.jpg') as number,
};


// Level.plan → the drawing's SVG text
export const BUNDLED_PLANS: Record<string, string> = {
  'plan:L1': "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1000 600\"><rect width=\"1000\" height=\"600\" fill=\"#F4F1F6\"/><rect x=\"60\" y=\"262\" width=\"860\" height=\"76\" rx=\"14\" fill=\"#E3DDE8\"/><text x=\"470\" y=\"308\" text-anchor=\"middle\" font-size=\"22\" fill=\"#7A6B85\" font-family=\"sans-serif\">Koridorius</text><rect x=\"40\" y=\"140\" width=\"220\" height=\"110\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#B9AFC4\" stroke-width=\"3\"/><text x=\"150\" y=\"203\" text-anchor=\"middle\" font-size=\"20\" fill=\"#4A3D55\" font-family=\"sans-serif\">Viešųjų ryšių skyrius</text><rect x=\"60\" y=\"340\" width=\"80\" height=\"14\" fill=\"#7B003F\"/><text x=\"100\" y=\"378\" text-anchor=\"middle\" font-size=\"18\" fill=\"#7B003F\" font-family=\"sans-serif\">Įėjimas</text><line x1=\"812\" y1=\"240\" x2=\"812\" y2=\"280\" stroke=\"#7B003F\" stroke-width=\"4\"/><line x1=\"826\" y1=\"240\" x2=\"826\" y2=\"280\" stroke=\"#7B003F\" stroke-width=\"4\"/><line x1=\"840\" y1=\"240\" x2=\"840\" y2=\"280\" stroke=\"#7B003F\" stroke-width=\"4\"/><line x1=\"854\" y1=\"240\" x2=\"854\" y2=\"280\" stroke=\"#7B003F\" stroke-width=\"4\"/><line x1=\"868\" y1=\"240\" x2=\"868\" y2=\"280\" stroke=\"#7B003F\" stroke-width=\"4\"/><text x=\"840\" y=\"230\" text-anchor=\"middle\" font-size=\"18\" fill=\"#7B003F\" font-family=\"sans-serif\">Laiptai</text></svg>",
  'plan:L2': "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1000 600\"><rect width=\"1000\" height=\"600\" fill=\"#F4F1F6\"/><rect x=\"60\" y=\"262\" width=\"900\" height=\"76\" rx=\"14\" fill=\"#E3DDE8\"/><rect x=\"62\" y=\"60\" width=\"76\" height=\"280\" rx=\"14\" fill=\"#E3DDE8\"/><text x=\"500\" y=\"308\" text-anchor=\"middle\" font-size=\"22\" fill=\"#7A6B85\" font-family=\"sans-serif\">Koridorius</text><rect x=\"800\" y=\"140\" width=\"180\" height=\"110\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#B9AFC4\" stroke-width=\"3\"/><text x=\"890\" y=\"203\" text-anchor=\"middle\" font-size=\"20\" fill=\"#4A3D55\" font-family=\"sans-serif\">1 AUD ir 2 AUD</text><rect x=\"610\" y=\"350\" width=\"180\" height=\"110\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#B9AFC4\" stroke-width=\"3\"/><text x=\"700\" y=\"413\" text-anchor=\"middle\" font-size=\"20\" fill=\"#4A3D55\" font-family=\"sans-serif\">Tarptautiniai ryšiai</text><rect x=\"410\" y=\"140\" width=\"180\" height=\"110\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#B9AFC4\" stroke-width=\"3\"/><text x=\"500\" y=\"203\" text-anchor=\"middle\" font-size=\"20\" fill=\"#4A3D55\" font-family=\"sans-serif\">AVL2</text><rect x=\"210\" y=\"350\" width=\"180\" height=\"110\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#B9AFC4\" stroke-width=\"3\"/><text x=\"300\" y=\"413\" text-anchor=\"middle\" font-size=\"20\" fill=\"#4A3D55\" font-family=\"sans-serif\">VeGa auditorija</text><rect x=\"20\" y=\"140\" width=\"160\" height=\"110\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#B9AFC4\" stroke-width=\"3\"/><text x=\"100\" y=\"203\" text-anchor=\"middle\" font-size=\"20\" fill=\"#4A3D55\" font-family=\"sans-serif\">5 AUD</text><rect x=\"20\" y=\"10\" width=\"160\" height=\"70\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#B9AFC4\" stroke-width=\"3\"/><text x=\"100\" y=\"53\" text-anchor=\"middle\" font-size=\"20\" fill=\"#4A3D55\" font-family=\"sans-serif\">Gronsko auditorija</text><line x1=\"872\" y1=\"240\" x2=\"872\" y2=\"280\" stroke=\"#7B003F\" stroke-width=\"4\"/><line x1=\"886\" y1=\"240\" x2=\"886\" y2=\"280\" stroke=\"#7B003F\" stroke-width=\"4\"/><line x1=\"900\" y1=\"240\" x2=\"900\" y2=\"280\" stroke=\"#7B003F\" stroke-width=\"4\"/><line x1=\"914\" y1=\"240\" x2=\"914\" y2=\"280\" stroke=\"#7B003F\" stroke-width=\"4\"/><line x1=\"928\" y1=\"240\" x2=\"928\" y2=\"280\" stroke=\"#7B003F\" stroke-width=\"4\"/><text x=\"900\" y=\"230\" text-anchor=\"middle\" font-size=\"18\" fill=\"#7B003F\" font-family=\"sans-serif\">Laiptai</text></svg>",
};
