import { bounds, overlaps, unionRects, type Rect } from './geometry';
import { isBoundEnd, isConnector, isNode, type Board, type Element, type FrameEl, type Id, type NodeEl } from './schema';

const GAP = 48;
const GRID_GAP_Y = 96;
const FRAME_PAD = 40;

type Dir = 'LR' | 'TB' | 'RL' | 'BT';

function edges(board: Board): [Id, Id][] {
  return board.elements.filter(isConnector).flatMap((c) =>
    isBoundEnd(c.from) && isBoundEnd(c.to) ? [[c.from.id, c.to.id] as [Id, Id]] : [],
  );
}

const cloneNodes = (board: Board) => board.elements.map((e) => ({ ...e }) as Element);

/** Frames without a position wrap their members' bounds. */
function fitFrames(els: Element[]) {
  const byId = new Map(els.map((e) => [e.id, e]));
  for (const f of els) {
    if (f.type !== 'frame' || (f.x !== undefined && f.y !== undefined)) continue;
    const r = unionRects(f.members.map((m) => byId.get(m)).filter((m): m is NodeEl => !!m && isNode(m)).map(bounds).filter((b): b is Rect => !!b));
    if (!r) continue;
    Object.assign(f as FrameEl, {
      x: r.x - FRAME_PAD, y: r.y - FRAME_PAD, w: r.w + 2 * FRAME_PAD, h: r.h + 2 * FRAME_PAD,
    });
  }
}

/**
 * Returns a new board where every node has a position. Already-placed nodes never move.
 * Deterministic: depends only on the board contents and order.
 */
export function placeUnpositioned(board: Board): Board {
  const els = cloneNodes(board);
  const nodes = els.filter(isNode);
  const isPlaced = (n: NodeEl) => n.x !== undefined && n.y !== undefined;
  const obstacles = () => nodes.filter((n) => isPlaced(n) && n.type !== 'frame').map((n) => bounds(n)!);
  const free = (r: Rect) => !obstacles().some((o) => overlaps(r, o));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const es = edges(board);

  const placeNear = (n: NodeEl): boolean => {
    for (const [from, to] of es) {
      const other = from === n.id ? byId.get(to) : to === n.id ? byId.get(from) : undefined;
      if (!other || !isPlaced(other) || other.type === 'frame') continue;
      const ob = bounds(other)!;
      const x = from === n.id ? ob.x - n.w - GAP : ob.x + ob.w + GAP;
      let y = ob.y;
      for (let i = 0; i < 1000 && !free({ x, y, w: n.w, h: n.h }); i++) y += n.h + GAP;
      n.x = x;
      n.y = y;
      return true;
    }
    return false;
  };

  // Grid for nodes with no placed neighbour: rows below whatever was placed initially.
  const initial = unionRects(obstacles());
  const gridX = initial?.x ?? 0;
  const gridWidth = Math.max(initial?.w ?? 0, 1200);
  let cursor = { x: gridX, y: initial ? initial.y + initial.h + GRID_GAP_Y : 0 };
  const placeInGrid = (n: NodeEl) => {
    let { x, y } = cursor;
    if (x > gridX && x + n.w > gridX + gridWidth) {
      x = gridX;
      y += n.h + GAP;
    }
    for (let i = 0; i < 10000 && !free({ x, y, w: n.w, h: n.h }); i++) {
      x += GAP + n.w;
      if (x > gridX + gridWidth) {
        x = gridX;
        y += n.h + GAP;
      }
    }
    n.x = x;
    n.y = y;
    cursor = { x: x + n.w + GAP, y };
  };

  const pending = () => nodes.filter((n) => !isPlaced(n) && n.type !== 'frame');
  while (pending().length) {
    let progress = false;
    for (const n of pending()) if (placeNear(n)) progress = true;
    if (!progress) placeInGrid(pending()[0]!);
  }
  fitFrames(els);
  for (const f of nodes) if (!isPlaced(f)) placeInGrid(f); // frames with no placed members
  return { ...board, elements: els };
}

/** Assigns every non-frame node a position using longest-path layering. */
export function layeredLayout(board: Board, dir: Dir): Board {
  const els = cloneNodes(board);
  const nodes = els.filter(isNode).filter((n) => n.type !== 'frame');
  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map<Id, Id[]>(nodes.map((n) => [n.id, []]));
  for (const [a, b] of edges(board)) if (ids.has(a) && ids.has(b) && a !== b) out.get(a)!.push(b);

  // DFS: drop back edges to break cycles; collect post-order.
  const state = new Map<Id, 1 | 2>();
  const post: Id[] = [];
  const dag = new Map<Id, Id[]>(nodes.map((n) => [n.id, []]));
  const visit = (root: Id) => {
    const stack: [Id, number][] = [[root, 0]];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const [id, i] = top;
      const next = out.get(id)![i];
      if (next === undefined) {
        state.set(id, 2);
        post.push(id);
        stack.pop();
        continue;
      }
      top[1]++;
      if (state.get(next) === 1) continue; // back edge
      dag.get(id)!.push(next);
      if (!state.has(next)) {
        state.set(next, 1);
        stack.push([next, 0]);
      }
    }
  };
  for (const n of nodes) if (!state.has(n.id)) visit(n.id);

  const rank = new Map<Id, number>(nodes.map((n) => [n.id, 0]));
  for (const id of post.reverse()) for (const to of dag.get(id)!) rank.set(to, Math.max(rank.get(to)!, rank.get(id)! + 1));

  const maxW = Math.max(0, ...nodes.map((n) => n.w));
  const maxH = Math.max(0, ...nodes.map((n) => n.h));
  const maxRank = Math.max(0, ...rank.values());
  const slot = new Map<number, number>();
  const horizontal = dir === 'LR' || dir === 'RL';
  const reversed = dir === 'RL' || dir === 'BT';
  for (const n of nodes) {
    const r = reversed ? maxRank - rank.get(n.id)! : rank.get(n.id)!;
    const i = slot.get(r) ?? 0;
    slot.set(r, i + 1);
    const along = r * ((horizontal ? maxW : maxH) + (horizontal ? 80 : GAP * 2));
    const across = i * ((horizontal ? maxH : maxW) + GAP);
    n.x = Math.round((horizontal ? along : across) + (maxW - n.w) / 2);
    n.y = Math.round((horizontal ? across : along) + (maxH - n.h) / 2);
  }
  for (const f of els) if (f.type === 'frame') Object.assign(f, { x: undefined, y: undefined });
  fitFrames(els);
  return placeUnpositioned({ ...board, elements: els });
}
