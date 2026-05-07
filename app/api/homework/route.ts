// 🤖 AI 识别引擎 (已切换至百炼 Coding Plan 专属模式)
async function analyzeHomeworkAI(params: { text?: string, filename?: string, imageUrl?: string }) {
  if (!DASHSCOPE_API_KEY) return '其它';
  
  const isVision = !!params.imageUrl;
  
  // 1. 构建 OpenAI 兼容格式的消息体
  let messageContent: any = `判断学科。文件名: ${params.filename || '无'}, 内容: ${params.text || '无'}。只输出一个学科名。`;
  
  if (isVision) {
    messageContent = [
      { type: "text", text: "判断学科（语文、数学、英语、科学、历史、地理、政治、其它）。只输出一个学科名。" },
      { type: "image_url", image_url: { url: params.imageUrl } }
    ];
  }

  // 2. 组装 Payload (使用套餐指定的模型)
  const payload = {
    model: 'qwen3.6-plus', // Coding Plan 推荐模型，同时支持图文
    messages: [
      {
        role: 'user',
        content: messageContent
      }
    ]
  };

  try {
    // 3. 换成 Coding Plan 专属的 Base URL
    const res = await fetch('https://coding.dashscope.aliyuncs.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    
    // 4. 解析 OpenAI 兼容协议的返回值
    const result = data.choices?.[0]?.message?.content || '';
    
    const subjects = ["语文", "数学", "英语", "科学", "历史", "地理", "政治"];
    for (const s of subjects) { if (result.includes(s)) return s; }
    return '其它';
  } catch (e) { 
    console.error("AI 识别失败", e);
    return '其它'; 
  }
}
