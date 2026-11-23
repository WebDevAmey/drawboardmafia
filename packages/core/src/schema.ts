import type { Color } from './palette';

export type Id = string;

/** Named ids are user-facing slugs; anonymous ids are "~" + 6 base36 chars. */
export const ID_RE = /^(?:[a-z][a-z0-9_-]*|~[a-z0-9]{6})$/;
export const isValidId = (s: string): boolean => ID_RE.test(s);

export type Dash = 'solid' | 'dashed' | 'dotted';
export type StrokeWidth = 1 | 2 | 4;
export type Sketch = 0 | 1 | 2;
export type Font = 'sans' | 'mono' | 'hand';
export type FontSize = 1 | 2 | 3 | 4;
export type Align = 'l' | 'c' | 'r';

export interface Style {
  stroke: Color;
  fill: Color | 'none';
  width: StrokeWidth;
  dash: Dash;
  /** undefined = board default */
  sketch?: Sketch;
  locked?: boolean;
  group?: Id;
  /** `//` comment lines that precede this element in the file */
  comments?: string[];
}

export interface NodeBase extends Style {
  id: Id;
  /** undefined = not yet placed (auto-placement fills it) */
  x?: number;
  y?: number;
  w: number;
  h: number;
  /** degrees */
  rot: number;
}

export type ShapeType = 'box' | 'ellipse' | 'diamond' | 'cylinder';
export interface ShapeEl extends NodeBase { type: ShapeType; label?: string; font?: Font; size?: FontSize }
export interface TextEl extends NodeBase { type: 'text' | 'note'; text: string; font?: Font; size?: FontSize; align?: Align }
export interface CodeEl extends NodeBase { type: 'code'; text: string; lang?: string }
export interface FrameEl extends NodeBase { type: 'frame'; name: string; members: Id[] }
export interface ImageEl extends NodeBase { type: 'image'; asset: string }
/** [x, y, pressure 0..1], relative to the element's x/y */
export type InkPoint = [number, number, number];
export interface InkEl extends NodeBase { type: 'ink'; pts: InkPoint[] }

export type End = { id: Id } | { x: number; y: number };
export type Head = 'end' | 'both' | 'none';
export type Route = 'straight' | 'elbow' | 'curve';
export interface Connector extends Style {
  id: Id;
  type: 'arrow';
  from: End;
  to: End;
  head: Head;
  route: Route;
  label?: string;
  via?: [number, number][];
}

export type NodeEl = ShapeEl | TextEl | CodeEl | FrameEl | ImageEl | InkEl;
export type Element = NodeEl | Connector;
export type ElementType = Element['type'];
export type NodeType = NodeEl['type'];

export const NODE_TYPES: readonly NodeType[] = [
  'box', 'ellipse', 'diamond', 'cylinder', 'text', 'note', 'code', 'frame', 'image', 'ink',
];

export interface Board {
  version: 1;
  sketch: Sketch;
  bg?: Color;
  grid?: 'dots' | 'lines' | 'none';
  /** paint order: first = bottom */
  elements: Element[];
  trailingComments: string[];
}

export const isConnector = (e: Element): e is Connector => e.type === 'arrow';
export const isNode = (e: Element): e is NodeEl => e.type !== 'arrow';
export const isBoundEnd = (end: End): end is { id: Id } => 'id' in end;

export const emptyBoard = (): Board => ({ version: 1, sketch: 0, elements: [], trailingComments: [] });
