import { spawn } from "child_process";
import http from "http";
import net from "net";
import {
  DEFAULT_HOSTNAME,
  MAX_PORT_TRIES,
  SERVER_CHECK_INTERVAL,
} from "@vite-plugin-opencode-assistant/shared";
import {
  PerformanceTimer,
  createLogger,
} from "@vite-plugin-opencode-assistant/shared";

const log = createLogger("Utils");

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

export async function killOrphanOpenCodeProcesses(): Promise<number> {
  const timer = log.timer('killOrphanOpenCodeProcesses')
  
  log.debug('Looking for orphan OpenCode processes (PPID=1)')
  
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      killOrphanProcessesOnWindows(resolve, timer)
    } else {
      killOrphanProcessesOnUnix(resolve, timer)
    }
  })
}

function killOrphanProcessesOnWindows(
  resolve: (value: number) => void,
  timer: PerformanceTimer
): void {
  log.debug('Using Windows method to find orphan processes')
  
  const proc = spawn('wmic', [
    'process',
    'where',
    'name="opencode.exe"',
    'get',
    'processid,parentprocessid'
  ], { stdio: 'pipe' })
  
  let output = ''
  
  proc.stdout?.on('data', (data) => {
    output += data.toString()
  })
  
  proc.on('close', () => {
    const lines = output.split('\n').filter(line => line.trim())
    const pidsToKill: string[] = []
    
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 2) {
        const ppid = parts[0]
        const pid = parts[1]
        if (ppid === '1' && pid && !isNaN(Number(pid))) {
          pidsToKill.push(pid)
        }
      }
    })
    
    if (pidsToKill.length > 0) {
      log.debug(`Found ${pidsToKill.length} orphan processes`, { pids: pidsToKill })
      
      let killedCount = 0
      let completedCount = 0
      
      pidsToKill.forEach(pid => {
        const killProc = spawn('taskkill', ['/F', '/PID', pid], { stdio: 'ignore' })
        killProc.on('close', (code) => {
          completedCount++
          if (code === 0) {
            killedCount++
            log.debug(`Killed orphan process ${pid}`)
          }
          
          if (completedCount === pidsToKill.length) {
            timer.end(`✓ Killed ${killedCount} orphan processes`)
            resolve(killedCount)
          }
        })
      })
    } else {
      log.debug('No orphan processes found')
      timer.end('No orphan processes found')
      resolve(0)
    }
  })
  
  proc.on('error', (err) => {
    log.debug('Failed to find orphan processes', { error: err.message })
    timer.end('❌ Failed to find orphan processes')
    resolve(0)
  })
}

function killOrphanProcessesOnUnix(
  resolve: (value: number) => void,
  timer: PerformanceTimer
): void {
  log.debug('Using Unix method to find orphan processes')
  
  const proc = spawn('ps', ['-e', '-o', 'pid,ppid,comm'], { stdio: 'pipe' })
  let output = ''
  
  proc.stdout?.on('data', (data) => {
    output += data.toString()
  })
  
  proc.on('close', () => {
    const lines = output.split('\n')
    const pidsToKill: string[] = []
    
    lines.forEach(line => {
      const trimmed = line.trim()
      if (trimmed.includes('opencode')) {
        const parts = trimmed.split(/\s+/)
        if (parts.length >= 3) {
          const pid = parts[0]
          const ppid = parts[1]
          const comm = parts.slice(2).join(' ')
          
          if (ppid === '1' && comm.includes('opencode')) {
            pidsToKill.push(pid)
          }
        }
      }
    })
    
    if (pidsToKill.length > 0) {
      log.debug(`Found ${pidsToKill.length} orphan processes`, { pids: pidsToKill })
      
      const killProc = spawn('kill', ['-9', ...pidsToKill], { stdio: 'ignore' })
      killProc.on('close', (code) => {
        const killedCount = code === 0 ? pidsToKill.length : 0
        timer.end(killedCount > 0 ? `✓ Killed ${killedCount} orphan processes` : '❌ Failed to kill processes')
        resolve(killedCount)
      })
      
      killProc.on('error', () => {
        timer.end('❌ Failed to kill processes')
        resolve(0)
      })
    } else {
      log.debug('No orphan processes found')
      timer.end('No orphan processes found')
      resolve(0)
    }
  })
  
  proc.on('error', (err) => {
    log.debug('Failed to find orphan processes', { error: err.message })
    timer.end('❌ Failed to find orphan processes')
    resolve(0)
  })
}
