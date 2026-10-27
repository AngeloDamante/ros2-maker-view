# ROS2 Maker View

A maker of web views for ROS 2: put widgets on a grid to read topics, plot them, color bars by
limits, publish messages, call services and set node parameters — no code. Views can have several
pages, are saved as JSON files in this repository and can be exported as a single standalone
HTML file.

Views are designed **offline** and used later, when you start foxglove_bridge with the right ROS
environment and press **Connect**. The bridge is not managed by this project, and views never
connect on their own.

```
 browser ──HTTP──▶ server/index.ts (Node)  : the maker (editor + views/*.json)
    │
    └──WebSocket──▶ foxglove_bridge (started by you) ──▶ ROS 2
```

Message types are decoded and encoded from the schemas the bridge advertises, so custom messages
work without any code here.

## Requirements

| What | Version | Notes |
|---|---|---|
| Node.js | **≥ 22.18** (24 LTS recommended) | Runs the TypeScript server directly. The Ubuntu `nodejs` package (v12) is too old: use [nvm](https://github.com/nvm-sh/nvm) (`nvm install 24`). |
| npm | bundled with Node | |
| Browser | recent Chrome / Chromium (tested), Firefox | |
| foxglove_bridge | 3.x (tested with 3.4.3) | Only to *use* the views. `sudo apt install ros-$ROS_DISTRO-foxglove-bridge` |
| ROS 2 | Humble or newer | Only to use the views. |
| Python 3 + rclpy | from the ROS installation | Only for the demo node `tools/demo_node.py`; no virtualenv needed. |

## Install

```bash
nvm use 24            # or any Node >= 22.18
npm install
npm run build         # bundles the app into a single dist/index.html
```

## Start the maker

```bash
npm start             # http://localhost:8080 (also reachable from the LAN)
```

or, to start it if needed and open the browser:

```bash
./maker-view.sh          # view list
./maker-view.sh demo     # a view directly
./maker-view.sh --help
```

Server options: `node server/index.ts --port 8080 --host 0.0.0.0 --views ./views --readonly`
(also `PORT`, `HOST`, `RMV_VIEWS_DIR`, `RMV_READONLY=1`).

## Workflow

1. **Design offline.** Create a view, add pages and widgets, write topic names, field paths and
   message types by hand. Nothing needs to be running except the maker.
2. **Use it on the robot.** Start foxglove_bridge yourself, in the ROS environment that knows your
   message types, e.g.
   ```bash
   source <your_ws>/install/setup.bash
   ros2 launch foxglove_bridge foxglove_bridge_launch.xml port:=8765
   ```
   Open the view and press **Connect** in the header (views always open disconnected; if the
   bridge is not reachable or the connection drops, the header says so and you connect again).
   The default URL is the view's `bridgeUrl`, otherwise `ws://<page host>:8765`; it can be changed
   in the header or with `?bridge=ws://host:port` (`./maker-view.sh demo --bridge ws://robot:8765`).
3. **Refine while connected.** With the bridge up, the editor suggests topics, types, nodes,
   services and the fields of each message, and can fill message templates from the schema.

The bridge's default configuration enables everything the views use: `clientPublish`,
`parameters`, `parametersSubscribe` and `services`.

## Using the editor

- **Home** lists the views in `views/`: create, import (`.json` or an exported `.html`), duplicate, export, delete.
- **Edit** switches the view to edit mode and opens the **widget panel** on the left: drag a
  widget onto the page where you want it (or click it to add it at the bottom). ⚙ opens a
  widget's configuration (changes apply live); drag a widget by its title bar to move it, resize
  it from the bottom-right corner. Sections and dividers have no title bar: drag them anywhere,
  their ⚙ ⧉ ✕ buttons appear on hover.
  Pages: ＋ adds one, double-click a tab (or ✎) to rename, ◀ ▶ reorder, ✕ delete.
- **Save** (Ctrl+S) writes `views/<id>.json`. **⋯ → Export standalone HTML** downloads a single file.
- **☾ Dark / ☀ Light** in the top bar switches the theme (light by default; the choice is remembered by the browser).

### Widgets

| Widget | Use |
|---|---|
| **Value** | Big readout of a field (number, text, bool), with unit, decimals, scale/offset. |
| **Bar** | Horizontal/vertical bar colored by thresholds (e.g. ok < 0.6 ≤ warn < 0.8 ≤ bad), optional absolute value. |
| **State indicator** | Maps discrete values (states, enums, booleans) to label + color; single lamp or stepper with all states. |
| **Plot** | Multi-series time plot, 5 s – 5 min window, pause/hover readout, reference lines, step lines; series may come from different topics. |
| **Raw message** | Latest message (or a sub-field) as JSON, like `ros2 topic echo`. |
| **Event log** | App events (connection, publishes, parameter results) and/or `/rosout`, filterable by node and level. |
| **Publisher form** | Form generated from the message type; publish once, or Start/Stop at a rate. |
| **Buttons** | One or more buttons each publishing a fixed message (commands, mode selector, presets); optional two-click confirmation; once per click or on/off at a rate. |
| **Slider / setpoint** | Numeric setpoint with slider, input and presets, optional measured feedback topic; once per change or Stream/Stop at a rate. |
| **Service call** | Calls a service (e.g. `std_srvs/Trigger`) with a request form and shows the response. |
| **Parameters** | Reads and sets a node's parameters. |
| **Section** | Title followed by a line, to separate the blocks of a page (color, line style, size; `${var}` allowed). |
| **Divider** | Horizontal or vertical line, solid/dashed/dotted, any thickness and color. |
| **Text / heading** | Titles and notes. |

### Topic, node and field names

- Absolute names (`/ns/topic`) are used as they are. **Relative names** (`arm/joint_1/current`)
  match the first advertised topic equal to `/<name>` or ending with `/<name>`, so a view keeps
  working if the robot runs under another namespace. The same applies to nodes and services.
- Fields use paths: `data`, `pose.position.x`, `ranges[0]`, `points[-1].y`.
- Publishers need the **message type** (e.g. `std_msgs/msg/Float64`) when the topic is not in the
  ROS graph yet; set it in the widget when designing offline, otherwise it is taken from the topic.
- **Auto stamp** sets every `stamp` field (e.g. `header.stamp`) to the current time.

### Variables

A view can define variables shown as selectors in the header, and use `${name}` in topics,
fields, nodes, services, titles and message templates — one view for several identical devices.
Each option can set extra variables (**View settings → Variables**, one option per line):

```
left;  label=Left arm;  dev_id=21
right; label=Right arm; dev_id=22
```

In message templates a value made only of a reference (`"${dev_id}"`) becomes a number or
boolean when it looks like one, so `{"id": "${dev_id}"}` publishes `{"id": 21}`.
See `views/demo_multi.json`.

### Publishing at a rate

Publisher form, Buttons and Slider have a **Rate [Hz]** field:

- **empty** — no rate: each action (click, Enter, slider release, preset) publishes one message;
- **set** (e.g. `10`) — the widget becomes an **on/off switch** that publishes continuously:
  - *Publisher form*: **▶ Start N Hz / ■ Stop** sends the current form values (edits apply to the next messages);
  - *Buttons*: a click starts publishing that button's message, a second click stops it; clicking
    another button switches to its message (one button at a time, since they share the topic);
  - *Slider*: **▶ Stream N Hz / ■ Stop** sends the current value; moving the slider changes it live.

A running widget pulses and shows the number of messages sent. Publishing stops on Stop, on
Disconnect, on a publish error, and when the page or view is left. Rates are timed by the
browser: reliable up to a few tens of Hz (up to 200 accepted), and throttled to about 1 Hz while
the browser tab is in the background — use a ROS node for precise or high-rate streams.

### Parameters

The widget lists all parameters of a node (or the ones you list) and sets them with the right
type (doubles stay doubles even when written as `2`). foxglove_bridge does not report *why* a set
fails: when the node keeps the old value the widget shows **rejected** (read-only parameter, wrong
type, or refused by the node's callback); the reason is in the bridge log.

## Standalone export

`dist/index.html` is the whole app in one file with an empty view slot. Exporting fills the slot:

```bash
npm run build
npm run export -- demo                     # -> exports/demo.html
npm run export -- views/demo.json -o /tmp/demo.html
```

or **⋯ → Export standalone HTML** in the browser. The exported file opens directly from disk
(`google-chrome exports/demo.html`); **Connect** uses `ws://localhost:8765` by default (or `?bridge=…`).
It can still be edited: **Save HTML** downloads an updated copy. Import it on the Home page to get
the JSON back. `exports/` is git-ignored; the JSON in `views/` is the source of truth.

## Examples and demo node

- `views/demo.json` — every widget type.
- `views/demo_multi.json` — the same node type twice, selected with a variable.

Both run against `tools/demo_node.py` (topics `sine`, `battery`, `state`, `position`, `setpoint`,
`enable`, service `reset`, parameters including a read-only one):

```bash
source /opt/ros/humble/setup.bash
python3 tools/demo_node.py &                                    # node /rmv_demo
python3 tools/demo_node.py --ros-args -r __node:=rmv_demo_b &   # second node, for demo_multi
ros2 launch foxglove_bridge foxglove_bridge_launch.xml
```

## Development

```bash
npm run dev          # server + Vite with hot reload on http://localhost:8080
npm test             # unit tests (node:test)
npm run typecheck
```

```
server/index.ts       HTTP server, views API, static files / Vite middleware
server/views.ts       views/*.json storage (atomic writes)
server/export.ts      standalone export CLI
src/bridge/client.ts  foxglove_bridge protocol client (shared subscriptions, publish, params, services)
src/bridge/schema.ts  ROS 2 schemas: parsing, default messages, field paths, stamps
src/widgets/          one file per widget + registry (index.ts)
src/components/       view editor, configuration form, home page
views/                saved views
tools/demo_node.py    demo node for trying every widget
maker-view.sh         starts the maker and opens the browser
```

**Adding a widget:** create `src/widgets/MyWidget.tsx` exporting a `WidgetDef` (component, default
config, size and a list of configuration fields — the form is generated from it) and add it to
`WIDGETS` in `src/widgets/index.ts`. `useTopic(topic)` gives the latest message, `useBridge()` the
client for publishing.

API: `GET /api/views`, `GET|PUT|DELETE /api/views/<id>`, `GET /api/views/<id>/export`,
`POST /api/export/<id>`, `GET /api/info`.

## Notes and limitations

- The server has no authentication and listens on all interfaces so the views can be opened from
  other machines: on an untrusted network use `--host 127.0.0.1` or `--readonly`.
  Anyone who can reach foxglove_bridge can publish on any topic.
- Messages are published as JSON when the bridge supports it (foxglove_bridge 3.x does), CDR otherwise.
- Plots keep the last 10 minutes in memory, timestamped on reception in the browser.
- If the bridge prints "Adding node … to the ignore list", it stops querying that node's
  parameters until it is restarted (it happens when a node is slow to answer at startup).
