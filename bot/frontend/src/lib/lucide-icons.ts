// Lucide v0.468.0, ISC. Original vector geometry from github.com/lucide-icons/lucide.
type Part = [tag: 'path' | 'rect' | 'polyline' | 'circle' | 'line', attrs: Record<string, string | number>];
const path = (d: string): Part => ['path', {d}];
export const lucide: Record<string, Part[]> = {
  edit: [
    path('M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'),
    path('m15 5 4 4'),
  ],
  terminal: [path('m7 11 2-2-2-2'), path('M11 13h4'), ['rect', {x:3,y:3,width:18,height:18,rx:2,ry:2}]],
  chevron: [path('m9 18 6-6-6-6')],
  more: [12,19,5].map(cx => ['circle', {cx,cy:12,r:1}]),
  steer: [['polyline', {points:'15 10 20 15 15 20'}], path('M4 4v7a4 4 0 0 0 4 4h12')],
  'queue-turn': [path('M5 4v11a3 3 0 0 0 3 3h12 M17 15l3 3-3 3 M10 7h8 M10 11h5')],
  trash: [
    path('M3 6h18'), path('M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'), path('M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'),
    ['line', {x1:10,x2:10,y1:11,y2:17}], ['line', {x1:14,x2:14,y1:11,y2:17}],
  ],
  changes: [path('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'),path('M9 10h6'),path('M12 13V7'),path('M9 17h6')],
};
