// Vercel Serverless Function — AI 对话兜底接口
// 环境变量：AI_API_KEY（必填）、AI_API_BASE（可选，默认 DeepSeek）、AI_MODEL（可选）

const SYSTEM_PROMPT = `你是一个任务管理助手。用户会用自然语言描述任务操作，你需要理解意图并返回结构化 JSON。

## 当前上下文
用户已有任务列表和分类列表会在输入中提供。你需要基于这些上下文判断用户想做什么。

## 意图类型
- add：添加新任务（用户在描述要做的事）
- complete：标记任务完成（用户说某事做完了/搞定了/完成了）
- delete：删除任务（用户说删掉/取消/不要了某事）
- update：修改任务（用户说把某事改成/改到/调整为）
- query：查询任务（用户问有什么/看看/列表）
- chat：纯聊天（用户只是在说话，不涉及任务操作）

## 返回格式（必须是合法 JSON，不要任何额外文字）
{
  "intent": "add|complete|delete|update|query|chat",
  "reply": "给用户的自然语言回复，简洁友好",
  "tasks": [
    {
      "text": "任务内容描述（去掉时间和分类词后的纯内容）",
      "deadline": "YYYY-M-D 格式日期，没有时间则为全天",
      "hasTime": true/false,
      "hour": 0-23,
      "minute": 0-59,
      "categoryName": "分类名称，匹配已有分类或新建"
    }
  ],
  "targetKeyword": "用于匹配现有任务的关键词（complete/delete/update 时用）",
  "targetIndex": null 或 数字（从0开始，用户说"第几个"时用）,
  "changes": {
    "text": "新的任务内容（如果改了内容）",
    "deadline": "新的截止日期",
    "hasTime": true/false,
    "hour": 0-23,
    "minute": 0-59,
    "categoryName": "新的分类"
  }
}

## 规则
1. 只在 intent 为 add 时填充 tasks 数组，其他意图留空数组
2. 只在 intent 为 complete/delete/update 时填充 targetKeyword 或 targetIndex
3. 只在 intent 为 update 时填充 changes 对象
4. 日期用 YYYY-M-D 格式（如 2026-9-5），不要补零
5. 如果用户说的是"周五前"、"月底前"等，取那个日期作为截止日
6. categoryName 尽量匹配用户已有分类；用户用 #分类名 时直接用那个名称
7. reply 要简洁，不超过两句话
8. 如果完全无法理解用户意图，intent 设为 chat，reply 说明没听懂并请用户换个说法`;

export default async function handler(req, res) {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      intent: 'chat',
      reply: '后端还没配置 AI_API_KEY 环境变量。请在 Vercel 项目设置里添加你的 AI API 密钥。',
      tasks: [],
      error: 'AI_API_KEY not configured'
    });
  }

  const apiBase = process.env.AI_API_BASE || 'https://api.deepseek.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { input, tasks, categories } = body || {};
  if (!input) {
    return res.status(400).json({ error: 'input is required' });
  }

  // 构建用户消息，附带上下文
  const context = {
    input: input,
    currentTasks: (tasks || []).filter(t => !t.done).map(t => ({
      id: t.id,
      text: t.text,
      deadline: t.deadline,
      categoryName: (categories || []).find(c => c.id === t.categoryId)?.name || null
    })),
    categories: (categories || []).map(c => c.name)
  };

  try {
    const aiRes = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(context) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 800
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('AI API error:', aiRes.status, errText);
      return res.status(502).json({
        intent: 'chat',
        reply: 'AI 服务暂时不可用（' + aiRes.status + '），请稍后再试，或者用更简单的说法（如"明天3点 #工作 开会"）。',
        tasks: [],
        error: 'AI API returned ' + aiRes.status
      });
    }

    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'Empty AI response' });
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      // AI 没返回合法 JSON，尝试提取 JSON 部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          return res.status(502).json({ error: 'Failed to parse AI response', raw: content });
        }
      } else {
        return res.status(502).json({ error: 'AI did not return JSON', raw: content });
      }
    }

    // 确保返回结构完整
    result.intent = result.intent || 'chat';
    result.reply = result.reply || '';
    result.tasks = Array.isArray(result.tasks) ? result.tasks : [];
    result.targetKeyword = result.targetKeyword || null;
    result.targetIndex = typeof result.targetIndex === 'number' ? result.targetIndex : null;
    result.changes = result.changes || {};

    return res.status(200).json(result);

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({
      intent: 'chat',
      reply: '调用 AI 时出错：' + error.message + '。请检查网络或 API 配置。',
      tasks: [],
      error: error.message
    });
  }
}
