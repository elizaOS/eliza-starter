# Testing Guide for AI Agent with Eliza Starter

Eliza Starter provides a modular framework for building AI agents, allowing the integration of various plugins to extend functionality. 

## Core Testing Strategy

## 1. **Minimum Viable Product (MVP) Testing**

   - **Objective**: Ensure the AI agent can run a character file and interact with a Large Language Model (LLM) via the terminal.

   - **Steps**:
     1. **Clone the Repository**: Obtain the latest version of Eliza Starter.
        ```bash
        git clone https://github.com/ai16z/eliza.git
        cd eliza
        ```
     2. **Install Dependencies**: Use `pnpm` to install necessary packages.
        ```bash
        pnpm install
        ```
     3. **Configure Environment Variables**: Duplicate and edit the `.env.example` file to set up required keys and tokens.
        ```bash
        cp .env.example .env
        ```
     4. **Edit Character File**: Modify `agent/src/character.ts` to define the AI agent's behavior.
     5. **Start the Agent**: Launch the agent and test interactions.
        ```bash
        pnpm start
        ```

   - **Expected Outcome**: The AI agent should respond to terminal inputs using the configured character file and LLM.

## 2. **Plugin-Specific Testing**

   - **Objective**: Validate the functionality of each integrated plugin.

   - **General Steps**:
     1. **Initialize the Plugin**: Ensure the plugin is correctly integrated into the agent.
     2. **Configure Plugin Settings**: Set up any necessary environment variables or configuration files specific to the plugin.
     3. **Run Plugin Tests**: Execute predefined tests to verify the plugin's functionality.
     4. **Evaluate Outputs**: Assess the plugin's responses and behaviors to ensure they meet expectations.

   - **Expected Outcome**: Each plugin should operate as intended, enhancing the AI agent's capabilities without introducing errors.

---

## **General Testing Guidelines**:

- **Environment Setup**: Ensure that all necessary environment variables and configurations are set correctly before testing.

- **Mocking External Services**: Use mocking frameworks to simulate external services during testing to isolate client functionality.

- **Continuous Integration**: Integrate these tests into a continuous integration pipeline to ensure ongoing reliability.

- **Documentation**: Maintain clear documentation of test cases, expected outcomes. Check for any known issues in `.current-issues.md`.


---

## Running Tests

For all plugins:

```bash
# Run all tests for all plugins
yarn test

# Run tests in watch mode for real-time feedback
yarn test:watch

# Clear logs before starting a new test run
yarn test:clear-logs
```

---
---




## Plugin-Specific Testing Steps

### 1. **Bootstrap Plugin**

   - **Objective**: Ensure the Bootstrap Plugin initializes and operates correctly.

   - **Steps**:
     1. **Initialize Plugin**: Confirm the plugin is included in the agent's configuration.
     2. **Configure Actions**: Set up actions like `continue`, `followRoom`, and `unfollowRoom`.
     3. **Run Tests**: Execute tests to verify action functionalities.
     4. **Evaluate Responses**: Check if the plugin responds appropriately to various inputs.

   - **Expected Outcome**: The plugin should handle actions as defined, facilitating smooth agent interactions.

### 2. **Image Generation Plugin**

   - **Objective**: Validate the image generation capabilities of the plugin.

   - **Steps**:
     1. **Initialize Plugin**: Ensure the plugin is integrated and configured.
     2. **Configure Services**: Set up image generation services and captioning features.
     3. **Run Tests**: Generate images using sample prompts.
     4. **Evaluate Outputs**: Assess the quality and relevance of generated images and captions.

   - **Expected Outcome**: The plugin should produce accurate and contextually appropriate images and captions.

### 3. **Node Plugin**

   - **Objective**: Test the core Node.js services provided by the plugin.

   - **Steps**:
     1. **Initialize Plugin**: Confirm the plugin is active and configured.
     2. **Configure Services**: Set up services like `BrowserService`, `ImageDescriptionService`, etc.
     3. **Run Tests**: Execute tests for each service with sample inputs.
     4. **Evaluate Outputs**: Verify the accuracy and relevance of each service's output.

   - **Expected Outcome**: Each service should function correctly, providing accurate and useful outputs.

### 4. **Solana Plugin**

   - **Objective**: Ensure the Solana Plugin integrates blockchain functionalities effectively.

   - **Steps**:
     1. **Initialize Plugin**: Verify the plugin is integrated and configured.
     2. **Configure Evaluators and Providers**: Set up evaluators like `trustEvaluator` and providers such as `walletProvider`.
     3. **Run Tests**: Test wallet operations and transaction evaluations.
     4. **Evaluate Outputs**: Assess the accuracy and reliability of blockchain-related outputs.

   - **Expected Outcome**: The plugin should handle blockchain operations accurately, maintaining data integrity and trustworthiness.






To ensure the functionality and reliability of each client in the Eliza Starter framework, it's essential to implement comprehensive tests. Below is a structured approach to testing each client:

### 5. **Discord Client (`@eliza/client-discord`)**

- **Objective**: Verify that the Discord client integrates seamlessly with the Eliza framework and responds appropriately to user inputs.

- **Test Steps**:
  1. **Initialization**: Confirm that the client initializes without errors.
  2. **Event Handling**: Test the client's ability to handle various Discord events (e.g., messages, reactions).
  3. **Command Processing**: Ensure that the client processes and responds to commands correctly.
  4. **Error Handling**: Verify that the client manages errors gracefully and provides meaningful feedback.

- **Expected Outcome**: The Discord client should operate smoothly, handling events and commands as intended.

### 6. **Twitter Client (`@eliza/client-twitter`)**

- **Objective**: Ensure the Twitter client can send and receive tweets, mentions, and direct messages effectively.

 - **Test Steps**:
  1. **Authentication**: Verify that the client authenticates with the Twitter API successfully.
  2. **Tweet Sending**: Test the client's ability to send tweets.
  3. **Mention Handling**: Ensure the client can process mentions and respond appropriately.
  4. **Direct Message Handling**: Confirm that the client can send and receive direct messages.

- **Expected Outcome**: The Twitter client should manage tweets, mentions, and direct messages without issues.

### 7. **Telegram Client (`@eliza/client-telegram`)**

- **Objective**: Validate that the Telegram client can handle messages, commands, and media effectively.

- **Test Steps**:
  1. **Bot Initialization**: Ensure the bot starts without errors.
  2. **Message Handling**: Test the bot's ability to receive and respond to text messages.
  3. **Command Processing**: Verify that the bot processes commands correctly.
  4. **Media Handling**: Confirm that the bot can send and receive media files.

- **Expected Outcome**: The Telegram client should handle messages, commands, and media as expected.

### 8. **Direct Client (`@eliza/client-direct`)**

- **Objective**: Ensure the Direct client can handle REST API requests and responses correctly.

- **Test Steps**:
  1. **API Endpoint Verification**: Confirm that the API endpoints are accessible.
  2. **Request Handling**: Test the client's ability to process various HTTP requests (GET, POST, etc.).
  3. **Response Validation**: Ensure that the client returns appropriate responses with correct status codes.
  4. **Error Handling**: Verify that the client manages errors and exceptions properly.

- **Expected Outcome**: The Direct client should handle API requests and responses efficiently and accurately.

### 9. **Auto Client (`@eliza/client-auto`)**

- **Objective**: Validate that the Auto client can perform automated tasks as intended.

- **Test Steps**:
  1. **Task Initialization**: Ensure that the client initializes tasks without errors.
  2. **Task Execution**: Test the client's ability to execute tasks automatically.
  3. **Error Handling**: Verify that the client handles errors during task execution gracefully.
  4. **Logging**: Ensure that the client logs activities and errors appropriately.

- **Expected Outcome**: The Auto client should perform automated tasks reliably and handle errors effectively.



## Guidelines for Testing AI Agent Plugins

- **Keep Tests Focused and Manageable**: Each plugin should have dedicated test cases for rendering, interactions, and error handling.
- **Mock External Dependencies**: Use mocks for external services or APIs to isolate plugin functionality during testing.
- **Simulate Real User Interactions**: 