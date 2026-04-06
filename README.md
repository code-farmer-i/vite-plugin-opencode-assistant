# vite-plugin-opencode

A Vite plugin that embeds OpenCode Web UI in your development environment, enabling real-time code modification through AI chat.

## Features

- 🚀 **Auto-start OpenCode services** - Automatically starts OpenCode Server and Web UI
- 💬 **Embedded Chat Interface** - Customer support-like chat widget in your app
- 🔄 **Real-time Code Modification** - AI can modify your code and see changes instantly via HMR
- 🎨 **Customizable** - Configurable position, theme, and behavior
- ⚡ **Zero Configuration** - Works out of the box with sensible defaults
- 🔧 **Framework Agnostic** - Works with React, Vue, Svelte, and more

## Installation

```bash
npm install -D vite-plugin-opencode
```

## Prerequisites

This plugin requires [OpenCode](https://opencode.ai) to be installed on your system.

### Install OpenCode

**Using Homebrew (macOS):**
```bash
brew install opencode-ai/tap/opencode
```

**Using the install script:**
```bash
curl -fsSL https://raw.githubusercontent.com/opencode-ai/opencode/main/install | bash
```

**Using Go:**
```bash
go install github.com/opencode-ai/opencode@latest
```

## Usage

### Basic Setup

Add the plugin to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import opencode from 'vite-plugin-opencode'

export default defineConfig({
  plugins: [
    opencode(),
  ],
})
```

### With Configuration

```typescript
import { defineConfig } from 'vite'
import opencode from 'vite-plugin-opencode'

export default defineConfig({
  plugins: [
    opencode({
      serverPort: 4096,      // OpenCode Server port
      webPort: 4097,         // OpenCode Web UI port
      hostname: 'localhost',
      position: 'bottom-right',
      theme: 'auto',
      open: false,
      autoReload: true,
    }),
  ],
})
```

### Start Development

```bash
npm run dev
```

You'll see a floating button in the bottom-right corner of your app. Click it to open the AI chat interface!

## How It Works

```
┌─────────────────────────────────────────────────┐
│           Vite Dev Server (5173)                │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │   Your App (with HMR)                     │ │
│  │   - Embedded OpenCode Widget              │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │   vite-plugin-opencode                    │ │
│  │   - OpenCode Server (4096)                │ │
│  │   - OpenCode Web (4097)                   │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Workflow

1. **User** asks AI to modify code (e.g., "Change button color to red")
2. **OpenCode Web** sends request to OpenCode Server
3. **OpenCode Server** reads and modifies the file
4. **Vite HMR** detects file change and hot-reloads the page
5. **User** sees the change instantly!

## Configuration Options

```typescript
interface OpenCodeOptions {
  // Enable/disable the plugin (default: true)
  enabled?: boolean
  
  // OpenCode Server port (default: 4096)
  serverPort?: number
  
  // OpenCode Web UI port (default: 4097)
  webPort?: number
  
  // Hostname (default: 'localhost')
  hostname?: string
  
  // Widget position (default: 'bottom-right')
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  
  // Theme (default: 'auto')
  theme?: 'light' | 'dark' | 'auto'
  
  // Auto-open chat window (default: false)
  open?: boolean
  
  // Enable auto-reload notifications (default: true)
  autoReload?: boolean
}
```

## Examples

### React

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import opencode from 'vite-plugin-opencode'

export default defineConfig({
  plugins: [
    react(),
    opencode(),
  ],
})
```

### Vue

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import opencode from 'vite-plugin-opencode'

export default defineConfig({
  plugins: [
    vue(),
    opencode(),
  ],
})
```

## Use Cases

### 1. Style Modifications
```
User: "Change the button color to red"
AI: Modifies App.css
Result: Button turns red instantly
```

### 2. Component Creation
```
User: "Add a login form"
AI: Creates LoginForm.jsx
Result: Login form appears on page
```

### 3. Bug Fixes
```
User: "Fix the counter not working"
AI: Modifies App.jsx
Result: Counter works correctly
```

## API

The plugin exposes a global API that you can use in your code:

```javascript
// Open the chat widget
window.OpenCodeWidget.open()

// Close the chat widget
window.OpenCodeWidget.close()

// Toggle the chat widget
window.OpenCodeWidget.toggle()

// Show a notification
window.OpenCodeWidget.showNotification('Code updated!')
```

## Keyboard Shortcuts

- `Ctrl/Cmd + K` - Toggle chat widget

## Troubleshooting

### OpenCode not installed

If you see an error message about OpenCode not being installed, follow the installation instructions above.

### Port conflicts

If ports 4096 or 4097 are already in use, you can configure different ports:

```typescript
opencode({
  serverPort: 5000,
  webPort: 5001,
})
```

### CORS issues

The plugin automatically configures CORS for local development. If you encounter CORS issues, make sure you're using the correct hostname and ports.

## Development

### Build the plugin

```bash
npm run build
```

### Run tests

```bash
npm test
```

### Run the example

```bash
cd example
npm install
npm run dev
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Links

- [OpenCode Documentation](https://opencode.ai/docs)
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
- [Vite Plugin API](https://vite.dev/guide/api-plugin.html)

## Acknowledgments

This plugin is built on top of [OpenCode](https://opencode.ai), an open-source AI coding assistant.
