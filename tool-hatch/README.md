# ToolHatch

An independent local-first Go + Wails v3 desktop utility with a compact Mantine/React/Vite frontend. The String tab currently exposes only **Avro JSON → Plain JSON**. Input and Namespace Prefix changes run automatically through Go; check **Manual apply** to run only with **Apply**. Output is read-only, with green Done or a red failure reason. Copy actions and System/Light/Dark themes remain; text is not persisted.

The converter recursively unwraps recognized Avro union labels using documented type/value-shape rules. It preserves ambiguous objects, precision-sensitive numbers, field order and schema-like definitions. Conversion is **schema-free and best-effort**, not guaranteed equivalent to full Avro deserialization; metadata warnings are displayed under the status. No schema input/resolution, schema normalization or Avro Parsing Canonical Form is implemented.

Examples: {"string":"hello"} becomes the JSON string "hello"; {"long":9007199254740993} becomes 9007199254740993. Unknown single-key business objects keep their keys. Set optional **Namespace Prefix** below Input to restrict named-type unwrapping (for example, com.example. matches com.example.Address). Empty uses the original automatic detection of qualified names and narrow PascalCase-like simple names. A nonempty prefix uses only literal matching, without heuristic fallback; primitives convert in either mode. Configured-prefix matching is exact, literal and case-sensitive, without trimming, regex or automatic separators; record/enum value-shape checks still apply. Nonmatching object keys remain, with recursive conversion of nested values; ambiguous/mismatched cases are preserved and reported. Actual map/record payload containers remain intact.

Each editor header copies its entire current string through the native clipboard. Output Copy is enabled only for a current successful result. Native selection/keyboard copying remain available; prefix text is not included in editor copies or persisted. Mantine persists only the theme preference.

## Prerequisites

- Go 1.26 or later and Wails CLI **v3.0.0**.
- Node 24.x recommended (`frontend/.nvmrc`); supported declaration: Node 22.12+ within 22.x, 24.x, or 26+. npm uses the committed lockfile.
- macOS: Xcode Command Line Tools; this scaffold targets macOS 12+. Windows: WebView2 Runtime. Linux: C compiler, pkg-config, GTK4 and WebKitGTK 6.0 development libraries.

Consult the official [installation requirements](https://v3.wails.io/getting-started/installation/) for your platform, then install the pinned CLI:

```sh
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0
# Ensure $(go env GOPATH)/bin is on PATH.
wails3 doctor
```

## Develop and build

Run from `tool-hatch/`, independently of `base-extension/`:

```sh
go mod download
wails3 dev
```

The development workflow generates bindings, installs frontend dependencies with `npm ci`, builds Go in development mode, starts Vite on loopback port 9245, and launches the native window. Frontend changes use Vite; Go changes rebuild the application. To change the port, use `wails3 dev -port 9246`.

```sh
wails3 build       # production frontend and native executable in bin/
wails3 task run    # launch the built application
# macOS only, optional: create a local .app without launching it
wails3 task mac:bundle
```

On macOS, the run task creates and ad-hoc signs `bin/ToolHatch.app`. No separate Task installation is needed; `wails3` runs the Taskfile.

## macOS distribution

On macOS with Xcode Command Line Tools, build both Apple Silicon and Intel binaries, combine them with `lipo`, create the complete bundle, ad-hoc sign it, and archive it:

```sh
wails3 task darwin:package:zip
python3 scripts/verify-macos-archive.py bin/ToolHatch-macos-universal.zip
```

The existing Taskfile follows the [Wails v3 Universal packaging pattern](https://v3.wails.io/guides/build/macos/), building architectures sequentially while sharing generated frontend assets. The ZIP contains `ToolHatch.app`, including its executable, bundle metadata and signature. `ditto` preserves bundle structure and executable permissions. Verification extracts the actual archive and checks identity, both architectures, code signature and absence of workspace/development documents. Only this ZIP is distributed; the raw executable is not an application bundle.

The app is **ad-hoc signed and not Apple-notarized**. No paid Apple credentials are required. Downloaded copies may be blocked by Gatekeeper; after verifying the source, users can follow Apple's normal [Open Anyway procedure](https://support.apple.com/en-us/102445). Managed Macs may prohibit opening it. Compatibility with older macOS versions and native Intel execution still require runtime checks; a deployment target and two compiled slices alone do not prove them.

## Automatic GitHub releases

The repository workflow [toolhatch-release.yml](../.github/workflows/toolhatch-release.yml) runs on every push to `main`, including direct pushes and merged pull requests, with no path filters. One macOS job checks out the triggering commit (`github.sha`), installs pinned Go 1.26.4, Node 24.22.2, npm 10.9.2 and Wails 3.0.0, then runs the existing Universal packaging task. That task uses `npm ci`, generates bindings, builds both architectures and verifies the signed app ZIP. Go tests/vet and frontend tests must pass before publication.

The runner's GitHub CLI publishes `ToolHatch-macos-universal.zip` using the built-in `github.token` with `contents: write`. Tags use `toolhatch-<github.run_id>`, target the triggering commit, and stay unchanged on rerun. If that release already exists, publication is skipped without modifying its assets. GitHub generates release notes; these releases do not replace another project's repository-wide Latest label. No PR-event handling, custom publisher, manifest transfer or concurrency management is needed.

The workflow must be present on `main`, and repository/org policy must allow Actions and release/tag creation by its built-in token. A real hosted run is still needed to verify those permissions and publication. Interrupted publication may require inspecting/removing an incomplete release manually before retrying; there is no automatic draft recovery. No tag or release is created while implementing or locally verifying this workflow. Distribution remains ad-hoc signed and not notarized.

## Source layout

- `main.go`: embedded frontend, Wails service registration and one window.
- `stringservice.go`: processing dispatch, retained legacy operations and response metadata.
- `avrojson.go`: ordered schema-free union-wrapper conversion and warnings.
- `stringservice_test.go`, `avrojson_test.go`: legacy operation, conversion/boundary and response-contract checks.
- `frontend/`: React components, CSS, generated binding imports, npm lockfile, Vite and focused UI tests.
- `Taskfile.yml`, `build/config.yml`: native build and development workflow.
- `build/darwin/Info.plist`: ToolHatch bundle identity, identifier `io.github.shadowonder.toolhatch` (bundle version currently 0.1.0; push releases use separate run identifiers).
- `scripts/`: macOS archive verification used by the existing packaging task.

`frontend/bindings/`, `frontend/dist/`, `frontend/node_modules/`, `.task/` and `bin/` are generated and ignored. Do not hand-edit bindings. Run `wails3 build` before standalone `go vet ./...` or `go build`; Go embeds the generated frontend. `npm run build` alone requires bindings to have been generated first.

## Verification

After `wails3 build` has finished generating bindings and frontend assets (do not run Go checks concurrently with it):

```sh
go test ./...
go vet ./...
cd frontend
npm test
```

Tests retain legacy operations and cover primitive/named wrappers, map/record containers, ambiguity/schema preservation, precision/order, malformed JSON, response warnings, literal namespace matching/empty-prefix/nested preservation, prefix automatic/manual behavior, request ordering/failures, clipboard, themes and StrictMode replay. UI tests mock the Wails boundary; native launch checks are separate. Windows/Linux and real GitHub publication remain unverified. Current native test evidence and limitations live in the local ignored workspace status/history.

The Go response is `{ result, metadata: { operation, success, message } }`. Preserve this contract; metadata is also reserved for future optional content information such as JSON detection and format details, which are not implemented yet. The optional warnings string array is implemented for best-effort conversion limits; required outcome fields remain unchanged. Input/operation/mode changes clear previous output and invalidate in-flight requests; only the latest applicable response can update the interface.

Official reference: [first application and build workflow](https://v3.wails.io/getting-started/your-first-app/).
