import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { InferenceClient } from '@huggingface/inference'

// Create server instance
const server = new McpServer({
    name: 'greeting-server',
    version: '1.0.0',
    capabilities: {
        tools: {},
        resources: {},
        prompts: {}
    }
})

// Greeting 도구 추가
server.tool(
    'greeting',
    '사용자의 이름과 언어를 입력받아 해당 언어로 인사합니다',
    {
        name: z.string().describe('인사할 사람의 이름'),
        language: z.enum(['korean', 'english', 'japanese', 'chinese', 'spanish', 'french'])
            .describe('인사할 언어 (korean, english, japanese, chinese, spanish, french)')
    },
    async ({ name, language }) => {
        const greetings: Record<string, string> = {
            korean: `안녕하세요, ${name}님!`,
            english: `Hello, ${name}!`,
            japanese: `こんにちは、${name}さん！`,
            chinese: `你好，${name}！`,
            spanish: `¡Hola, ${name}!`,
            french: `Bonjour, ${name}!`
        }

        const greeting = greetings[language] || greetings.english

        return {
            content: [
                {
                    type: 'text',
                    text: greeting
                }
            ]
        }
    }
)

// Calculator 도구 추가
server.tool(
    'calculator',
    '두 개의 숫자를 입력받아 연산자에 따라 사칙연산 결과를 반환합니다',
    {
        num1: z.number().describe('첫 번째 숫자'),
        num2: z.number().describe('두 번째 숫자'),
        operator: z.enum(['+', '-', '*', '/'])
            .describe('연산자 (+: 덧셈, -: 뺄셈, *: 곱셈, /: 나눗셈)')
    },
    async ({ num1, num2, operator }) => {
        let result: number
        let operation: string

        switch (operator) {
            case '+':
                result = num1 + num2
                operation = '덧셈'
                break
            case '-':
                result = num1 - num2
                operation = '뺄셈'
                break
            case '*':
                result = num1 * num2
                operation = '곱셈'
                break
            case '/':
                if (num2 === 0) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: '오류: 0으로 나눌 수 없습니다.'
                            }
                        ],
                        isError: true
                    }
                }
                result = num1 / num2
                operation = '나눗셈'
                break
            default:
                return {
                    content: [
                        {
                            type: 'text',
                            text: '오류: 잘못된 연산자입니다.'
                        }
                    ],
                    isError: true
                }
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `${operation} 결과: ${num1} ${operator} ${num2} = ${result}`
                }
            ]
        }
    }
)

// Current Time 도구 추가
server.tool(
    'getCurrentTime',
    '유저의 Time Zone에 따라 현재 시간을 알려줍니다',
    {
        timezone: z.string()
            .optional()
            .default('Asia/Seoul')
            .describe('시간대 (예: Asia/Seoul, America/New_York, Europe/London, UTC 등)')
    },
    async ({ timezone }) => {
        try {
            const now = new Date()
            
            // 시간대가 유효한지 확인하고 포맷팅
            const formatter = new Intl.DateTimeFormat('ko-KR', {
                timeZone: timezone,
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            })
            
            const formattedTime = formatter.format(now)
            
            // 추가로 ISO 형식과 UTC 오프셋 정보도 제공
            const timeInfo = `📍 시간대: ${timezone}\n⏰ 현재 시간: ${formattedTime}`
            
            return {
                content: [
                    {
                        type: 'text',
                        text: timeInfo
                    }
                ]
            }
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `오류: 유효하지 않은 시간대입니다. (${timezone})\n올바른 시간대 형식: Asia/Seoul, America/New_York, Europe/London 등`
                    }
                ],
                isError: true
            }
        }
    }
)

// Image Generation 도구 추가
server.tool(
    'generateImage',
    '텍스트 프롬프트를 입력받아 AI 이미지를 생성합니다',
    {
        prompt: z.string().describe('생성할 이미지를 설명하는 텍스트 프롬프트 (영어로 입력)')
    },
    async ({ prompt }) => {
        try {
            const hfToken = process.env.HF_TOKEN
            
            if (!hfToken) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: '오류: HF_TOKEN 환경 변수가 설정되지 않았습니다. Hugging Face API 토큰이 필요합니다.'
                        }
                    ],
                    isError: true
                }
            }

            const client = new InferenceClient(hfToken)

            const imageResult = await client.textToImage({
                provider: "fal-ai",
                model: "black-forest-labs/FLUX.1-schnell",
                inputs: prompt,
                parameters: { num_inference_steps: 5 },
            })

            // 결과가 Blob인지 URL(string)인지 확인
            let base64Data: string
            const result = imageResult as unknown
            
            if (result instanceof Blob) {
                // Blob을 ArrayBuffer로 변환 후 base64로 인코딩
                const arrayBuffer = await result.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                base64Data = buffer.toString('base64')
            } else if (typeof result === 'string') {
                // URL인 경우 fetch해서 base64로 변환
                const response = await fetch(result)
                const arrayBuffer = await response.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                base64Data = buffer.toString('base64')
            } else {
                throw new Error('예상하지 못한 이미지 형식입니다')
            }

            return {
                content: [
                    {
                        type: 'image',
                        data: base64Data,
                        mimeType: 'image/png'
                    }
                ],
                _meta: {
                    annotations: {
                        audience: ['user'],
                        priority: 0.9
                    }
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다'
            return {
                content: [
                    {
                        type: 'text',
                        text: `이미지 생성 중 오류가 발생했습니다: ${errorMessage}`
                    }
                ],
                isError: true
            }
        }
    }
)

// Server Info Resource 추가
server.resource(
    'server-info',
    'mcp://server/info',
    {
        description: '현재 MCP 서버의 정보를 반환합니다',
        mimeType: 'application/json'
    },
    async () => {
        const serverInfo = {
            name: 'greeting-server',
            version: '1.0.0',
            description: '다국어 인사, 계산기, 시간 조회 기능을 제공하는 MCP 서버',
            capabilities: {
                tools: ['greeting', 'calculator', 'getCurrentTime', 'generateImage'],
                resources: ['server-info'],
                prompts: ['code_review']
            },
            availableTools: [
                {
                    name: 'greeting',
                    description: '사용자의 이름과 언어를 입력받아 해당 언어로 인사합니다',
                    supportedLanguages: ['korean', 'english', 'japanese', 'chinese', 'spanish', 'french']
                },
                {
                    name: 'calculator',
                    description: '두 개의 숫자를 입력받아 연산자에 따라 사칙연산 결과를 반환합니다',
                    supportedOperators: ['+', '-', '*', '/']
                },
                {
                    name: 'getCurrentTime',
                    description: '유저의 Time Zone에 따라 현재 시간을 알려줍니다',
                    defaultTimezone: 'Asia/Seoul'
                },
                {
                    name: 'generateImage',
                    description: '텍스트 프롬프트를 입력받아 AI 이미지를 생성합니다',
                    model: 'black-forest-labs/FLUX.1-schnell',
                    provider: 'fal-ai'
                }
            ],
            availablePrompts: [
                {
                    name: 'code_review',
                    description: '코드를 입력받아 섬세한 코드 리뷰를 수행합니다'
                }
            ],
            status: 'running',
            timestamp: new Date().toISOString()
        }

        return {
            contents: [
                {
                    uri: 'mcp://server/info',
                    mimeType: 'application/json',
                    text: JSON.stringify(serverInfo, null, 2)
                }
            ]
        }
    }
)

// Code Review Prompt 추가
server.prompt(
    'code_review',
    '사용자의 코드를 입력받아 섬세하고 전문적인 코드 리뷰를 수행하는 프롬프트를 생성합니다',
    {
        code: z.string().describe('리뷰할 코드'),
        language: z.string().optional().describe('코드의 프로그래밍 언어 (예: TypeScript, Python, Java 등)'),
        context: z.string().optional().describe('코드의 맥락이나 목적에 대한 추가 설명')
    },
    async ({ code, language, context }) => {
        const languageInfo = language ? `**프로그래밍 언어**: ${language}` : ''
        const contextInfo = context ? `\n\n**코드 맥락**: ${context}` : ''
        
        const reviewPrompt = `# 코드 리뷰 요청

${languageInfo}${contextInfo}

## 리뷰할 코드:
\`\`\`${language || ''}
${code}
\`\`\`

---

다음 관점에서 섬세하고 전문적인 코드 리뷰를 수행해주세요:

## 1. 코드 품질 및 가독성
- 변수명, 함수명이 명확하고 의미가 잘 전달되는가?
- 코드 구조가 이해하기 쉽고 논리적인가?
- 불필요하게 복잡한 부분은 없는가?
- 주석이 필요한 부분에 적절히 작성되어 있는가?

## 2. 성능 최적화
- 비효율적인 알고리즘이나 데이터 구조 사용은 없는가?
- 불필요한 연산이나 반복문은 없는가?
- 메모리 사용이 효율적인가?
- 시간 복잡도와 공간 복잡도를 개선할 여지는 없는가?

## 3. 보안 이슈
- 잠재적인 보안 취약점은 없는가?
- 입력 값 검증이 제대로 이루어지는가?
- 민감한 정보가 노출될 위험은 없는가?
- SQL 인젝션, XSS 등의 공격에 취약하지 않은가?

## 4. 버그 및 에러 처리
- 잠재적인 버그나 엣지 케이스는 없는가?
- 에러 처리가 적절히 구현되어 있는가?
- Null/Undefined 처리가 안전한가?
- 예외 상황에 대한 대응이 충분한가?

## 5. 베스트 프랙티스 및 디자인 패턴
- 해당 언어나 프레임워크의 베스트 프랙티스를 따르고 있는가?
- SOLID 원칙, DRY 원칙 등을 준수하는가?
- 적절한 디자인 패턴이 적용되었는가?
- 코드의 재사용성과 확장성은 어떤가?

## 6. 테스트 가능성
- 코드가 테스트하기 쉬운 구조인가?
- 의존성 주입이나 모킹이 가능한가?
- 단위 테스트 작성이 용이한가?

## 7. 유지보수성
- 향후 수정이나 기능 추가가 용이한가?
- 코드의 결합도가 적절한가?
- 책임이 명확히 분리되어 있는가?

## 8. 구체적인 개선 제안
- 위의 검토 사항들을 바탕으로 구체적인 개선 코드를 제시해주세요
- 개선 전후를 비교하여 설명해주세요
- 우선순위를 매겨 중요한 개선사항부터 제시해주세요

각 항목에 대해 문제점이 있다면 구체적으로 지적하고, 좋은 부분도 함께 언급해주세요. 
개선이 필요한 부분은 반드시 개선된 코드 예시와 함께 설명해주세요.`

        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: reviewPrompt
                    }
                }
            ]
        }
    }
)

// Start server
async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('Greeting MCP Server running on stdio')
}

main().catch((error) => {
    console.error('Server error:', error)
    process.exit(1)
})
