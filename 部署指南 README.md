# 任务整理助手 - 混合模式部署指南

规则匹配 + AI 兜底的对话式任务管理工具。简单操作走规则（免费、快、离线），复杂表达自动调用 AI 理解。

## 文件结构

```
task-organizer/
├── index.html      # 前端（放 GitHub Pages）
├── api/
│   └── chat.js     # 后端 AI 接口（放 Vercel）
├── package.json
├── vercel.json
└── README.md
```

## 部署步骤

### 第一步：获取 AI API Key（推荐 DeepSeek）

1. 打开 https://platform.deepseek.com 注册登录
2. 左侧「API Keys」→「创建 API key」
3. 复制保存好（只显示一次）

> 也可以用任何兼容 OpenAI 格式的 API（智谱、通义、OpenAI 等），只需在 Vercel 环境变量里额外配置 `AI_API_BASE` 和 `AI_MODEL`。

### 第二步：把代码推到 GitHub

把以下文件上传到你的 GitHub 仓库（比如 `task` 仓库）：
- `index.html`
- `api/chat.js`（注意是在 api 文件夹里）
- `package.json`
- `vercel.json`

### 第三步：部署后端到 Vercel

1. 打开 https://vercel.com，用 GitHub 账号登录
2. 点「Add New...」→「Project」
3. 找到你的仓库，点「Import」
4. 配置项：
   - Framework Preset：选 **Other**
   - 其他保持默认
5. 展开「Environment Variables」，添加：
   - Name: `AI_API_KEY`
   - Value: 你第一步复制的 API key
6. 点「Deploy」，等 1-2 分钟
7. 部署成功后会给你一个域名，比如 `task-xxxx.vercel.app`

### 第四步：配置前端

1. 打开你的前端页面（GitHub Pages 地址）
2. 点右上角齿轮（设置）
3. 找到「AI 后端配置」
4. 后端地址填：`https://你的-vercel-域名.vercel.app/api/chat`
5. 点「保存」，再点「测试连接」
6. 显示「连接成功」就搞定了

### 第五步：验证

说一句规则识别不了的话试试，比如：
- "那个事你懂的就是上次说的帮我弄一下"
- "把之前那个跟论文有关的事情时间往后挪挪"

如果规则匹配不到，会显示「规则没匹配到，正在用 AI 理解...」，然后 AI 帮你处理。

## 环境变量说明

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `AI_API_KEY` | 是 | - | AI 服务的 API 密钥 |
| `AI_API_BASE` | 否 | `https://api.deepseek.com/v1` | API 基础地址（兼容 OpenAI 格式的服务） |
| `AI_MODEL` | 否 | `deepseek-chat` | 模型名称 |

### 用其他 AI 服务的示例

**智谱 AI：**
- `AI_API_BASE` = `https://open.bigmodel.cn/api/paas/v4`
- `AI_MODEL` = `glm-4-flash`

**OpenAI：**
- `AI_API_BASE` = `https://api.openai.com/v1`
- `AI_MODEL` = `gpt-4o-mini`

**通义千问（DashScope，需用兼容模式）：**
- `AI_API_BASE` = `https://dashscope.aliyuncs.com/compatible-mode/v1`
- `AI_MODEL` = `qwen-turbo`

## 更新代码

以后更新程序时：
1. **前端**：覆盖 GitHub 仓库里的 `index.html`，等 GitHub Pages 自动更新（1-2分钟）
2. **后端**：覆盖 `api/chat.js`，推到 GitHub 后 Vercel 自动重新部署
3. 数据都在你浏览器本地，网址不变，数据自动保留

## 工作原理

```
用户输入
  ↓
规则匹配（本地，毫秒级）
  ├─ 能识别 → 直接执行（免费，不调AI）
  └─ 识别不了 → 调用后端 AI 接口
                    ↓
                 后端转发到 AI 服务
                    ↓
                 返回结构化结果
                    ↓
                 执行操作 + 自然语言回复
```

规则能覆盖 90% 的常用场景（加任务、标完成、改时间、查任务），AI 只在规则搞不定时才调用，成本极低。
