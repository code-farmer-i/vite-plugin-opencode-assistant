import http from 'http'
import { spawn } from 'child_process'
import net from 'net'
import {
  DEFAULT_HOSTNAME,
  SERVER_CHECK_INTERVAL,
  HEALTH_CHECK_TIMEOUT,
  MAX_PORT_TRIES,
} from '../constants.js'
import { createLogger, PerformanceTimer } from '../logger.js'

const log = createLogger('Utils')

export function waitForServer(url: string, timeout = 10000): Promise<void> {
  const timer = new PerformanceTimer('waitForServer', { url, timeout })
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let attempts = 0

    const check = (): void => {
      attempts++
      log.debug(`Checking server availability (attempt ${attempts})`, { url })
      
      const req = http.get(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          timer.end(`✓ Server ready after ${attempts} attempts`)
          resolve()
        } else {
          log.debug(`Server returned status ${res.statusCode}, retrying...`)
          retryOrReject()
        }
      })

      req.on('error', (err) => {
        log.debug(`Server check failed: ${err.message}`)
        retryOrReject()
      })
    }

    const retryOrReject = (): void => {
      const elapsed = Date.now() - startTime
      if (elapsed < timeout) {
        setTimeout(check, SERVER_CHECK_INTERVAL)
      } else {
        timer.end('❌ Timeout')
        reject(new Error(`Server not ready after ${timeout}ms (${attempts} attempts)`))
      }
    }

    check()
  })
}

export async function checkOpenCodeInstalled(): Promise<boolean> {
  const timer = log.timer('checkOpenCodeInstalled')
  
  return new Promise((resolve) => {
    log.debug('Checking if OpenCode is installed...')
    
    const proc = spawn('opencode', ['--version'], { stdio: 'ignore' })
    
    proc.on('close', (code) => {
      const installed = code === 0
      timer.end(installed ? '✓ OpenCode is installed' : '❌ OpenCode not found')
      resolve(installed)
    })
    
    proc.on('error', (err) => {
      log.debug('Failed to check OpenCode installation', { error: err.message })
      timer.end('❌ Check failed')
      resolve(false)
    })
  })
}

export async function isPortAvailable(port: number, hostname = DEFAULT_HOSTNAME): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    
    server.once('error', (err) => {
      log.debug(`Port ${port} is not available`, { error: (err as Error).message })
      resolve(false)
    })
    
    server.once('listening', () => {
      server.close()
      log.debug(`Port ${port} is available`)
      resolve(true)
    })
    
    server.listen(port, hostname)
  })
}

export async function findAvailablePort(
  startPort: number,
  hostname = DEFAULT_HOSTNAME,
  maxTries = MAX_PORT_TRIES
): Promise<number> {
  const timer = log.timer('findAvailablePort', { startPort, hostname, maxTries })
  
  log.debug(`Looking for available port starting from ${startPort}`)
  
  for (let port = startPort; port < startPort + maxTries; port++) {
    if (await isPortAvailable(port, hostname)) {
      timer.end(`✓ Found available port: ${port}`)
      return port
    }
    log.debug(`Port ${port} is in use, trying next...`)
  }
  
  timer.end('❌ No available port found')
  throw new Error(`No available port found after ${maxTries} tries starting from ${startPort}`)
}

export async function killProcessOnPort(port: number, hostname = DEFAULT_HOSTNAME): Promise<boolean> {
  const timer = log.timer('killProcessOnPort', { port, hostname })
  
  log.debug(`Attempting to kill process on port ${port}`)
  
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      killProcessOnWindows(port, resolve, timer)
    } else {
      killProcessOnUnix(port, resolve, timer)
    }
  })
}

function killProcessOnWindows(
  port: number, 
  resolve: (value: boolean) => void,
  timer: PerformanceTimer
): void {
  log.debug('Using Windows method to kill process')
  
  const proc = spawn('cmd', ['/c', `netstat -ano | findstr :${port}`], { stdio: 'pipe' })
  let output = ''

  proc.stdout?.on('data', (data) => {
    output += data.toString()
  })

  proc.on('close', () => {
    const match = output.match(/LISTENING\s+(\d+)/)
    if (match) {
      log.debug(`Found process PID ${match[1]} on port ${port}`)
      spawn('taskkill', ['/F', '/PID', match[1]], { stdio: 'ignore' })
        .on('close', (code) => {
          const success = code === 0
          timer.end(success ? `✓ Process killed` : '❌ Failed to kill process')
          resolve(success)
        })
    } else {
      log.debug(`No process found on port ${port}`)
      timer.end('No process found')
      resolve(false)
    }
  })
}

function killProcessOnUnix(
  port: number, 
  resolve: (value: boolean) => void,
  timer: PerformanceTimer
): void {
  log.debug('Using Unix method to kill process')
  
  const proc = spawn('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { stdio: 'pipe' })
  let output = ''

  proc.stdout?.on('data', (data) => {
    output += data.toString()
  })

  proc.on('close', () => {
    const pids = output.trim().split('\n').filter(Boolean)
    if (pids.length > 0) {
      log.debug(`Found processes on port ${port}`, { pids })
      const killProc = spawn('kill', ['-9', ...pids], { stdio: 'ignore' })
      killProc.on('close', (code) => {
        const success = code === 0
        timer.end(success ? `✓ Killed ${pids.length} processes` : '❌ Failed to kill processes')
        resolve(success)
      })
    } else {
      log.debug(`No process found on port ${port}`)
      timer.end('No process found')
      resolve(false)
    }
  })
}

export async function checkOpenCodeProcess(port: number): Promise<boolean> {
  const timer = log.timer('checkOpenCodeProcess', { port })
  
  return new Promise((resolve) => {
    log.debug(`Checking OpenCode process health on port ${port}`)
    
    const req = http.get({
      hostname: DEFAULT_HOSTNAME,
      port,
      path: '/health',
      timeout: HEALTH_CHECK_TIMEOUT,
    }, (res) => {
      const running = res.statusCode === 200
      timer.end(running ? '✓ Process is running' : '❌ Process not healthy')
      resolve(running)
    })
    
    req.on('error', (err) => {
      log.debug('Health check failed', { error: err.message })
      timer.end('❌ Health check failed')
      resolve(false)
    })
    
    req.end()
  })
}
