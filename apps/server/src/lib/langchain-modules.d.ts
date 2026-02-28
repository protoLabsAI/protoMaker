// Type declarations for optional LangChain provider packages.
// These are dynamically imported and may not be installed.
declare module '@langchain/groq' {
  export class ChatGroq {
    constructor(config: { model: string; apiKey?: string });
  }
}

declare module '@langchain/openai' {
  export class ChatOpenAI {
    constructor(config: {
      model: string;
      openAIApiKey?: string;
      configuration?: { baseURL?: string; apiKey?: string };
    });
  }
}
