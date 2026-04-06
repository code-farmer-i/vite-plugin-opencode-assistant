/**
 * @fileoverview OpenCode 页面上下文插件
 * @description 用于将页面上下文信息注入到 AI 对话中
 */

import type { Plugin, Hooks } from "@opencode-ai/plugin"
import { createLogger } from '../../logger.js'

const MAX_TEXT_LENGTH = 10000

const CONTEXT_MARKER = '__OPENCODE_CONTEXT__'

const log = createLogger('PageContext')

interface SelectedElement {
  filePath: string | null
  line: number | null
  column: number | null
  innerText: string
}

interface PageContextData {
  url: string
  title: string
  selectedElements?: SelectedElement[]
}

export const PageContextPlugin: Plugin = async (): Promise<Hooks> => {
  log.info('PageContextPlugin loading...')
  
  const contextApiUrl = process.env.OPENCODE_CONTEXT_API_URL
  log.debug('Context API URL:', { contextApiUrl })

  if (!contextApiUrl) {
    log.warn('OPENCODE_CONTEXT_API_URL is not set, page context plugin will not work')
    return {}
  }

  const apiUrl = contextApiUrl as string
  log.info('Plugin initialized successfully')

  async function getPageContext(): Promise<PageContextData | null> {
    try {
      log.debug('Fetching context...', { apiUrl })
      const response = await fetch(apiUrl)
      
      if (!response.ok) {
        log.error('Context API returned error status', { 
          status: response.status, 
          statusText: response.statusText,
          apiUrl 
        })
        return null
      }
      
      const data = await response.json() as PageContextData
      log.debug('Context received', { url: data.url, title: data.title })
      return {
        url: data.url || "",
        title: data.title || "",
        selectedElements: data.selectedElements
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorName = error instanceof Error ? error.name : 'UnknownError'
      log.error('Failed to get context', { 
        error: errorMessage,
        errorType: errorName,
        apiUrl 
      })
      return null
    }
  }

  async function clearSelectedElements(): Promise<void> {
    try {
      log.debug('Clearing selected elements', { apiUrl })
      const response = await fetch(apiUrl, { method: 'DELETE' })
      log.debug('Clear response', { status: response.status })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorName = error instanceof Error ? error.name : 'UnknownError'
      log.error('Failed to clear selected elements', { 
        error: errorMessage,
        errorType: errorName,
        apiUrl 
      })
    }
  }

  function formatSelectedElement(element: SelectedElement): string {
    const parts: string[] = []

    if (element.filePath) {
      let location = `文件: ${element.filePath}`
      if (element.line) {
        location += `:${element.line}`
        if (element.column) {
          location += `:${element.column}`
        }
      }
      parts.push(location)
    }

    if (element.innerText?.trim()) {
      const text = element.innerText.trim().substring(0, MAX_TEXT_LENGTH)
      const suffix = element.innerText.length > MAX_TEXT_LENGTH ? '...' : ''
      parts.push(`节点文本: "${text}${suffix}"`)
    }

    return parts.join('\n') + '\n'
  }

  function buildContextPrefix(context: PageContextData): string {
    let prefix = `我现在正在浏览项目中的这个页面：${context.url}\n\n`

    if (context.selectedElements?.length) {
      prefix += `我选中了以下节点：\n\n`
      context.selectedElements.forEach((element) => {
        prefix += formatSelectedElement(element) + "\n"
      })
    }

    prefix += `我的请求：\n`

    prefix += `\n`
    return prefix
  }

  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      log.debug('Message transform hook called')
      const context = await getPageContext()
      log.debug('Context data', { hasUrl: !!context?.url, hasElements: !!context?.selectedElements?.length })
      
      if (!context?.url) return

      const lastUserMsg = [...output.messages].reverse().find(m => m.info.role === "user")
      if (!lastUserMsg) return

      const textPart = lastUserMsg.parts.find(p => p.type === "text")
      if (!textPart || !("text" in textPart)) return
      
      if (textPart.text.includes(CONTEXT_MARKER)) return

      const prefix = buildContextPrefix(context)
      textPart.text = prefix + textPart.text

      if (context.selectedElements?.length) {
        log.debug('Selected elements found, clearing...')
        await clearSelectedElements()
      }
    }
  }
}

export default PageContextPlugin
