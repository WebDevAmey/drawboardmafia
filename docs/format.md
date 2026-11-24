# The `.board` format (version 1)

A `.board` file is UTF-8 plain text. It has **one element per line**, and the lines are in paint order: the first line is painted at the bottom. The format is meant to be read and edited by hand, diffed line by line in git, and merged by `dbm merge`.

```
board 1 sketch=1 grid=dots
// Checkout flow
api: box "API Gateway" @120,80 240x80 fill=blue
db: cylinder "Postgres" @520,80
cache: box "Redis"
api -> db "reads" route=elbow
api-cache: api -- cache dash=dotted
f1: frame "Checkout" @80,40 700x300 { api db cache }
~a8f3kq: ink @300,400 pts=AAIAAAoJ
```

## Header

The first non-comment line is `board 1`, optionally followed by board attributes:

| Attribute | Values | Default |
|---|---|---|
| `sketch` | `0` clean, `1` sketchy, `2` very sketchy | `0` |
| `bg` | colour | theme canvas |
| `grid` | `dots`, `lines`, `none` | app setting |

## Nodes

```
<id>: <type> ["text"] [@x,y] [WxH] [{ members }] [key=value …]
```

**Types and their quoted text:**

| Type | Quoted text is | Default size |
|---|---|---|
| `box`, `ellipse`, `diamond`, `cylinder` | label | 160x80 (diamond 160x100, cylinder 120x100) |
| `text` | text | 160x40 |
| `note` | text | 200x200 |
| `code` | source code | 320x160 |
| `frame` | name, plus `{ id … }` members | 400x300 |
| `image` | (none). Needs `asset=<sha256>.png` | 200x200 |
| `ink` | (none). Needs `pts=…` | sized by its points |

**Positions and sizes:**

- **Position:** `@x,y` is the top-left corner, in integers. A node with no position is placed automatically next to the nodes it's connected to.
- **Size:** `WxH` is written only when it differs from the type's default.

## Connectors

```
[<id>:] <end> <op> <end> ["label"] [key=value …]
```

**Ops:**

| Op | Meaning |
|---|---|
| `->` | Arrow with a head at the end |
| `<->` | Heads at both ends |
| `--` | Plain line, no heads |

**Ends** are an element id (bound to that element) or a free point `(x,y)`.

**Ids:** you can leave the id out when both ends are bound. The connector's id is then `<from>-<to>`, so `api -> db` has the id `api-db`. A second connector between the same two elements needs an explicit id, such as `reads2: api -> db`.

## Attributes

Attributes are written in this canonical order, and defaults are omitted:

| Key | Applies to | Values | Default |
|---|---|---|---|
| `icon` | shapes | pictogram name, e.g. `server`, `cloud`, `queue` (unknown names draw no icon) | (none) |
| `fill` | nodes except ink | colour or `none` | `none` (`yellow` for note, `gray` for code) |
| `stroke` | all | colour | `ink` |
| `width` | all | `1`, `2`, `4` | `2` |
| `dash` | all | `solid`, `dashed`, `dotted` | `solid` |
| `sketch` | all | `0`, `1`, `2` | board default |
| `font` | shapes, text, notes | `sans`, `mono`, `hand` | `sans` |
| `size` | shapes, text, notes | `1`–`4` | `2` |
| `align` | text, notes | `l`, `c`, `r` | `l` |
| `lang` | code | for example `ts`, `python` | (none) |
| `route` | connectors | `straight`, `elbow`, `curve` | `straight` |
| `rot` | nodes | degrees, at most 1 decimal place | `0` |
| `via` | connectors | `x,y;x,y` waypoints | (none) |
| `asset` | images | `<sha256>.<png\|jpg\|gif\|webp>` in `<name>.board.assets/` | (none) |
| `pts` | ink | encoded points (base64url) | (none) |
| `locked` | all | `true` | (unset) |
| `group` | all | group id | (unset) |

**Colours** are palette tokens (`ink gray red orange yellow green blue violet`) or `#rrggbb`. Tokens are re-tuned for light and dark themes, so prefer them over hex values.

## Strings and comments

- **Strings** are double-quoted. The escapes are `\"`, `\\` and `\n`.
- **Comments:** a `// …` line attaches to the element below it. Comments at the end of the file are kept as trailing comments. Comments at the end of a line are not supported.

## Ids

| Kind | Pattern | Example |
|---|---|---|
| Named | `[a-z][a-z0-9_-]*` | `api` |
| Anonymous | `~` plus 6 lowercase base36 characters | `~a8f3kq` |

Ids never change when labels change.

## Ink encoding

`pts` holds a stroke's points, encoded as base64url. The bytes are:

1. A flags byte. Bit 0 set means the points carry pressure.
2. A varint point count.
3. For each point: a zigzag varint delta for x, then for y (integers relative to the node's `@x,y`), then a pressure byte (0–255) if the flag is set.

Points without pressure decode with a pressure of 0.5.

## Guarantees

- **Canonical form:** `dbm fmt` output is canonical. `serialize(parse(text))` is stable after one pass, and this is enforced by property tests.
- **No churn:** the app and the CLI never rewrite a file that hasn't been edited.
- **Error tolerance:** a bad line is reported and skipped, and every other line still loads.
