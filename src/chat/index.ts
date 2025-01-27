import { settings } from "@elizaos/core";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("SIGINT", () => {
  rl.close();
  process.exit(0);
});

const chatHistory: string[] = [];

async function handleUserInput(input, agentId) {
  if (input.toLowerCase() === "exit") {
    rl.close();
    process.exit(0);
  }

  try {
    const serverPort = parseInt(settings.SERVER_PORT || "3000");

    const response = await fetch(
      `http://localhost:${serverPort}/${agentId}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          userId: "user",
          userName: "User",
        }),
      }
    );

    const data = await response.json();
    data.forEach((message) => {
      const formattedMessage = `${"Agent"}: ${message.text}`;
      console.log(formattedMessage);
      chatHistory.push(formattedMessage);
    });
  } catch (error) {
    console.error("Error fetching response:", error);
  }
}

export function startChat(characters) {
  function chat() {
    const agentId = characters[0].name ?? "Agent";
    rl.question("You: ", async (input) => {
      if (input.toLocaleLowerCase() === "history") {
        showChatHistory();
        chat();
        return;
      }
      
      chatHistory.push(`You: ${input}`);
      await handleUserInput(input, agentId);
      if (input.toLowerCase() !== "exit") {
        chat(); // Loop back to ask another question
      }
    });
  }

  return chat;
}

export function showChatHistory() {
  console.log('Chat History:');
  chatHistory.forEach((message, index) => {
    console.log(`${index + 1}: ${message}`);
  });
}
