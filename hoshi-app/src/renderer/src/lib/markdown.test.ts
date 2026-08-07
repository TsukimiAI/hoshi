import { describe, expect, it } from 'vitest'
import { normalizeChatMarkdown } from './markdown'

describe('normalizeChatMarkdown', () => {
  it('breaks ordered lists glued after a colon introducer', () => {
    const input =
      '关于 Claude Code，重点通常是：1. Agentic能力：能在终端执行命令。2. 上下文管理：自动压缩。3. 安全机制：权限确认。'

    const output = normalizeChatMarkdown(input)

    expect(output).toContain('重点通常是：\n\n1. Agentic能力')
    expect(output).toContain('\n2. 上下文管理')
    expect(output).toContain('\n3. 安全机制')
  })

  it('breaks inline ordered list items onto separate lines', () => {
    const input =
      '1. 定义 Proto 文件（.proto）用这个格式定义服务。2. 编译代码：用 protoc 或 maven 插件生成。3. 服务端实现。4. 客户端调用。'

    const output = normalizeChatMarkdown(input)

    expect(output).toContain('1. 定义 Proto 文件')
    expect(output).toContain('\n2. 编译代码')
    expect(output).toContain('\n3. 服务端实现')
    expect(output).toContain('\n4. 客户端调用')
  })

  it('promotes short standalone title lines to headings', () => {
    const input = 'gRPC概念\ngRPC 是 Google 开源的高性能 RPC 框架。'

    const output = normalizeChatMarkdown(input)

    expect(output).toContain('### gRPC概念')
    expect(output).toContain('gRPC 是 Google 开源的高性能 RPC 框架。')
  })

  it('promotes bold section titles before numbered lists', () => {
    const input =
      '支持多语言地通信。**使用方法**\n1. **定义Proto文件：** 用这个格式定义服务。\n2. **编译代码：** 用 protoc 生成。'

    const output = normalizeChatMarkdown(input)

    expect(output).toContain('支持多语言地通信。')
    expect(output).toContain('### 使用方法')
    expect(output).not.toContain('通信。**使用方法**')
    expect(output).toContain('\n1. **定义Proto文件：**')
    expect(output).toContain('\n2. **编译代码：**')
  })

  it('promotes standalone bold concept headings', () => {
    const input = '**gRPC概念**\ngRPC 是 Google 开源的高性能 RPC 框架。'

    const output = normalizeChatMarkdown(input)

    expect(output).toContain('### gRPC概念')
    expect(output).toContain('gRPC 是 Google 开源的高性能 RPC 框架。')
  })

  it('inserts a heading before usage sections that start an inline list', () => {
    const input = '先讲概念。使用方法 1. 定义 Proto 文件。2. 编译代码。'

    const output = normalizeChatMarkdown(input)

    expect(output).toContain('### 使用方法')
    expect(output).toContain('\n1. 定义 Proto 文件')
    expect(output).toContain('\n2. 编译代码')
  })

  it('keeps fenced code blocks intact while normalizing surrounding text', () => {
    const input = '示例：1. 看代码 ```java\nSystem.out.println("hi");\n``` 2. 运行它。'

    const output = normalizeChatMarkdown(input)

    expect(output).toContain('```java\nSystem.out.println("hi");\n```')
    expect(output).toContain('\n2. 运行它。')
  })
})
