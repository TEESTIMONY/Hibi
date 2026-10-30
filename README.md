# Hibi

A personal planner using HTML, CSS, and standard JavaScript modules. No framework, package installation, or external JavaScript dependencies are required. A local Node backend now handles AI planning and shared sources.

## Run locally

Install Node.js 20.12 or newer, open this folder in VS Code, and run:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. Refresh after editing files. Use this server rather than opening HTML directly: browsers load JavaScript modules over HTTP.

## Structure

```text
Hibi/
├── index.html                  # Application shell; no inline handlers
├── src/
│   ├── main.js                 # Startup, events, and coordination
│   ├── components/
│   │   ├── dashboard.js        # Heading, week strip, progress
│   │   ├── icons.js            # Shared SVG definitions
│   │   ├── navigation.js       # Sidebar views and projects
│   │   ├── task-editor.js      # Dialog and form handling
│   │   └── task-list.js        # Task groups, rows, checklists
│   ├── data/defaults.js        # Initial example data
│   ├── domain/tasks.js         # Pure task rules and filtering
│   ├── services/storage.js     # Browser persistence boundary
│   ├── state/store.js          # Observable application state
│   ├── styles/
│   │   ├── index.css           # Fonts and stylesheet order
│   │   ├── base.css            # Foundation, layout, controls
│   │   └── workspace.css       # Visual treatment, dark mode, responsive rules
│   └── utils/
│       ├── dates.js           # Lagos date and week calculations
│       └── dom.js             # DOM lookup, escaping, notifications
├── server/                     # Local AI backend; see docs/AI-PLANNING.md
├── public/                     # Installable-app manifest, worker, and icon
├── docs/AI-PLANNING.md          # AI setup, sharing requirements, architecture
├── scripts/
│   ├── dev-server.js          # Local static server
│   ├── build.js               # Generate deployment output
│   └── check.js               # Syntax and import checks
├── tests/                     # Task, persistence, state, and date tests
├── dist/                      # Generated output; do not edit
├── .openai/hosting.json        # Original Site deployment identity
└── package.json                # Development commands
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Serve editable source on port 5173 |
| `npm run check` | Check syntax and relative module imports |
| `npm test` | Run Node's built-in test runner |
| `npm run build` | Generate dist from index.html and src |
| `node scripts/dev-server.js --dist` | Preview generated output |

Set the PORT environment variable to change the port. Building replaces generated files inside this project's dist folder. No bundling or minification is needed for the current application.

## Architecture

main.js restores data, creates the store, and connects UI events to state changes. Components render state. Domain functions have no browser dependencies and are independently testable. The editor receives callbacks instead of accessing globals. Events on dynamic lists are delegated once, rather than rebound after rendering.

Only services/storage.js knows the persistence keys and serialization format. It is the boundary to replace when adding a backend. The CSS loads base styles before workspace styles to preserve the existing design and keep the cascade predictable. Styles are expanded and formatted for editing.

## AI planning and data

Choose **Plan with AI** to combine messages, documents, and voice into a reviewed task plan. Configure your server-side OpenAI API key in .env and restart npm run dev. See [AI setup and architecture](docs/AI-PLANNING.md) for formats, limits, sharing, and implementation details.

Planner tasks remain in the browser's daylight-v1 localStorage key. A different hostname or port has separate data. Raw AI sources stay in page memory until explicitly submitted; accepted tasks store their source names and planning notes.

There is now a local Node HTTP backend in server/ for OpenAI requests and multipart share intake. It is bound to localhost and is not a public production API. No account database, multi-user authentication, or cross-device sync has been added.

## Deployment

The old .openai/hosting.json describes the original static Site. AI now requires a backend: do not publish dist alone and expect model calls or phone sharing to work. A future HTTPS deployment needs authentication and origin configuration. Running dev or build does not publish.

The app opens with a minimal logo-and-name screen before revealing the planner. The launch component is in src/features/launch.js and its styles are in src/styles/launch.css.
