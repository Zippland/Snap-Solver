const axios = require('axios');
const config = require('../config');

class OpenAIService {
    static async extractText(base64Image) {
        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: config.openai.extractionModel,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/png;base64,${base64Image}`
                                }
                            },
                            {
                                type: 'text',
                                text: '请按格式提取这张图片中的所有内容，一字不落，并保持使用题目中的语言种类。'
                            }
                        ]
                    }
                ],
                max_tokens: config.openai.maxTokens
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openai.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.data || !response.data.choices || !response.data.choices[0]) {
                throw new Error('Invalid response from OpenAI API');
            }

            return response.data.choices[0].message.content.trim();
        } catch (error) {
            console.error('Text Extraction Error:', error.response?.data || error.message);
            throw new Error('Failed to extract text from image');
        }
    }

    static async solveProblem(content, isImage = false) {
        try {
            const requestBody = {
                model: config.openai.solvingModel,
                messages: isImage ? [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/png;base64,${content}`
                                }
                            },
                            {
                                type: 'text',
                                text: '请解答图中的题目。如果是选择题，请先仔细分析题目中的每一个选项，然后给我正确答案。请始终保持使用题目中的语言种类。'
                            }
                        ]
                    }
                ] : [
                    {
                        role: 'user',
                        content: `请解答以下题目。如果是选择题，请先仔细分析题目中的每一个选项，然后给我正确答案。请始终保持使用题目中的语言种类。\n\n${content}`
                    }
                ],
                max_tokens: config.openai.maxTokens
            };

            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${config.openai.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.data || !response.data.choices || !response.data.choices[0]) {
                throw new Error('Invalid response from OpenAI API');
            }

            return response.data.choices[0].message.content.trim();
        } catch (error) {
            console.error('Problem Solving Error:', error.response?.data || error.message);
            throw new Error('Failed to solve the problem');
        }
    }
}

module.exports = OpenAIService;