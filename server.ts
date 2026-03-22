import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import dotenv from "dotenv";
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, InteractionType } from "discord.js";
import schedule from "node-schedule";
import { format, isAfter } from "date-fns";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "db.json");

app.use(express.json());
app.use(cors());

// Local JSON Storage Helper
async function readDB() {
  try {
    const data = await fs.readFile(DB_FILE, "utf-8");
    const db = JSON.parse(data);
    if (!db.scheduled_messages) db.scheduled_messages = [];
    if (!db.user_tokens) db.user_tokens = {};
    return db;
  } catch (error) {
    return { scheduled_messages: [], user_tokens: {} };
  }
}

async function writeDB(data: any) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

// Discord Bot Setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const commands = [
  new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Schedule a message")
    .addStringOption(opt => opt.setName("message").setDescription("The message to send").setRequired(true))
    .addStringOption(opt => opt.setName("date").setDescription("YYYY-MM-DD").setRequired(true))
    .addStringOption(opt => opt.setName("time").setDescription("HH:MM").setRequired(true))
    .addChannelOption(opt => opt.setName("channel").setDescription("Target channel (optional)")),
  new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set a quick reminder")
    .addStringOption(opt => opt.setName("message").setDescription("The message to send").setRequired(true))
    .addStringOption(opt => opt.setName("delay").setDescription("e.g., 10m, 1h, 2d").setRequired(true)),
  new SlashCommandBuilder()
    .setName("list")
    .setDescription("List your pending scheduled messages"),
  new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Delete a scheduled message")
    .addStringOption(opt => opt.setName("id").setDescription("The message ID").setRequired(true)),
  new SlashCommandBuilder()
    .setName("hi")
    .setDescription("Koya One Piece Game Commands")
    .addStringOption(opt => opt.setName("action")
      .setDescription("The game action to perform")
      .setRequired(true)
      .addChoices(
        { name: "Adventure", value: "adventure" },
        { name: "Profile", value: "profile" },
        { name: "Daily", value: "daily" },
        { name: "Inventory", value: "inventory" },
        { name: "Hunt", value: "hunt" }
      ))
    .addStringOption(opt => opt.setName("delay")
      .setDescription("Delay before sending (e.g. 5m, 1h)")),
  new SlashCommandBuilder()
    .setName("reg")
    .setDescription("Register your Discord token (User Mode)"),
  new SlashCommandBuilder()
    .setName("unreg")
    .setDescription("Unregister your Discord token"),
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

async function registerCommands() {
  try {
    console.log("Started refreshing application (/) commands.");
    if (process.env.DISCORD_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID!, process.env.DISCORD_GUILD_ID),
        { body: commands }
      );
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
        { body: commands }
      );
    }
    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
}

// Job Scheduler
const jobs = new Map<string, schedule.Job>();

// Raw API Message Sender (Mimics Browser/User Headers)
async function sendMessageRaw(channelId: string, content: string, userId: string) {
  const db = await readDB();
  const userToken = db.user_tokens[userId];
  const token = userToken || process.env.DISCORD_TOKEN;
  const isBot = !userToken;
  
  if (!token) {
    console.error(`No token found for user ${userId} or bot.`);
    return false;
  }

  const headers: any = {
    "authority": "discord.com",
    "method": "POST",
    "path": `/api/v9/channels/${channelId}/messages`,
    "scheme": "https",
    "accept": "*/*",
    "accept-language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,hi;q=0.6",
    "authorization": isBot ? `Bot ${token}` : token,
    "content-type": "application/json",
    "origin": "https://discord.com",
    "referer": `https://discord.com/channels/@me/${channelId}`,
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    "x-discord-locale": "en-US",
    "x-discord-timezone": "Asia/Calcutta",
    "x-debug-options": "bugReporterEnabled",
  };

  // Add super properties if it's a user token (mimicking real client)
  if (!isBot) {
    headers["x-super-properties"] = "eyJvcyI6IldpbmRvd3MiLCJicm93.."; 
  }

  try {
    const response = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        content,
        tts: false,
        flags: 0
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Discord API Error:", errorData);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Failed to send raw API message:", err);
    return false;
  }
}

async function scheduleMessage(msgData: any) {
  const date = new Date(msgData.scheduledTime);
  if (!isAfter(date, new Date())) return;

  const job = schedule.scheduleJob(date, async () => {
    const success = await sendMessageRaw(msgData.channelId, msgData.message, msgData.userId);
    if (success) {
      const db = await readDB();
      const index = db.scheduled_messages.findIndex((m: any) => m.id === msgData.id);
      if (index !== -1) {
        db.scheduled_messages[index].status = "sent";
        await writeDB(db);
      }
    }
  });

  if (job) {
    jobs.set(msgData.id, job);
  }
}

async function loadPendingMessages() {
  const db = await readDB();
  const pending = db.scheduled_messages.filter((m: any) => m.status === "pending");
  pending.forEach((m: any) => scheduleMessage(m));
  console.log(`Loaded ${pending.length} pending messages.`);
}

client.on("ready", () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  registerCommands();
  loadPendingMessages();
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName, user, channelId } = interaction;

    if (commandName === "schedule") {
      const message = interaction.options.getString("message")!;
      const dateStr = interaction.options.getString("date")!;
      const timeStr = interaction.options.getString("time")!;
      const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

      const scheduledTime = new Date(`${dateStr}T${timeStr}:00`);
      if (isNaN(scheduledTime.getTime()) || !isAfter(scheduledTime, new Date())) {
        return interaction.reply({ content: "❌ Invalid date or time. Must be in the future (YYYY-MM-DD HH:MM).", ephemeral: true });
      }

      const id = Math.random().toString(36).substring(2, 11);
      const msgData = {
        id,
        userId: user.id,
        username: user.username,
        channelId: targetChannel!.id,
        message,
        scheduledTime: scheduledTime.toISOString(),
        createdAt: new Date().toISOString(),
        status: "pending",
        category: "user",
      };

      const db = await readDB();
      db.scheduled_messages.push(msgData);
      await writeDB(db);
      scheduleMessage(msgData);

      await interaction.reply(`✅ Message scheduled for ${format(scheduledTime, "PPPP p")} in <#${targetChannel!.id}>. ID: \`${id}\``);
    }

    if (commandName === "remind") {
      const message = interaction.options.getString("message")!;
      const delayStr = interaction.options.getString("delay")!;

      const match = delayStr.match(/^(\d+)([mhd])$/);
      if (!match) {
        return interaction.reply({ content: "❌ Invalid delay format. Use e.g., 10m, 1h, 2d.", ephemeral: true });
      }

      const value = parseInt(match[1]);
      const unit = match[2];
      const now = new Date();
      let scheduledTime = new Date(now);

      if (unit === "m") scheduledTime.setMinutes(now.getMinutes() + value);
      else if (unit === "h") scheduledTime.setHours(now.getHours() + value);
      else if (unit === "d") scheduledTime.setDate(now.getDate() + value);

      const id = Math.random().toString(36).substring(2, 11);
      const msgData = {
        id,
        userId: user.id,
        username: user.username,
        channelId: channelId!,
        message,
        scheduledTime: scheduledTime.toISOString(),
        createdAt: new Date().toISOString(),
        status: "pending",
        category: "user",
      };

      const db = await readDB();
      db.scheduled_messages.push(msgData);
      await writeDB(db);
      scheduleMessage(msgData);

      await interaction.reply(`✅ Reminder set for ${format(scheduledTime, "PPPP p")}. ID: \`${id}\``);
    }

    if (commandName === "list") {
      const db = await readDB();
      const userMessages = db.scheduled_messages.filter((m: any) => m.userId === user.id && m.status === "pending");

      if (userMessages.length === 0) {
        return interaction.reply({ content: "You have no pending scheduled messages.", ephemeral: true });
      }

      const list = userMessages.map((d: any) => {
        return `\`${d.id}\`: "${d.message}" at ${format(new Date(d.scheduledTime), "Pp")}`;
      }).join("\n");

      await interaction.reply({ content: `**Your Pending Messages:**\n${list}`, ephemeral: true });
    }

    if (commandName === "delete") {
      const id = interaction.options.getString("id")!;
      const db = await readDB();
      const index = db.scheduled_messages.findIndex((m: any) => m.id === id && m.userId === user.id);

      if (index === -1) {
        return interaction.reply({ content: "❌ Message not found or you don't have permission.", ephemeral: true });
      }

      db.scheduled_messages[index].status = "cancelled";
      await writeDB(db);

      const job = jobs.get(id);
      if (job) {
        job.cancel();
        jobs.delete(id);
      }

      await interaction.reply(`✅ Scheduled message \`${id}\` has been cancelled.`);
    }

    if (commandName === "hi") {
      const action = interaction.options.getString("action")!;
      const delayStr = interaction.options.getString("delay") || "0m";
      
      const message = `!${action}`; // Koya uses ! prefix for game commands
      
      const match = delayStr.match(/^(\d+)([mhd])$/);
      let scheduledTime = new Date();
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        if (unit === "m") scheduledTime.setMinutes(scheduledTime.getMinutes() + value);
        else if (unit === "h") scheduledTime.setHours(scheduledTime.getHours() + value);
        else if (unit === "d") scheduledTime.setDate(scheduledTime.getDate() + value);
      }

      const id = Math.random().toString(36).substring(2, 11);
      const msgData = {
        id,
        userId: user.id,
        username: user.username,
        channelId: channelId!,
        message,
        scheduledTime: scheduledTime.toISOString(),
        createdAt: new Date().toISOString(),
        status: "pending",
        category: "koya",
      };

      const db = await readDB();
      db.scheduled_messages.push(msgData);
      await writeDB(db);
      scheduleMessage(msgData);

      await interaction.reply(`🏴‍☠️ Koya **${action}** scheduled for ${format(scheduledTime, "Pp")}.`);
    }

    if (commandName === "reg") {
      const modal = new ModalBuilder()
        .setCustomId("reg_modal")
        .setTitle("Register Discord Token");

      const tokenInput = new TextInputBuilder()
        .setCustomId("token_input")
        .setLabel("Enter your Discord Authorization Token")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Paste your token here...")
        .setRequired(true);

      const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(tokenInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    }

    if (commandName === "unreg") {
      const db = await readDB();
      if (!db.user_tokens[user.id]) {
        return interaction.reply({ content: "❌ You are not registered.", ephemeral: true });
      }

      delete db.user_tokens[user.id];
      await writeDB(db);
      await interaction.reply({ content: "✅ Token unregistered successfully. Reverting to Bot Mode.", ephemeral: true });
    }
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.customId === "reg_modal") {
      const token = interaction.fields.getTextInputValue("token_input");
      const user = interaction.user;
      const db = await readDB();
      
      if (!db.user_tokens[user.id] && Object.keys(db.user_tokens).length >= 5) {
        return interaction.reply({ content: "❌ Registration limit reached (max 5 users).", ephemeral: true });
      }

      db.user_tokens[user.id] = token;
      await writeDB(db);
      await interaction.reply({ content: "✅ Token registered successfully! You are now in User Mode.", ephemeral: true });
    }
  }
});

if (process.env.DISCORD_TOKEN) {
  client.login(process.env.DISCORD_TOKEN);
} else {
  console.warn("DISCORD_TOKEN not found. Bot will not start.");
}

// API for Frontend
app.get("/api/messages", async (req, res) => {
  const db = await readDB();
  res.json({ 
    user_messages: db.scheduled_messages.filter((m: any) => m.category === "user"),
    koya_messages: db.scheduled_messages.filter((m: any) => m.category === "koya")
  });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
