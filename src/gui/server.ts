import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as path from 'path';
import cors from 'cors';
import { SimpleAgent } from '../agents/SimpleAgent';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store active conversations
const activeConversations = new Map<string, {
  agent: SimpleAgent;
  history: Array<{role: string, content: string, timestamp: Date}>;
}>();

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  // Initialize conversation for this socket
  activeConversations.set(socket.id, {
    agent: new SimpleAgent(),
    history: []
  });

  socket.on('message', async (data) => {
    const { message, conversationId } = data;
    const conversation = activeConversations.get(socket.id);
    
    if (!conversation) {
      socket.emit('error', { error: 'Conversation not found' });
      return;
    }

    try {
      // Add user message to history
      conversation.history.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });

      // Emit user message confirmation
      socket.emit('message', {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        id: `msg_${Date.now()}_user`
      });

      // Process with agent
      console.log(`💬 Processing message from ${socket.id}: ${message}`);
      
      const response = await conversation.agent.process(message);
      
      // Add agent response to history
      conversation.history.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });

      // Emit agent response
      socket.emit('message', {
        role: 'assistant', 
        content: response,
        timestamp: new Date().toISOString(),
        id: `msg_${Date.now()}_assistant`
      });

    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      });
    }
  });

  socket.on('clear_conversation', () => {
    const conversation = activeConversations.get(socket.id);
    if (conversation) {
      conversation.history = [];
      conversation.agent = new SimpleAgent(); // Reset agent
      console.log(`🗑️ Cleared conversation for ${socket.id}`);
    }
    socket.emit('conversation_cleared');
  });

  socket.on('get_history', () => {
    const conversation = activeConversations.get(socket.id);
    if (conversation) {
      socket.emit('history', {
        messages: conversation.history.map((msg, index) => ({
          ...msg,
          id: `msg_${index}_${msg.role}`,
          timestamp: msg.timestamp.toISOString()
        }))
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    activeConversations.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 ReAct Code Assistant GUI running on http://localhost:${PORT}`);
  console.log(`🎯 Open your browser to start coding with AI assistance`);
});

export default server;