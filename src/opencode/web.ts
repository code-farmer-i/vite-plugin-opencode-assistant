import { execa } from 'execa'
import type { ResultPromise } from 'execa'
import { WebOptions } from '../types.js'
import { createLogger } from '../logger.js'
import path from 'path'
import fs from 'fs'

const log = createLogger('OpenCodeWeb')

export function startOpenCodeWeb(options: WebOptions): ResultPromise {
  const { port, hostname, cwd, configDir, corsOrigins, contextApiUrl } = options

  log.debug('Creating state directory', { cwd })
  const stateDir = createStateDirectory(cwd)

  const pluginPath = path.join(stateDir, 'plugins', 'page-context.js')
  log.debug('Building process environment', { 
    stateDir, 
    configDir, 
    contextApiUrl, 
    pluginPath 
  })
  const env = buildProcessEnv(stateDir, configDir, contextApiUrl, pluginPath)

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
  
  const proc = execa('opencode', args, {
    cwd,
    env,
    reject: false,
    cleanup: true,
  })

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
