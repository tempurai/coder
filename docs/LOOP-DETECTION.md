# 循环检测系统 - Tempurai Coder v6

AI Agent 循环检测与防护系统，防止无效的自我循环，节省时间和资源。

## 🎯 核心功能

### 🔍 多模式循环检测

#### 1. **精确重复检测** (Exact Repeat)
- **目标**: 检测连续相同的工具调用
- **阈值**: 默认3次重复
- **示例**: `git status` → `git status` → `git status`
- **场景**: Agent 重复执行相同操作而未获得预期结果

#### 2. **交替模式检测** (Alternating Pattern)
- **目标**: 检测两个工具间的无限循环
- **阈值**: 默认4次交替
- **示例**: `read_file` → `write_file` → `read_file` → `write_file`
- **场景**: 两个工具操作相互冲突或产生无效结果

#### 3. **参数循环检测** (Parameter Cycle)
- **目标**: 同一工具使用不同参数形成循环
- **阈值**: 默认参数重复4次
- **示例**: `find_files("*.js")` → `find_files("*.ts")` → `find_files("*.js")`
- **场景**: Agent 在多个参数值间反复尝试

#### 4. **工具序列循环** (Tool Sequence)
- **目标**: 一系列工具调用序列的重复
- **阈值**: 检测2-3长度的序列重复
- **示例**: `git_status` → `git_add` → `git_commit` (重复)
- **场景**: Agent 重复执行一整套工作流程

## 🏗️ 架构设计

### 核心组件

```
LoopDetectionService
├── 历史记录管理 (ToolCallRecord[])
├── 模式检测算法 (4种检测类型)
├── 配置管理 (动态阈值调整)
└── 统计分析 (使用情况追踪)

SimpleAgent 集成
├── 工具调用拦截 (executeToolCall)
├── 循环检测检查 (addAndCheck)
├── 错误处理 (buildLoopErrorMessage)
└── 流式事件 (AgentStreamEvent)

CLI 命令扩展
├── /loops (显示循环统计)
├── /clear (清除循环历史)
└── /config (显示循环状态)
```

### 数据结构

```typescript
interface ToolCallRecord {
  toolName: string;
  parameters: string;        // 序列化参数
  timestamp: number;
  sequence: number;
}

interface LoopDetectionResult {
  isLoop: boolean;
  loopType?: 'exact_repeat' | 'alternating_pattern' | 'parameter_cycle' | 'tool_sequence';
  loopLength?: number;
  description?: string;
  suggestion?: string;
}
```

## 🔧 集成点

### 1. **SimpleAgent 集成** (SimpleAgent.ts:480-522)
- **工具调用拦截**: 每个工具调用前先检查循环
- **错误处理**: 循环检测时返回结构化错误信息
- **流式事件**: 向用户发送循环警告和建议

### 2. **CLI 命令支持** (index.ts:281-380)
- **`/loops`**: 显示详细的循环检测统计信息
- **`/clear`**: 同时清除对话历史和循环检测历史
- **`/config`**: 在配置显示中包含循环检测状态

### 3. **类型系统扩展** (types.ts:61)
- **AgentStreamEvent**: 添加 `warning` 字段支持循环警告
- **向后兼容**: 不影响现有事件处理逻辑

## 🧪 测试验证

### 功能测试覆盖

```bash
# 循环检测核心功能测试
node test/loop-detection-test.js
✅ 精确重复检测 - 连续相同工具调用
✅ 交替模式检测 - A-B-A-B 模式  
✅ 参数循环检测 - 同工具不同参数循环
✅ 工具序列循环检测 - 工具序列重复
✅ 正常调用不误报 - 合理的工具使用
✅ 配置动态更新 - 灵活的阈值调整
✅ 统计信息收集 - 使用情况分析

# 系统集成测试
node test/integrated-loop-test.js
✅ 循环检测服务成功集成到 SimpleAgent
✅ 循环检测配置可动态更新
✅ 循环检测统计信息实时获取
✅ 循环检测历史可以清除重置
✅ 与现有 Agent 功能无冲突
✅ CLI 命令扩展支持循环检测
```

## 📊 使用统计

### 实时统计信息
- **总工具调用数**: 会话中所有工具调用的总数
- **唯一工具数**: 使用过的不同工具种类数量  
- **历史记录长度**: 当前保持的调用历史数量
- **会话时长**: 从第一次调用到现在的时间跨度
- **最常用工具**: 调用次数最多的工具名称

### CLI 命令示例

```bash
# 查看循环检测统计
> /loops
┌────────────────────────────────────────────────────────────┐
│ 🔄 Loop Detection Statistics:                             │
│                                                            │
│   Total Tool Calls: 15                                    │
│   Unique Tools Used: 5                                    │
│   History Length: 12                                      │
│   Session Timespan: 45s                                   │
│   Most Used Tool: shell_executor                          │
└────────────────────────────────────────────────────────────┘

# 查看配置（包含循环检测状态）  
> /config
┌────────────────────────────────────────────────────────────┐
│ 🔧 Configuration:                                         │
│   Model: openai:gpt-4o-mini                              │
│                                                            │
│ 🔄 Loop Detection:                                        │
│   Total Calls: 15                                         │
│   History Length: 12                                      │
│   Most Used Tool: shell_executor                          │
└────────────────────────────────────────────────────────────┘
```

## ⚙️ 配置选项

### 默认配置
```typescript
{
  maxHistorySize: 25,           // 最大历史记录数
  exactRepeatThreshold: 3,      // 精确重复阈值
  alternatingPatternThreshold: 4, // 交替模式阈值  
  parameterCycleThreshold: 4,   // 参数循环阈值
  timeWindowMs: 60000          // 时间窗口(1分钟)
}
```

### 动态配置更新
```typescript
agent.updateLoopDetectionConfig({
  exactRepeatThreshold: 2,     // 更敏感的检测
  maxHistorySize: 30          // 更大的历史缓存
});
```

## 🚨 循环检测流程

### 检测时机
1. **工具调用前**: 每次 `executeToolCall` 执行前
2. **历史更新**: 调用信息添加到历史记录
3. **模式分析**: 运行所有4种检测算法
4. **结果处理**: 检测到循环时阻止执行并报告

### 用户交互
```bash
# 循环检测触发时的用户体验
🔄 循环检测警告: 检测到精确重复循环：工具 'shell_executor' 连续执行 3 次相同操作

💡 建议: 建议停止重复操作，检查工具执行结果或修改参数。如果是预期行为，请明确告知。

⏸️ 执行已暂停，请提供新的指令或确认是否继续。
```

## 🎯 价值与影响

### 问题解决
- **🔄 避免无限循环**: 防止 Agent 陷入重复的无效操作
- **💰 节省资源**: 减少无效的 API 调用和计算消耗
- **⏱️ 提高效率**: 快速识别并停止无效的执行路径
- **🧠 增强智能**: 通过模式识别提高 Agent 的自我察觉能力

### 用户体验提升
- **🔍 透明度**: 清晰地告诉用户为什么停止执行
- **💡 指导性**: 提供具体的改进建议
- **📊 可观察性**: 实时统计帮助理解 Agent 行为
- **🎛️ 可控性**: 用户可以清除历史或调整配置

### 技术优势
- **🔌 无侵入集成**: 不影响现有工具和流程
- **📈 可扩展性**: 易于添加新的检测模式
- **⚡ 高性能**: 轻量级检测，不显著影响响应时间
- **🛡️ 容错性**: 检测失败不会影响正常工具执行

这个循环检测系统将 Tempurai Coder 从一个简单的工具执行器提升为具备自我监控和优化能力的智能 Agent，显著改善了用户体验和系统可靠性！