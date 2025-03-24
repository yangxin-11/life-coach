const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch').default;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

require('dotenv').config();

const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = process.env.DEEPSEEK_API_URL;

app.post('/chat', async (req, res) => {
    try {
        const { message, temperature } = req.body;

        // 设置请求头
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        };

        // 构建请求体
        const requestBody = {
            model: 'deepseek-r1-250120',
            messages: [
                {
                    role: 'system',
                    content: '你是一位专业的生活教练，擅长倾听、分析和给出建议。你会通过对话了解用户的情况，给出有针对性的建议，帮助用户在生活中不断成长。'
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            stream: true,
            temperature: temperature
        };

        // 设置响应头，启用流式传输
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 发送API请求
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        // 处理流式响应 - 使用SSE格式
        const timeout = setTimeout(() => {
            res.write('data: [DONE]\n\n');
            res.end();
        }, 60000);

        // 使用node-fetch支持的方式处理流式数据
        const decoder = new TextDecoder();
        let buffer = '';

        for await (const chunk of response.body) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim() && line.startsWith('data: ')) {
                    try {
                        const jsonData = JSON.parse(line.slice(6));
                        if (jsonData.choices && jsonData.choices[0] && jsonData.choices[0].delta && jsonData.choices[0].delta.content) {
                            const content = jsonData.choices[0].delta.content;
                            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
                        }
                    } catch (e) {
                        console.error('解析JSON失败:', e);
                    }
                }
            }
        }

        response.body.on('end', () => {
            clearTimeout(timeout);
            res.write('event: done\ndata: \n\n');
            res.end();
        });

        response.body.on('error', (err) => {
            console.error('Stream error:', err);
            clearTimeout(timeout);
            res.write(`event: error\ndata: ${err.message}\n\n`);
            res.end();
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});