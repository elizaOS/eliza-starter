# Artemis AI Agent Project Documentation

## Overview
This document serves as a comprehensive guide for the Artemis AI Agent project. It is essential to maintain an updated log of decisions, actions, and future steps. Additionally, create and regularly update `next-steps.md` and `current-issues.md` to track progress and challenges.

## Project Overview
Building an AI agent named Artemis that enables:
1. Natural language understanding and response generation.
2. Integration with various messaging platforms (Discord, Telegram, etc.).
3. Learning from user interactions to improve responses over time.

## Technical Stack
- **Frontend**: Next.js + Tailwind CSS
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL / SQLite
- **AI Model**: OpenAI API for language processing
- **Web3 Integration**: wagmi + viem
- **Development**: Hardhat for smart contract development

## Development Environment
- **WSL 2** (Windows Subsystem for Linux)
- **Node.js & pnpm**
- **TypeScript** for type safety
- **Better SQLite3** for local database management

## Components
### 1. Character Management
- Load and manage character configurations from JSON files.
- Validate character settings and ensure compliance with project standards.

### 2. Messaging Clients
- Integrate with messaging platforms:
  - Discord
  - Telegram
  - Twitter
- Handle incoming messages and route them to the AI agent for processing.

### 3. AI Response Generation
- Utilize OpenAI's API to generate responses based on user input.
- Implement context management to maintain conversation flow.

### 4. Learning and Adaptation
- Store user interactions and feedback to improve response accuracy.
- Implement a feedback loop for continuous learning.

## Development Guidelines

### Code Organization
1. **Components**
   - Character management in `/components/character`
   - Messaging clients in `/components/clients`
   - AI logic in `/components/ai`
   - Utility functions in `/components/utils`

2. **Types**
   - Core types in `/interfaces/types.ts`
   - Character types in `/interfaces/character.ts`
   - Client types in `/interfaces/client.ts`

3. **Utils**
   - Validation utilities in `/utils/validation`
   - API utilities in `/utils/api`
   - Logging utilities in `/utils/logging`

4. **Characters**
   - Character definitions in `/characters`
   - Character-specific logic in `/characters/<character_name>.character.json`

5. **Plugins**
   - Plugin implementations in `/plugins`
   - Plugin configurations in `/plugins/config`

6. **Database**
   - Database adapters in `/database`
   - Database schema definitions in `/database/schema.sql`

### Best Practices
1. **Type Safety**
   - Use TypeScript strict mode.
   - Define interfaces for all data structures.
   - Validate all external data.

2. **Error Handling**
   - Use error boundaries for components.
   - Implement proper error recovery.
   - Log errors appropriately.
   - Show user-friendly error messages.

3. **Testing**
   - Unit tests for utilities.
   - Integration tests for components.
   - E2E tests for critical flows.
   - Test error scenarios.

## Current Status

### Completed
- [x] Character loading and validation implemented.
- [x] Basic messaging client integration (Discord).
- [x] AI response generation using OpenAI API.
- [x] Initial learning mechanism for user interactions.

### In Progress
- [ ] Integrate additional messaging clients (Telegram, Twitter).
- [ ] Implement advanced learning algorithms for response improvement.
- [ ] Develop comprehensive testing suite.

### Next Steps
1. Complete integration of all messaging clients.
2. Enhance the learning mechanism to include user feedback.
3. Implement error handling and logging throughout the application.
4. Prepare for deployment and production readiness.

## Known Issues
1. Occasional delays in response generation from the OpenAI API.
2. Character loading errors if JSON files are not formatted correctly.
3. Inconsistent behavior in multi-client interactions.

## Recent Updates

### Common Components Implementation
Added core UI components for character management and messaging client integration.

### Technical Decisions
1. Chose OpenAI API for natural language processing due to its versatility and performance.
2. Decided to use SQLite for local development to simplify setup and testing.

### Next Actions
1. Finalize the integration of all messaging clients.
2. Conduct user testing to gather feedback on AI responses.
3. Document the setup process for new developers joining the project.

> Remember to close any running processes (VS Code, terminal, etc.) and have a drink of Vodka!

