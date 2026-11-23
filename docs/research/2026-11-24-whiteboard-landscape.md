# Whiteboard landscape research (2026-11-24)

Research for a personal, open-source, developer-first, keyboard-centric collaborative whiteboard built by one developer. Sources are primary unless marked **[secondary]**. **UNVERIFIED** means I could not confirm the claim from a primary source. Reaction counts are GitHub totals (all emoji), with the 👍 count in parentheses where it differs, as of 2026-11-24. They come from the GitHub search API (`sort=reactions`).

---

## 1. Competitor feature inventory

### Summary table

| Product | License / OSS | Pricing | Collab model | Self-host | Notable for us |
|---|---|---|---|---|---|
| **Excalidraw** (OSS editor + excalidraw.com) | MIT ([repo](https://github.com/excalidraw/excalidraw), about 136k stars). `@excalidraw/excalidraw` is at 0.18.1 on npm. | Free | The server relays E2E-encrypted per-element diffs over socket.io. Clients reconcile with last-writer-wins on each element's version (see §3). | Only partly. The client is self-hostable, but collab and share links depend on [excalidraw-room](https://github.com/excalidraw/excalidraw-room) plus a share-link store, and the app also uses Firebase ([#1772](https://github.com/excalidraw/excalidraw/issues/1772), 136 reactions, open) | It is the hand-drawn aesthetic reference. It already ships a command palette, Mermaid import, frames, elbow arrows and keyboard flowchart creation. |
| **Excalidraw+** | Closed SaaS | Free tier: 1 scene, 10 AI requests a day. Plus: **$6 per user per month**, with unlimited scenes, presentations, PDF/PPTX export, comments, voice hangouts, 100 AI requests a day or bring-your-own-key, and **MCP + REST API (public beta)** ([pricing](https://plus.excalidraw.com/pricing)) | Hosted | No | It is moving into developer and agent tooling. The official [excalidraw/cli](https://github.com/excalidraw/cli) (MIT, created 2026-10-08) renders `.excalidraw` files, converts Mermaid, exports frames as slides and runs `excalidraw mcp`. |
| **tldraw SDK / tldraw.com** | **Source-available, not OSS.** `tldraw`, `@tldraw/editor`, `@tldraw/sync` and `@tldraw/sync-core` are under the [tldraw license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md). `@tldraw/state`, `@tldraw/store`, `@tldraw/tlschema`, `@tldraw/utils` and `@tldraw/validate` are **MIT**, per each `package.json` (e.g. [state](https://github.com/tldraw/tldraw/blob/main/packages/state/package.json)). | tldraw.com is free. The SDK needs a license for production (details below). | Server-authoritative sync (`TLSocketRoom`) | The sync server is self-hostable (Cloudflare template or Node), but the SDK license applies | It has the best SDK architecture: signals, a record store, an R-tree index and a11y navigation. |
| **tldraw office** (formerly "tldraw offline") | Repo has no license ([tldraw/tldraw-office](https://github.com/tldraw/tldraw-office)) | Free ([blog, 2026-07-16](https://tldraw.dev/blog/tldraw-offline)) | LAN only. The host laptop runs the sync package in-process ([blog, 2026-08-13](https://tldraw.dev/blog/introducing-tldraw-offline-multiplayer)). | Yes (desktop) | Local `.tldraw` files with embedded scripts, editable by agents. **This is the closest existing product to "local-first + agents + scripting".** It "does not currently merge changes made to an open file by another program, sync client, Git operation" **[secondary]** ([alternativeto](https://alternativeto.net/news/2026/7/tldraw-releases-free-offline-desktop-app-with-scripting-features/), [user manual](https://tldraw.notion.site/User-manual-tldraw-offline-39a3e4c324c080e7b2eacc5afd078e85)). |
| **ihatepdf.cv/collab-whiteboard** | Closed (bundled JS) | Free, no account | **Peer-to-peer WebRTC mesh with manual signalling.** See below. | N/A | It shows the "no server, no account" pitch. Its weak point is the UX of manually exchanging codes. |
| **Miro** | Closed | Free: **3 editable boards**. Starter **$8**, Business **$20** per member per month, billed yearly. AI credits per tier. MCP calls per day: 100 / 500 / 2,000 / 10,000 ([pricing](https://miro.com/pricing/)). | Hosted, real-time | No | Mind maps use Tab to add a child and Enter to add a sibling **[secondary: community moderator]** ([thread](https://community.miro.com/ask-the-community-45/mindmap-keyboard-navigation-8610)). There is active "No AI" backlash (§9h). |
| **FigJam** | Closed | Collab seat **$3/mo** (Professional) or **$5/mo** (Org/Enterprise). Full seat $16/mo ([pricing](https://www.figma.com/pricing/)). | Hosted, real-time | No | The Figma renderer is C++/WASM. It moved WebGL to WebGPU in 2025 ([blog](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/)). |
| **Whimsical** | Closed | Free: **50 board objects/month**, 7-day history. Pro $10/mo, Business $20/mo, billed annually ([pricing](https://whimsical.com/pricing)). | Hosted | No | It is the keyboard flowchart benchmark: **Option/Alt + Arrow adds a connected shape** ([help](https://help.whimsical.com/article/636-getting-started-with-flowcharts)). It has single-key shape shortcuts ([shortcuts](https://whimsical.com/learn/shortcuts/mac)). |
| **Obsidian Canvas** | App closed. The [JSON Canvas](https://jsoncanvas.org/spec/1.0/) format is MIT ([repo](https://github.com/obsidianmd/jsoncanvas)). | Free ([obsidian.md/canvas](https://obsidian.md/canvas)) | None built in. Files are local. | Local files | The open file format holds text (Markdown), file, link and group nodes, plus edges with `fromSide`/`toSide`. It is the de-facto interchange format for "note + canvas" tools. |
| **Obsidian Excalidraw plugin** | AGPL-3.0 ([repo](https://github.com/zsviczian/obsidian-excalidraw-plugin), about 7.9k stars) | Free | None (files in the vault) | Local | Top asks: Markdown in text ([#178](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/178), 16) and slideshow export ([#1580](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1580), 9). |
| **draw.io / diagrams.net** | Apache-2.0 ([jgraph/drawio](https://github.com/jgraph/drawio)). It states: "**We do not accept pull requests.**" Desktop is GPL-3.0 ([drawio-desktop](https://github.com/jgraph/drawio-desktop)). | Free | Real-time collab only when files live on **Google Drive or OneDrive** (`sync=auto|manual|none`) ([docs](https://www.drawio.com/docs/manual/collaboration/concurrent-editing/)) | Yes (static app) | It has keyboard clone-and-connect: **Alt+Shift+Arrow** ([docs](https://www.drawio.com/docs/reference/shortcuts/shortcut-clone-connect/)). Its official MCP server is [jgraph/drawio-mcp](https://github.com/jgraph/drawio-mcp) (about 5.9k stars). |

### tldraw SDK license terms

These are the exact terms, from [LICENSE.md](https://github.com/tldraw/tldraw/blob/main/LICENSE.md), last changed in "License change for 4.0 (#6780)" on 2025-09-17.

- **Permitted:**
  - Use in **Development Environments** only.
  - Modify the software.
  - Bundle it with your own projects.
  - Submit modifications to tldraw.
- **Conditions:**
  - "**Not to use the Software in Production Environments**" unless you hold a trial or commercial license (or a hobby license, per the website).
  - Do not "disable, change, or interfere with the Software's License Key enforcement".
  - Do not distribute it "as a standalone product".
  - Do not relicense it.
- **Technical enforcement:** the software verifies license keys and "may collect and transmit usage data … for license compliance".
- **Tiers** ([license page](https://tldraw.dev/community/license), [pricing](https://tldraw.dev/pricing)):
  - **Trial:** 100 days, one per business unit. It pings tldraw with a hash of the key.
  - **Commercial:** "value-based" pricing.
  - **Hobby:** "**discretionary**", non-commercial only, and "the 'made with tldraw' watermark must be shown".
- **Not open source:** "any source code or packages covered by the tldraw SDK license would not be Open Source by any definition."
- **Without a key:** the SDK stops rendering after about 5 seconds in production **[secondary]** ([alternativeto](https://alternativeto.net/news/2025/9/tldraw-sdk-4-0-adds-five-new-starter-kits-cli-tool-and-enforces-licensing-changes)).
- **Downstream example:** BigBlueButton stayed on the last Apache-2.0 2.x pre-release **[secondary]** ([bbb-dev](https://groups.google.com/g/bigbluebutton-dev/c/XTjr4FKbn18)).
- **Stale README:** some package READMEs still state the 3.x "use with watermark" terms, e.g. [sync-core README](https://github.com/tldraw/tldraw/blob/main/packages/sync-core/README.md). LICENSE.md is the governing text.
- **Community friction:**
  - tldraw auto-closes external PRs ([#7695](https://github.com/tldraw/tldraw/issues/7695), 290 reactions, 2026-01-15).
  - A tongue-in-cheek "Move tests to closed source repo" issue drew 306 reactions. It was closed *not planned* ([#8082](https://github.com/tldraw/tldraw/issues/8082)).

**Implication:** an OSS project cannot use `tldraw`/`@tldraw/editor` as its base. It **can** use the MIT packages `@tldraw/state` (signals), `@tldraw/store` and `@tldraw/utils` (including fractional index helpers).

### ihatepdf.cv/collab-whiteboard

I inferred the stack from the shipped page and the `CollabWhiteboardTool-*.js` chunk, fetched 2026-11-24.

- **Pitch:** "Real-time collaborative whiteboard — peer-to-peer, no server, no account" (meta description). Its FAQ says: "Drawing data is transmitted peer-to-peer using WebRTC. Nothing is stored on ihatepdf's servers." The page is part of a PDF-tools site hosted on Vercel (`server: Vercel` header).
- **Stack:**
  - Vite-style hashed assets (`/assets/index-*.js`, `react-vendor-*.js`), React and Tailwind classes.
  - Rendering uses Canvas2D (`getContext("2d")`, `destination-out` for the eraser).
- **Networking:**
  - It uses `RTCPeerConnection` and `createDataChannel` (ordered).
  - The only ICE servers are Google STUN (`stun.l.google.com:19302`, `stun1…`). There is **no TURN server**. My inference: connections can fail behind symmetric NAT or corporate firewalls.
  - Signalling is a **manual copy-paste offer/answer code**, base64 JSON. UI strings: "Offer code", "Paste answer", "Mesh via manual handshake", "Add collaborator".
  - It uses `BroadcastChannel`, which suggests same-browser tab sync (my inference).
- **Message types:** `STROKE`, `UPDATE`, `DELETE`, `CURSOR`, `INSERT`, plus `move`/`resize`/`color`/`clear`.
- **Features:** select, pen, highlighter, line, arrow, rect, circle, text and eraser tools; resize handles; chat ("Open chat"); PNG export. There is no persistence, no account and no visible shareable URL.

**Takeaway:** it validates the appeal of zero-infrastructure P2P. A signalling relay or URL-based rendezvous, plus TURN fallback, would remove its main friction.

---

## 2. User complaints and most-requested missing features

### Excalidraw: top issues by reactions

Source: [issues sorted by 👍](https://github.com/excalidraw/excalidraw/issues?q=is%3Aissue+sort%3Areactions-%2B1-desc), queried via the API.

**Note on status:** the "closed" state includes some issues labelled *out of scope*, so "closed" does not always mean shipped. I list the label where relevant.

| # | Issue | Reactions (👍) | Status | Theme |
|---|---|---|---|---|
| 1 | [#4847 Table template](https://github.com/excalidraw/excalidraw/issues/4847) | 327 (260) | open | structured content |
| 2 | [#5138 Highlight words in a paragraph](https://github.com/excalidraw/excalidraw/issues/5138) | 243 (185) | open, Candidate P1 | text / rich text |
| 3 | [#1126 Colors for ranges in text](https://github.com/excalidraw/excalidraw/issues/1126) | 170 (145) | open, Candidate P1 | text / rich text |
| 4 | [#6802 Searchable/favourite library icons](https://github.com/excalidraw/excalidraw/issues/6802) | 144 (124) | closed 2025-10 | libraries |
| 5 | [#1772 Self-hosting umbrella](https://github.com/excalidraw/excalidraw/issues/1772) | 136 (54) | open | self-host / collab |
| 6 | [#19 Import images](https://github.com/excalidraw/excalidraw/issues/19) | 133 | shipped 2021 | media |
| 7 | [#1800 Export PDF](https://github.com/excalidraw/excalidraw/issues/1800) | 97 (89) | closed 2026-05. PR [#10854](https://github.com/excalidraw/excalidraw/pull/10854) was still referenced as open in comments, and Excalidraw+ has PDF export. | export |
| 8 | [#3693 Freedraw thickness and scaling](https://github.com/excalidraw/excalidraw/issues/3693) | 99 (71) | partially fixed 2026-06 | freehand |
| 9 | [#1543 Tabs (multiple pages/scenes)](https://github.com/excalidraw/excalidraw/issues/1543) | 88 | open | multi-page |
| 10 | [#6773 Grid backgrounds (notebook)](https://github.com/excalidraw/excalidraw/issues/6773) | 93 (83) | open | canvas |
| 11 | [#5265 LaTeX rendering](https://github.com/excalidraw/excalidraw/issues/5265) | 87 (75) | open, Candidate P1 | text / math |
| 12 | [#5166 Pen eraser on button hold](https://github.com/excalidraw/excalidraw/issues/5166) | 74 (68) | open | stylus / mobile |
| 13 | [#5301 Import GIF](https://github.com/excalidraw/excalidraw/issues/5301) | 67 | open | media |
| 14 | [#4236 Image cropping](https://github.com/excalidraw/excalidraw/issues/4236) | 50 | shipped 2024 | media |
| 15 | [#9705 Touch device support (meta)](https://github.com/excalidraw/excalidraw/issues/9705) | 42 | open | mobile |
| 16 | [#1261 Excalidraw CLI](https://github.com/excalidraw/excalidraw/issues/1261) | 40 | shipped 2026-11 as [excalidraw/cli](https://github.com/excalidraw/cli) | dev integration |
| 17 | [#3852 Customizable keybindings](https://github.com/excalidraw/excalidraw/issues/3852) | 38 | open | keyboard |
| 18 | [#6678 Rich text / WYSIWYG](https://github.com/excalidraw/excalidraw/issues/6678) | 38 | open | text |
| 19 | [#2706 Embedding share links](https://github.com/excalidraw/excalidraw/issues/2706) | 34 | open | embed |
| 20 | [#7725 Layers](https://github.com/excalidraw/excalidraw/issues/7725) | 30 | open | layers |
| 21 | [#3600 Rectangle corner radius](https://github.com/excalidraw/excalidraw/issues/3600) | 27 | open | styling |
| 22 | [#1317 Marker / highlighter](https://github.com/excalidraw/excalidraw/issues/1317) | 26 | open | freehand |
| 23 | [#9456 Code blocks](https://github.com/excalidraw/excalidraw/issues/9456) and [#10036 Code blocks with syntax highlighting](https://github.com/excalidraw/excalidraw/issues/10036) | 25 + 24 | open | dev content |
| 24 | [#3762 Paste tabular data as a table](https://github.com/excalidraw/excalidraw/issues/3762) | 25 | open, good first issue | structured content |
| 25 | [#6712 Arrowheads too big / not resizable](https://github.com/excalidraw/excalidraw/issues/6712) | 21 | open, arrow-redesign | arrows |

Other signals:

- **Closed as out of scope:**
  - [#1176 Math](https://github.com/excalidraw/excalidraw/issues/1176) (36)
  - [#2310 Search](https://github.com/excalidraw/excalidraw/issues/2310) (33; a search menu now exists in source, `packages/excalidraw/components/SearchMenu.tsx`)
  - [#1189 Confluence/Jira plugin](https://github.com/excalidraw/excalidraw/issues/1189) (29)
  - [#1010 Link text to shape](https://github.com/excalidraw/excalidraw/issues/1010) (30, "closing for now")
- **Keyboard:**
  - [#7685 Disable/override shortcuts](https://github.com/excalidraw/excalidraw/issues/7685) (9)
  - [#3059 Shortcuts inaccessible on non-QWERTY layouts](https://github.com/excalidraw/excalidraw/issues/3059) (8)
  - [#3706 Host-customisable shortcuts](https://github.com/excalidraw/excalidraw/issues/3706) (8)
  - [#6925 Vim motions](https://github.com/excalidraw/excalidraw/issues/6925) (10)
  - [#5261 Shortcuts on iOS without a keyboard](https://github.com/excalidraw/excalidraw/issues/5261) (5)
- **Performance:**
  - [#7280 Degraded with 5000+ elements](https://github.com/excalidraw/excalidraw/issues/7280) (8)
  - [#8136 Complex drawing poor performance](https://github.com/excalidraw/excalidraw/issues/8136) (5; benchmark in §3)
  - [#10512 O(N) full scene traversal on every pan/zoom](https://github.com/excalidraw/excalidraw/issues/10512) (3)
- **Offline and collab:**
  - [#5827 Offline mode for Excalidraw+](https://github.com/excalidraw/excalidraw/issues/5827) (14)
  - [#10079 Offline mode for collaboration](https://github.com/excalidraw/excalidraw/issues/10079) (1)
- **Presentation:**
  - [#253 Presentation mode](https://github.com/excalidraw/excalidraw/issues/253) (21; shipped in Excalidraw+)
  - [#6949 Export presentation to PDF](https://github.com/excalidraw/excalidraw/issues/6949) (18)
- **Accessibility:**
  - [#5759](https://github.com/excalidraw/excalidraw/issues/5759) (3)
  - [#7492 Deque audit](https://github.com/excalidraw/excalidraw/issues/7492)
  - [#8088 High-contrast themes](https://github.com/excalidraw/excalidraw/issues/8088)
- **Discussions, by upvotes** (473 discussions in total):
  - [#5050 How to format text](https://github.com/excalidraw/excalidraw/discussions/5050) (45)
  - [#5284 Nested collections](https://github.com/excalidraw/excalidraw/discussions/5284) (27)
  - [#5515 Mouse mode for zoom/pan](https://github.com/excalidraw/excalidraw/discussions/5515) (26)
  - [#7614 Animated arrows](https://github.com/excalidraw/excalidraw/discussions/7614) (24)
  - [#5345 Isometric grid](https://github.com/excalidraw/excalidraw/discussions/5345) (21)
  - [#8277 Command to change an existing shape's type](https://github.com/excalidraw/excalidraw/discussions/8277) (15)
  - [#10337 Excalidraw as a Mermaid rendering engine](https://github.com/excalidraw/excalidraw/discussions/10337) (11)
  - [#2716 Integrate with GitHub](https://github.com/excalidraw/excalidraw/discussions/2716) (9)

### tldraw: top issues

Source: [issues by reactions](https://github.com/tldraw/tldraw/issues?q=is%3Aissue+sort%3Areactions-%2B1-desc). tldraw has **no GitHub Discussions** (count 0), and most issues are internal trackers, so the reaction signal is weak.

| Issue | Reactions | Status |
|---|---|---|
| [#7695 Contributions policy (auto-close external PRs)](https://github.com/tldraw/tldraw/issues/7695) | 290 | open |
| [#8082 Move tests to closed-source repo](https://github.com/tldraw/tldraw/issues/8082) | 306 (mostly negative) | closed, not planned |
| [#4353 Paste Mermaid and auto-draw](https://github.com/tldraw/tldraw/issues/4353) | 27 | closed. A `packages/mermaid` package now exists. |
| [#1780 Table shape](https://github.com/tldraw/tldraw/issues/1780) | 24 | open |
| [#1345 Collections panel](https://github.com/tldraw/tldraw/issues/1345) | 15 | closed |
| [#1736 Advanced Markdown rendering](https://github.com/tldraw/tldraw/issues/1736) | 14 | closed |
| [#1383 PDF render/annotate](https://github.com/tldraw/tldraw/issues/1383) | 12 | closed |
| [#4396 Mind map](https://github.com/tldraw/tldraw/issues/4396) | 11 | closed |
| [#5122 Open-source tldraw Computer](https://github.com/tldraw/tldraw/issues/5122) | 10 | closed |
| [#1741 Docker image](https://github.com/tldraw/tldraw/issues/1741) | 8 | closed |
| [#1739 Layers with opacity/visibility like draw.io](https://github.com/tldraw/tldraw/issues/1739) | 7 | closed |
| [#4305 Right-angle arrows](https://github.com/tldraw/tldraw/issues/4305) | 20 | closed |

### Themes, ranked by evidence

1. **Text and rich text** (highlight, ranges, WYSIWYG, LaTeX, code blocks, Markdown). This is the largest cluster: more than 700 reactions across #5138, #1126, #5265, #6678, #9456, #10036 and #5050.
2. **Structured content: tables.** This is the single top request (327), plus #3762 (25) and tldraw #1780 (24).
3. **Self-hosting with collab** (#1772, 136; tldraw #1741).
4. **Multi-page, layers and organisation** (#1543, 88; #7725, 30; nested collections, 27).
5. **Stylus and mobile** (#5166, 74; #9705, 42; Obsidian plugin pen issues).
6. **Keyboard customisation and non-QWERTY layouts** (#3852, 38; plus about 5 smaller issues).
7. **Export** (PDF, slides).
8. **Performance at scale.** Reaction counts are low, but these issues carry concrete benchmarks.
9. **Diagram-as-code and dev integration** (Mermaid, CLI, GitHub rendering; see §7 and §9).
10. **Accessibility.** Few reactions, but there is an audit with concrete failures (#7492).

---

## 3. Excalidraw internals (from source, `master`, 2026-11-24)

### Element model

From `packages/element/src/types.ts` ([source](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts)), `_ExcalidrawElementBase`:

- **Geometry and style:** `id`, `x`, `y`, `width`, `height`, `angle`, `strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `strokeStyle`, `roundness`, `roughness`, `opacity`.
- **`seed`:** "Random integer used to seed shape generation so that the roughjs shape doesn't differ across renders."
- **`version`:** "sequentially incremented on each change. Used to reconcile elements during collaboration."
- **`versionNonce`:** "Random integer that is regenerated on each change. Used for deterministic reconciliation … in case the versions … are identical."
- **`index: FractionalIndex | null`:** fractional indexing per [rocicorp/fractional-indexing](https://github.com/rocicorp/fractional-indexing), "Used for ordering in multiplayer scenarios". It is kept in sync with array order by `syncMovedIndices` and `syncInvalidIndices` (`packages/element/src/fractionalIndex.ts`).
- **Other fields:** `isDeleted` (tombstone), `groupIds` (deepest first), `frameId`, `boundElements`, `updated`, `created` (new; "Not an ordering clock"), `link`, `locked`, `customData`.

### File format

From `dev-docs/docs/codebase/json-schema.mdx` ([source](https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/codebase/json-schema.mdx)):

- The file is `{type:"excalidraw", version:2, source, elements[], appState, files}`.
- **Images are embedded as base64 `dataURL`s inside `files`.**

### Collab reconciliation

From `packages/excalidraw/data/reconcile.ts` ([source](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/reconcile.ts)):

- `shouldDiscardRemoteElement` keeps the local element when any of these holds:
  - The local element is being resized or created right now.
  - `local.version > remote.version`.
  - The versions are equal and `local.versionNonce <= remote.versionNonce`, so the lowest nonce wins.
- Remote elements come first, then the remaining locals. The result is sorted with `orderByFractionalIndex`, and duplicate indices are repaired with `syncInvalidIndices`.
- **This is a per-element last-writer-wins register with no field-level merge.** Two users who edit different properties of the same element at the same time will lose one of the edits.

From `excalidraw-app/collab/Portal.tsx` and `excalidraw-app/app_constants.ts` ([source](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/app_constants.ts)):

- `broadcastScene` sends only elements whose `version` is greater than the last broadcast version.
- Cursor updates go out as *volatile* messages every `CURSOR_SYNC_TIMEOUT = 33` ms.
- A **full scene re-sync** runs every `SYNC_FULL_SCENE_INTERVAL_MS = 20000`.
- Deleted elements are kept for `DELETED_ELEMENT_TIMEOUT = 1 day`.
- The file upload maximum is 4 MiB.

### The relay server

[excalidraw-room](https://github.com/excalidraw/excalidraw-room) `src/index.ts` is a socket.io server with these events: `join-room`, `server-broadcast` and `server-volatile-broadcast`. It forwards `(encryptedData, iv)` to the room as `client-broadcast`, and handles `user-follow`. **The server never sees plaintext.** The repo was last pushed 2024-07 and has about 544 stars.

Room persistence is in `excalidraw-app/data/firebase.ts` ([source](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/firebase.ts)). It stores `{ciphertext, iv}` per room in Firestore, and files go to Firebase Storage.

### E2E encryption

From `packages/excalidraw/data/encryption.ts` ([source](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/encryption.ts)) and `ENCRYPTION_KEY_BITS = 128` in `packages/common/src/constants.ts`:

- Encryption is WebCrypto **AES-GCM with a 128-bit key** and a 12-byte IV.
- The key is exported as JWK `k` (base64url).
- **Live collab link:** `#room=<roomId>,<roomKey>` (`excalidraw-app/data/index.ts`, regex `RE_COLLAB_LINK`).
- **Share link:** `#json=<id>,<key>`. The client uploads ciphertext to `VITE_APP_BACKEND_V2_POST_URL`.
- The key lives in the **URL fragment, which browsers never send to the server.**

### Rendering

- **Two canvases:** `components/canvases/StaticCanvas.tsx` holds the scene and `InteractiveCanvas.tsx` holds selection, handles and remote cursors. The renderers are `renderer/staticScene.ts` and `renderer/interactiveScene.ts`. An SVG export path lives in `renderer/staticSvgScene.ts`.
- **Shapes** come from roughjs's `RoughGenerator` (`packages/element/src/shape.ts`). They are cached per element in `ShapeCache` (a `WeakMap`).
- **Per-element bitmap cache:** each element is rasterised to its own offscreen canvas (`elementWithCanvasCache`, `generateElementCanvas` in `packages/element/src/renderElement.ts`). The cache is capped at `AREA_LIMIT = 16777216` px².
- **Freedraw** uses `perfect-freehand` (`packages/excalidraw/package.json`).

### Known performance limits

- Viewport culling is a linear filter. `Renderer.getRenderableElements` iterates `scene.getNonDeletedElements()` and applies `isElementInViewport` on every pan or zoom. **There is no spatial index** ([#10512](https://github.com/excalidraw/excalidraw/issues/10512); `packages/excalidraw/scene/Renderer.ts`).
- One user benchmark on an M1 Air in Chrome: smooth to 4k–8k objects, struggling at 8k, about 30 FPS at 10–14k ([#8136](https://github.com/excalidraw/excalidraw/issues/8136)).
- Another report puts noticeable lag at 5000+ elements ([#7280](https://github.com/excalidraw/excalidraw/issues/7280)).

### Shipped features worth knowing

- **Command palette:** `components/CommandPalette/`.
- **Keyboard flowcharts:** `packages/element/src/flowchart.ts` (`FlowChartCreator`, `FlowChartNavigator`) and `components/App.flowchart.ts`. **Ctrl/Cmd + Arrow creates a connected node, and Alt + Arrow navigates the flowchart.** The help dialog labels are `helpDialog.createFlowchart` and `navigateFlowchart`.
- **Others:** elbow arrows (`elbowArrow.ts`), frames (`frame.ts`), search (`SearchMenu.tsx`), text-to-diagram with an AI chat (`components/TTDDialog/`, including `MermaidToExcalidraw.tsx`), and a laser pointer.
- **Undo/redo in collab** was fixed in 2024 ([#5375](https://github.com/excalidraw/excalidraw/issues/5375)). It is delta-based (`packages/element/src/delta.ts`, `store.ts`, `history.ts`).

---

## 4. tldraw internals

### Store and records

From `apps/docs/content/sdk-features/store.mdx` ([source](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/sdk-features/store.mdx)):

- The store is a reactive, schema-validated record database. Each record is JSON with a branded `id` (`shape:…`, `page:…`, `binding:…`) and a `typeName`.
- Every record has a **scope**:

| Scope | Persisted | Synced to other users | Examples |
|---|---|---|---|
| `document` | Yes | Yes | shapes, pages, bindings |
| `session` | Optional | No | current page, camera |
| `presence` | No | Yes | cursors, selection |

- Schema migrations live in `@tldraw/tlschema`.
- Z-order uses base-62 **fractional index strings** (`'a1'`, `'a1V'`), via `getIndexBetween` and related helpers in `@tldraw/utils` ([shape-indexing.mdx](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/sdk-features/shape-indexing.mdx)).

### Signals

From `@tldraw/state` ([README](https://github.com/tldraw/tldraw/blob/main/packages/state/README.md), [signals.mdx](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/sdk-features/signals.mdx)):

- The primitives are `atom`, `computed` and `react`/`reactor`, with lazy evaluation, "Built-in diff history and transactions with rollback", and `historyLength`/`computeDiff` for incremental derivations.
- It descends from **signia**, which is MIT and not archived ([tldraw/signia](https://github.com/tldraw/signia)).
- **`@tldraw/state` and `@tldraw/store` are MIT on npm (v5.6.2), so an OSS project can use them.**

### Rendering

- Shapes are **DOM elements**: `ShapeUtil.component` returns JSX (HTML/SVG).
- Culled shapes get `display: none` but stay in the DOM ([culling](https://tldraw.dev/sdk-features/culling)).
- Selection and hover **indicators are stroked on a canvas overlay** via `getIndicatorPath` returning a `Path2D` ([indicators.mdx](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/sdk-features/indicators.mdx)). This followed an A/B test of canvas vs SVG indicators ([PR #8573](https://github.com/tldraw/tldraw/pull/8573)).
- There is a **spatial index**: `packages/editor/src/lib/editor/managers/SpatialIndexManager/RBushIndex.ts`, using `rbush` per `packages/editor/package.json`.

### Performance numbers

From the [performance docs](https://tldraw.dev/sdk-features/performance):

- **`maxShapesPerPage` defaults to 4000.**
- Above `debouncedZoomThreshold = 500` shapes, zoom is debounced.
- Example from the docs: "10,000 shapes might only render 50".
- Level-of-detail behaviour: dashed freehand renders solid when zoomed out, and images are served at lower resolution.

### Sync

From the [sync docs](https://tldraw.dev/docs/sync) and [collaboration.mdx](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/sdk-features/collaboration.mdx):

- **Architecture:**
  - `TLSocketRoom` (`@tldraw/sync-core`) holds **one authoritative room per document**, and "the server is authoritative for conflict resolution".
  - Storage is `InMemorySyncStorage` or `SQLiteSyncStorage`.
  - The recommended host is **Cloudflare Durable Objects**: one DO per room, built-in SQLite, WebSocket hibernation, and R2 for assets.
- **Client behaviour:** when offline, changes are queued and sent on reconnect.
- **Constraints:**
  - The client and server versions must match.
  - Auth, rate limits and room listing are DIY.
  - The demo server deletes data after a day.
  - **The sync packages are under the tldraw license.**

### License constraints for using tldraw as a base

See §1. In short:

- `tldraw`, `@tldraw/editor`, `@tldraw/sync` and `@tldraw/sync-core` are off-limits for an MIT/OSS product unless every user gets their own license key.
- The MIT pieces (`state`, `store`, `tlschema`, `utils`, `validate`) are safe to use.
- tldraw 1.x stays MIT forever **[secondary]** ([alternativeto](https://alternativeto.net/news/2025/9/tldraw-sdk-4-0-adds-five-new-starter-kits-cli-tool-and-enforces-licensing-changes)).

---

## 5. Real-time sync options

| Option | Model | Offline | Bundle (min+gzip, [bundlephobia](https://bundlephobia.com) **[secondary tool]**) | Self-host | Solo-dev ops |
|---|---|---|---|---|---|
| **Yjs** 13.6.33 (MIT). v14 is in RC as `@y/y` 14.0.0-rc.7. | Sequence/map CRDT | Yes, via `y-indexeddb` (1.5 kB gz) | **28 kB** (+ y-websocket 6 kB) | `y-websocket` server (in-memory, can persist; now `@y/websocket-server`), or `@y/hub`, which is scalable with auth ([y-websocket README](https://github.com/yjs/y-websocket)) | Low. A Node process or one DO per room via `y-partyserver`. |
| **Automerge** 3.5.0 (MIT) | JSON CRDT with full history | Yes (`automerge-repo` IndexedDB/nodefs adapters, [repo](https://github.com/automerge/automerge-repo)) | **1.64 MB gz** (WASM inlined; raw `automerge.wasm` is 3.6 MB) | `automerge-repo-sync-server` | Medium. Bundle size is the cost. |
| **Loro** 1.19.0 (MIT) | Eg-walker CRDT with **Movable List**, **Movable Tree**, time travel, Git-like version DAG and shallow snapshots ([README](https://github.com/loro-dev/loro)) | Yes | JS glue 16 kB gz, plus **4.18 MB raw WASM** (`loro_wasm_bg.wasm`, [jsdelivr listing](https://data.jsdelivr.com/v1/packages/npm/loro-crdt@1.19.0?structure=flat)) | Bring your own relay (bytes in, bytes out) | Medium. WASM weight; the strongest fit for history and branching. |
| **Liveblocks** | Hosted Storage (LiveObject/LiveList) or Yjs | Partial | `@liveblocks/client` 59 kB gz | Server **AGPL-3.0** since Feb 2026 (`@liveblocks/server`); clients Apache-2.0 ([blog](https://liveblocks.io/blog/open-sourcing-the-liveblocks-sync-engine-and-dev-server)). Hosted self-hosting is an Enterprise add-on ([pricing](https://liveblocks.io/pricing)). | Free tier: 500 monthly active rooms, **10 simultaneous connections per room**, 10 MB per room, 24 h history retention. Pro $25–30/mo. |
| **PartyServer + Durable Objects** (ISC) | Bring your own protocol. `y-partyserver` gives Yjs-on-DO ([repo](https://github.com/cloudflare/partykit)). | Client-side | `partysocket` 4 kB gz | Cloudflare only (workerd can run locally) | DOs are **available on the Workers Free plan** (SQLite backend): 100k requests/day, 13,000 GB-s/day, 5 GB stored. Paid: 1M requests and 400k GB-s/month included. **Incoming WebSocket messages bill at 20:1.** **Hibernation means idle sockets are not billed for duration.** The docs' example is $12.50 with hibernation vs $412.50 without ([pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)). |
| **Electric** (Apache-2.0) | Postgres-to-client **read-path sync only**: "Electric does not do write-path sync" ([docs](https://electric.ax/docs/guides/writes)). The GitHub repo now redirects to `neondatabase/electric` ([repo](https://github.com/electric-sql/electric)). | Via optimistic patterns | n/a | Postgres plus the Electric service | Too heavy for a whiteboard; it fits relational apps. |
| **Zero** (rocicorp, Apache-2.0) | Query-driven local cache backed by Postgres | **"Zero does not support offline writes"** and "is not designed for long periods offline" ([docs](https://zero.rocicorp.dev/docs/offline)) | n/a | Postgres plus zero-cache | Poor fit (no offline writes). |
| **Per-element LWW**, as Excalidraw does it (§3) | `version` + `versionNonce` per element, plus fractional index | Trivial (merge on reconnect) | about 0 | Any dumb relay: socket.io, a DO, or WebRTC | **Lowest.** The cost is lost concurrent edits on the same element, and there is no text CRDT. |

### Yjs details

- **Awareness:** a separate CRDT in `y-protocols`. Peers are marked offline after **30 s** without an update, so each client must re-broadcast periodically ([docs](https://docs.yjs.dev/api/about-awareness)).
- **Garbage collection:**
  - "Set `doc.gc = false` to disable garbage collection and be able to restore old content" ([Y.Doc](https://docs.yjs.dev/api/y.doc)). In other words, history or snapshots require turning GC off, and the document then grows.
  - `mergeUpdates` "doesn't garbage-collect deleted content", and "You still need to load the document to a Y.Doc to reduce the document size" ([document updates](https://docs.yjs.dev/api/document-updates)).

### Automerge 3 memory

Automerge 3 holds history compressed at runtime, giving ">10x" less memory. The release post's example: Moby Dick took 700 MB in Automerge 2 and 1.3 MB in Automerge 3 ([blog, 2025](https://automerge.org/blog/automerge-3/)).

### Fit for a solo-dev whiteboard

Per-element LWW over a dumb encrypted relay, as Excalidraw does it, is proven and nearly free to run. Yjs is the cheapest CRDT if you need field-level merges or collaborative text inside shapes. Loro is the only option with native history, branching and movable trees, but it costs about 4 MB of WASM. A Durable Object per room with hibernation keeps hosting close to $0 at hobby scale.

---

## 6. Rendering options

| Tech | Facts |
|---|---|
| **Canvas2D** | Used by Excalidraw: two stacked canvases plus a per-element bitmap cache (§3). It is simple and good for a hand-drawn look. Without a spatial index, the CPU-bound limit is roughly 5k–14k elements (§3). |
| **DOM/SVG** | Used by tldraw. It gives easy text, accessibility and embeds, and caps out around the default 4000 shapes per page (§4). |
| **WebGL/WebGPU (PixiJS v8, MIT)** | v8 ships WebGPU and WebGL renderers. In Bunnymark (100k sprites), CPU time per frame dropped from about 50 ms to 15 ms with everything moving, and from 21 ms to 0.12 ms when static. The authors caution that WebGPU "does not automatically guarantee improved performance over WebGL" ([blog](https://pixijs.com/blog/pixi-v8-launches)). The bundle is 282 kB gz (bundlephobia **[secondary tool]**). Figma migrated its C++/WASM renderer to WebGPU in 2025 ([blog](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/)). |
| **perfect-freehand** (MIT, 2 kB gz) | `getStroke(points)` returns a polygon outline with pressure simulation, renderer-agnostic ([README](https://github.com/steveruizok/perfect-freehand)). Used by Excalidraw and tldraw. |
| **rough.js** (MIT, 8.9 kB gz) | Sketchy rendering, deterministic with a `seed`. The repo was last pushed 2024-07, so it is effectively in maintenance ([repo](https://github.com/rough-stuff/rough)). |
| **rbush** (MIT, 2.3 kB gz) | R-tree. Bulk insertion is "~2–3 times faster" and gives "~20–30% better" queries afterwards. It is "hundreds of times faster than looping over all items" ([README](https://github.com/mourner/rbush)). tldraw uses it; Excalidraw does not (#10512). |
| **OffscreenCanvas / worker rendering** | Neither Excalidraw nor tldraw renders the scene in a worker. I found no primary benchmarks for whiteboards (**UNVERIFIED** as a performance win for this use case). |

---

## 7. Diagram-as-code and developer integrations

- **@excalidraw/mermaid-to-excalidraw** (MIT, [repo](https://github.com/excalidraw/mermaid-to-excalidraw)):
  - It converts flowcharts (including swimlane-beta), sequence, class, ER and state diagrams, Gantt, quadrant and timeline into editable shapes. Other types are inserted as an image.
  - **It is one-way.** "Excalidraw to Mermaid" is open with no traction ([#8722](https://github.com/excalidraw/excalidraw/issues/8722), 2). An editable Mermaid object is also open ([#4906](https://github.com/excalidraw/excalidraw/issues/4906), 10).
- **tldraw:** has `packages/mermaid` (flowchart, sequence, mindmap; [tree](https://github.com/tldraw/tldraw/tree/main/packages/mermaid)), with open issues for class and ER support. **make-real** is archived ([tldraw/make-real](https://github.com/tldraw/make-real)).
- **D2** (MPL-2.0, about 26k stars, [repo](https://github.com/terrastruct/d2)): its commercial **D2 Studio** advertises **bidirectional editing**, where GUI changes are written back to the D2 text ([d2lang.com/tour/studio](https://d2lang.com/tour/studio)). This is the main prior art for two-way sync. It is closed source.
- **Mermaid** (MIT, about 91k stars) and **PlantUML** (LGPL-3.0): text to SVG only, with no canvas round-trip.
- **MCP servers:**

| Server | Stars | Notes |
|---|---|---|
| [excalidraw/excalidraw-mcp](https://github.com/excalidraw/excalidraw-mcp) | about 5.7k | Official MCP App, remote at `https://mcp.excalidraw.com` |
| [jgraph/drawio-mcp](https://github.com/jgraph/drawio-mcp) | about 5.9k | Official draw.io server |
| [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) | about 2.7k | Community |
| [lgazo/drawio-mcp-server](https://github.com/lgazo/drawio-mcp-server) | about 1.5k | Community |
| [DayuanJiang/next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) | about 37k | AI chat-to-draw.io app |
| Excalidraw+ | n/a | Its pricing lists "MCP and REST API (public beta)" |
| Miro | n/a | Meters MCP calls per day by tier |

- **tldraw MCP feedback:** the Claude.ai tldraw MCP connector "can't see my hand edits to a canvas it created" ([#11151](https://github.com/tldraw/tldraw/issues/11151)). **Agent and human bidirectionality is a live pain point.**
- **excalidraw/cli** (MIT, 2026-10): render, convert Mermaid, export frames as slides and run `excalidraw mcp`. It is "Made for scripts and AI agents" ([repo](https://github.com/excalidraw/cli)).
- **VS Code extension** (MIT, [repo](https://github.com/excalidraw/excalidraw-vscode)): edits `.excalidraw`, `.excalidraw.svg` and `.excalidraw.png`, with the scene embedded in the image. **Git noise complaints:**
  - "Opening an excalidraw diagram changes something inside and shows in git pending" ([#94](https://github.com/excalidraw/excalidraw-vscode/issues/94), 10)
  - "File has changes immediately after opening" ([#129](https://github.com/excalidraw/excalidraw-vscode/issues/129), 7)
  - "Deleted elements persist in PNG exports" ([#178](https://github.com/excalidraw/excalidraw-vscode/issues/178), 8)
- **GitHub rendering:** "Support for displaying Excalidraw files in GitHub Markdown" has **131 upvotes** ([community #12216](https://github.com/orgs/community/discussions/12216)).
- **File formats:**
  - `.excalidraw`: JSON with base64 images inlined (§3). Its `version`, `versionNonce`, `seed` and `updated` fields churn on every edit, which is my inference for why diffs are noisy. innoq gave up on text diffs and renders visual diffs instead **[secondary]** ([innoq](https://www.innoq.com/de/blog/2023/04/draw-the-diff/)).
  - JSON Canvas 1.0: minimal and diff-friendly (§1).

---

## 8. Accessibility and comfort

**tldraw** ([accessibility docs](https://tldraw.dev/sdk-features/accessibility)):

- **Keyboard navigation:**
  - With a shape selected, **Tab and Shift+Tab move through shapes in reading order**.
  - **Ctrl/Cmd+Arrow selects the nearest shape in that direction.**
  - Ctrl/Cmd+Shift+Down/Up moves to the first child or the parent.
  - A "Move focus to canvas" button appears when tabbing into the editor.
- **Screen readers:** a live-region announcer reads "[description], [shape type]. [position] of [total]". Images and videos support `altText`.
- **Reduced motion and assistive tech:**
  - `animationSpeed` follows `prefers-reduced-motion`.
  - `enhancedA11yMode` adds text labels.
  - `areKeyboardShortcutsEnabled: false` disables shortcuts to avoid conflicts with assistive technology.
- **High contrast:** not documented. An open WCAG 2.1/2.2 AA gap audit exists ([#9156](https://github.com/tldraw/tldraw/issues/9156)).

**Excalidraw:**

- The UI has aria labels and `aria-keyshortcuts`, but "support for screen readers presently seems limited mainly to the interface, not the canvas contents" ([#5759](https://github.com/excalidraw/excalidraw/issues/5759)).
- A Deque audit found duplicate IDs and focus issues ([#7492](https://github.com/excalidraw/excalidraw/issues/7492)).
- Windows high-contrast themes break the colour swatches ([#8088](https://github.com/excalidraw/excalidraw/issues/8088)).
- The swatch buttons lack distinct accessible names ([#11641](https://github.com/excalidraw/excalidraw/issues/11641)).
- Keyboard flowchart navigation exists (Alt+Arrow, §3).

**WCAG 2.2 criteria most relevant to a canvas app** ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)):

- **2.1.1 Keyboard (A)** and **2.1.2 No Keyboard Trap (A):** every canvas operation needs a keyboard path, and focus must be able to leave the canvas.
- **2.1.4 Character Key Shortcuts (A):** single-letter shortcuts (R, O, D …) must be able to be turned off, remapped to include a modifier, or active only on focus ([Understanding](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)). This lines up directly with the remappable-keybinding requests (#3852, #7685, #3059).
- **2.5.7 Dragging Movements (AA, new in 2.2):** "All functionality that uses a dragging movement … can be achieved by a single pointer without dragging" unless essential. The Understanding doc gives no blanket exemption for drawing-like tasks such as selecting regions or connecting items ([Understanding](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)). Moving, resizing and connecting need click or keyboard alternatives.
- **Other relevant criteria:**
  - 2.4.7 Focus Visible (AA) and **2.4.11 Focus Not Obscured (Minimum) (AA, new)**: floating toolbars must not cover the focused shape.
  - **2.5.8 Target Size (Minimum) 24×24 (AA, new)**: affects handles and swatches.
  - 1.4.11 Non-text Contrast (AA): affects selection outlines and handles.
  - 1.1.1 Non-text Content (A): alt text for images and diagrams.
  - 4.1.2 Name, Role, Value (A).
  - 2.3.3 Animation from Interactions (AAA): honour reduced motion.

---

## 9. Evidence for candidate novel features

| Idea | Demand evidence | Existing implementations | Verdict |
|---|---|---|---|
| **a. Bidirectional diagram-as-code** (DSL and canvas, git-friendly) | GitHub rendering of Excalidraw files: 131 upvotes ([#12216](https://github.com/orgs/community/discussions/12216)). Git-noise bugs in the VS Code extension ([#94](https://github.com/excalidraw/excalidraw-vscode/issues/94), [#129](https://github.com/excalidraw/excalidraw-vscode/issues/129)). Excalidraw to Mermaid ([#8722](https://github.com/excalidraw/excalidraw/issues/8722), 2) and a Mermaid object ([#4906](https://github.com/excalidraw/excalidraw/issues/4906), 10). Excalidraw as a Mermaid engine ([discussion #10337](https://github.com/excalidraw/excalidraw/discussions/10337), 11). Mermaid paste in tldraw ([#4353](https://github.com/tldraw/tldraw/issues/4353), 27). A user comment calls Excalidraw "not really designed for long-lived, iterative design" ([#2343 comment](https://github.com/excalidraw/excalidraw/issues/2343)). The agent round-trip gap is [tldraw #11151](https://github.com/tldraw/tldraw/issues/11151). | One-way: mermaid-to-excalidraw, @tldraw/mermaid, excalidraw/cli. Two-way: **D2 Studio** (closed, commercial). | **Medium.** Explicit reaction counts are modest, but the dev-integration trend is strong (official CLI and MCP from Excalidraw, draw.io MCP at about 5.9k stars). No OSS tool does true two-way sync, so this is an open lane. |
| **b. Keyboard-first palette + structural navigation** | Customizable keybindings ([#3852](https://github.com/excalidraw/excalidraw/issues/3852), 38). Vim motions ([#6925](https://github.com/excalidraw/excalidraw/issues/6925), 10). Disable/override shortcuts ([#7685](https://github.com/excalidraw/excalidraw/issues/7685), 9). Non-QWERTY ([#3059](https://github.com/excalidraw/excalidraw/issues/3059), 8). Change an existing shape's type ([discussion #8277](https://github.com/excalidraw/excalidraw/discussions/8277), 15). Miro users asking for parent/child keyboard navigation **[secondary/community]** ([miro ideas 3081](https://community.miro.com/ideas/shortcut-key-for-adding-new-child-and-sibling-nodes-3081)). | Excalidraw: command palette plus Ctrl/Cmd+Arrow create and Alt+Arrow navigate (§3). tldraw: command palette plus Tab/Ctrl+Arrow shape navigation (§8). Whimsical: Opt+Arrow. draw.io: Alt+Shift+Arrow. Miro: Tab/Enter in mind maps. | **Medium on demand, crowded on implementation.** The basics are table stakes. The remaining gap is remappable, layout-independent, modal (vim-like) bindings and full keyboard editing of edges and labels. This overlaps with WCAG 2.1.4 and 2.5.7. |
| **c. Board history / time travel / branching** | Version history ([#2343](https://github.com/excalidraw/excalidraw/issues/2343), 5, closed 2020). An accidentally cleared canvas ([discussion #6648](https://github.com/excalidraw/excalidraw/discussions/6648), 6). Excalidraw+ only has "Activity feed" in its backlog **[secondary: search result]** ([roadmap](https://plus.excalidraw.com/roadmap)). | Whimsical (7-day free, 90-day Pro). Liveblocks (24 h on free). tldraw "timeline scrubber" example ([example](https://tldraw.dev/examples/use-cases/timeline-scrubber)). **Ink & Switch Patchwork** prototyped branching and visual diffs on a tldraw-based editor **[research]** ([notebook](https://www.inkandswitch.com/patchwork/notebook/2024-version-control/10/)). Loro offers a Git-like DAG natively. | **Weak to medium.** There are few explicit requests, but it is a strong differentiator when paired with (a) and (f). Loro makes it cheap to build. |
| **d. Auto-layout / tidy-up** | Smart auto-layout ([#11039](https://github.com/excalidraw/excalidraw/issues/11039), 0). Layout dependencies concept ([#294](https://github.com/excalidraw/excalidraw/issues/294), 12). Mind maps (tldraw [#4396](https://github.com/tldraw/tldraw/issues/4396), 11). | Mermaid import already lays out graphs. dagre (MIT, 16 kB gz); **elkjs is EPL-2.0 and 447 kB gz** ([LICENSE](https://github.com/kieler/elkjs/blob/master/LICENSE.md)). | **Weak** as a standalone feature. It is useful as a supporting feature for (a), where layout after code edits is required. |
| **e. 100k+ element performance** | [#7280](https://github.com/excalidraw/excalidraw/issues/7280) (8), [#8136](https://github.com/excalidraw/excalidraw/issues/8136) (5, with benchmarks), [#10512](https://github.com/excalidraw/excalidraw/issues/10512) (3), "infinite zoom" ([discussion #11014](https://github.com/excalidraw/excalidraw/discussions/11014), 6). Obsidian plugin lag ([#865](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/865), 9). | tldraw caps at 4000 shapes per page by default. Excalidraw degrades around 8–14k. Figma and Pixi are GPU-based. | **Weak** as user demand (few reactions), **real** as a technical gap. An R-tree plus level of detail likely reaches 50k+ on Canvas2D (**UNVERIFIED**). Do not lead with 100k. |
| **f. Local-first files on disk + collab** | Self-hosting umbrella ([#1772](https://github.com/excalidraw/excalidraw/issues/1772), 136). Offline Excalidraw+ ([#5827](https://github.com/excalidraw/excalidraw/issues/5827), 14). CLI ([#1261](https://github.com/excalidraw/excalidraw/issues/1261), 40, now shipped). Obsidian Canvas and the Excalidraw plugin (about 7.9k stars) prove the local-vault pattern. **tldraw office** (July 2026) is the closest product: local `.tldraw` files, agents and LAN multiplayer, but no external-change merging. | Obsidian Canvas (JSON Canvas), tldraw office, the VS Code extension, draw.io desktop. | **Strong.** This is the best-evidenced gap. Nobody combines plain diffable files, folder-as-workspace, git-safe merges and real-time collab over a self-hostable or P2P relay. |
| **g. Embedding live code / terminal / data** | Code blocks ([#9456](https://github.com/excalidraw/excalidraw/issues/9456), 25; [#10036](https://github.com/excalidraw/excalidraw/issues/10036), 24). Custom components and Tiptap ([discussion #7350](https://github.com/excalidraw/excalidraw/discussions/7350), 12). Table ([#4847](https://github.com/excalidraw/excalidraw/issues/4847), 327). Open-source tldraw Computer ([#5122](https://github.com/tldraw/tldraw/issues/5122), 10). | Excalidraw iframe embeddables. tldraw embed shapes and office scripts. **Observable Canvases** (data nodes on a tldraw canvas, GA 2025) **[vendor blog]** ([blog](https://observablehq.com/blog/introducing-canvases-early-access)). | **Medium.** Static code blocks and tables are strongly requested. Live execution is niche and taken by Observable and tldraw office. Ship code blocks with syntax highlighting and tables first. |
| **h. AI features (and backlash)** | For: Excalidraw+ AI quotas, an "AI draws what I prompt" issue ([#11218](https://github.com/excalidraw/excalidraw/issues/11218), 7), base-URL/BYOK requests ([#7775](https://github.com/excalidraw/excalidraw/issues/7775), 4; [#8264](https://github.com/excalidraw/excalidraw/issues/8264), 2), local AI ([discussion #8239](https://github.com/excalidraw/excalidraw/discussions/8239), 13). Against: Miro "No AI" idea, 29 votes and 13 replies (2026-01), with users saying it is "unbearable to the point of me looking for a different online whiteboard tool" **[community]** ([idea](https://community.miro.com/ideas/no-ai-27436)). "Switch off all AI" thread ([27140](https://community.miro.com/ask-the-community-45/switch-off-all-ai-features-27140)). Per-feature AI control in Miro needs admins or the Enterprise Guard add-on **[secondary: search summary]** ([help](https://help.miro.com/hc/en-us/articles/30884038804114-Block-Miro-AI-usage-with-Intelligent-Guardrails)). OSS community hostility to AI-generated PRs (tldraw [#7695](https://github.com/tldraw/tldraw/issues/7695)). | Everyone: Excalidraw TTD chat, Miro, FigJam credits, Whimsical agent connectors, MCP servers. | **Medium, with an asymmetric stance.** Build no built-in AI UI. Expose an MCP/CLI and a plain file format so users bring their own agent, and make "no AI by default" a selling point. |
| **i. Presentation / frames-to-slides** | Presentation mode ([#253](https://github.com/excalidraw/excalidraw/issues/253), 21, shipped in Plus). Export presentation to PDF ([#6949](https://github.com/excalidraw/excalidraw/issues/6949), 18). Plus PPTX aspect-ratio complaint ([#8509](https://github.com/excalidraw/excalidraw/issues/8509), 2). Obsidian slideshow export ([#1580](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1580), 9). Animations ([#10986](https://github.com/excalidraw/excalidraw/issues/10986)). | Excalidraw+ (paid), excalidraw/cli `--all-frames`, the Obsidian plugin, tldraw presentation example, draw.io "Present to Everyone". | **Medium.** It is behind a paywall in Excalidraw, so a free and local version is a cheap win. |
| **j. Text-heavy note + diagram hybrid** | **The strongest cluster in the data.** Text highlighting (243), text range colours (170), LaTeX (87), rich text (38), text formatting discussion (45), Markdown in text (Obsidian plugin [#178](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/178), 16), tldraw advanced Markdown ([#1736](https://github.com/tldraw/tldraw/issues/1736), 14), tables (327). | Obsidian Canvas (Markdown cards), tldraw rich text (TipTap-based, `rich-text.mdx` in docs), Whimsical docs+boards. | **Strong.** Rich and Markdown text inside shapes, tables, code blocks and math are the most-reacted gaps in Excalidraw, the main OSS hand-drawn tool. |

---

## 10. Summary of gaps

- **Rich text in an OSS hand-drawn whiteboard.** This covers range colouring and highlighting, Markdown, code blocks with syntax highlighting, LaTeX and tables. Excalidraw's top open requests total over 1,000 reactions (#4847, #5138, #1126, #5265, #6678, #9456/#10036), and they have stayed open for years.
- **Truly open-source, embeddable SDK quality.** tldraw's editor needs a production license key and a discretionary hobby license with a watermark (since 4.0). Excalidraw is MIT but React-only and monolithic; for example, the Svelte request has 32 reactions ([#6718](https://github.com/excalidraw/excalidraw/issues/6718)). Note that tldraw's signals and store packages are MIT and reusable.
- **Easy self-hosting with collab.** Excalidraw needs a client, excalidraw-room, a JSON store and Firebase ([#1772](https://github.com/excalidraw/excalidraw/issues/1772), 136 reactions, open since 2020). A single-binary or single-Durable-Object deploy, or a P2P mode with a relay fallback, is unserved. ihatepdf proves the appeal of P2P but has poor handshake UX and no TURN.
- **Local-first, git-friendly files plus collab.** Users want diagrams in repos (131 upvotes for GitHub rendering), but files churn on open (VS Code #94, #129). There is no OSS tool with stable, minimal-diff serialisation, a folder-as-workspace model, external-change merging and real-time collab. tldraw office is closest, but it does not merge external or git changes and its repo has no license.
- **Two-way diagram-as-code.** Every OSS path (Mermaid to Excalidraw, Mermaid to tldraw, the CLI) is one-way. Only the closed D2 Studio round-trips. The agent round-trip gap is concrete (tldraw #11151).
- **Customisable, layout-independent keyboard control.** Remapping, non-QWERTY layouts, vim-like modes and WCAG 2.1.4 compliance are open in Excalidraw (#3852, #3059, #6925, #7685). The basic create-connected and navigate features already exist everywhere, so they alone will not differentiate.
- **Scale beyond about 5–10k elements on a sketchy renderer.** Excalidraw has no spatial index (#10512) and tldraw defaults to a 4000-shape cap. There is modest user demand but a clear technical gap; an R-tree plus level of detail is low-cost.
- **Free presentation mode and PDF export.** In Excalidraw these are paywalled or delayed (#253, #6949, #1800).
- **AI-optional positioning.** Vocal users want AI off (Miro "No AI"), while developers want bring-your-own-agent access (MCP, CLI, BYOK base URLs). An agent-accessible file format and MCP, with no built-in AI UI, meets both.
- **Canvas accessibility.** Only tldraw has shape-level screen-reader announcements and Tab navigation. Excalidraw's canvas content is invisible to assistive tech (#5759), and both lack documented high-contrast support.
