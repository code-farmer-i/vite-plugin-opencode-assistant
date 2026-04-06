import { spawn, ChildProcess } from 'child_process'
import { waitForServer } from '../vite/utils.js'
import { WebOptions } from '../types.js'
import { SERVER_START_TIMEOUT, LOG_PREFIX } from '../constants.js'
import { createLogger, PerformanceTimer } from '../logger.js'
import path from 'path'
import fs from 'fs'

const log = createLogger('Web')

export async function startOpenCodeWeb(options: WebOptions): Promise<ChildProcess> {
  const timer = log.timer('startOpenCodeWeb', { 
    port: options.port, 
    hostname: options.hostname 
  })
  
  const { port, hostname, cwd, configDir, corsOrigins, contextApiUrl } = options

  log.debug('Creating state directory', { cwd })
  const stateDir = createStateDirectory(cwd)
  timer.checkpoint('State directory created')

  const pluginPath = path.join(stateDir, 'plugins', 'page-context.js')
  log.debug('Building process environment', { 
    stateDir, 
    configDir, 
    contextApiUrl, 
    pluginPath 
  })
  const env = buildProcessEnv(stateDir, configDir, contextApiUrl, pluginPath)
  timer.checkpoint('Environment built')

  const args = [
    'serve',
    '--port', String(port),
    '--hostname', hostname,
  ]

  if (corsOrigins && corsOrigins.length > 0) {
    corsOrigins.forEach(origin => {
      args.push('--cors', origin)
    })
    log.debug('CORS origins added', { origins: corsOrigins })
  }

  log.debug('Spawning OpenCode process', { 
    command: 'opencode', 
    args: args.join(' '),
    cwd 
  })
  
  const proc = spawn('opencode', args, {
    cwd,
    stdio: 'pipe',
    env,
  })
  
  timer.checkpoint('Process spawned')

  setupProcessHandlers(proc, port, hostname)

  log.debug('Waiting for server to be ready', { 
    url: `http://${hostname}:${port}`,
    timeout: SERVER_START_TIMEOUT 
  })
  await waitForServer(`http://${hostname}:${port}`, SERVER_START_TIMEOUT)
  
  timer.checkpoint('Server ready')

  console.log(`\n\x1b[36m\x1b[1m${LOG_PREFIX}\x1b[0m ✨ OpenCode server started successfully\n`)

  timer.end(`✓ Process PID: ${proc.pid}`)
  return proc
}

function createStateDirectory(cwd: string): string {
  const stateDir = path.join(cwd, 'node_modules', '.cache', 'opencode')
  
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true })
    log.debug('Created state directory', { stateDir })
  }
  
  return stateDir
}

function buildProcessEnv(stateDir: string, configDir?: string, contextApiUrl?: string, pluginPath?: string): Record<string, string> {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined)
    ) as Record<string, string>,
    XDG_STATE_HOME: stateDir,
  }

  if (configDir) {
    env.OPENCODE_CONFIG_DIR = configDir
    log.debug('Set OPENCODE_CONFIG_DIR', { configDir })
  }

  if (contextApiUrl) {
    env.OPENCODE_CONTEXT_API_URL = contextApiUrl
    log.debug('Set OPENCODE_CONTEXT_API_URL', { contextApiUrl })
  }

  if (pluginPath) {
    env.OPENCODE_PLUGINS = pluginPath
    log.debug('Set OPENCODE_PLUGINS', { pluginPath })
  }

  return env
}

function setupProcessHandlers(proc: ChildProcess, port: number, hostname: string): void {
  log.debug('Setting up process handlers', { pid: proc.pid })

  proc.stdout?.on('data', (data) => {
    const output = data.toString().trim()
    if (output) {
      log.debug('[OpenCode stdout]', { output })
    }
  })

  proc.stderr?.on('data', (data) => {
    const output = data.toString().trim()
    if (output) {
      log.warn('[OpenCode stderr]', { output })
    }
  })

  proc.on('error', (err) => {
    log.error('Failed to start OpenCode server', { 
      error: err, 
      port, 
      hostname 
    })
  })

  proc.on('exit', (code, signal) => {
    log.debug('OpenCode process exited', { 
      pid: proc.pid, 
      code, 
      signal 
    })
  })
}
