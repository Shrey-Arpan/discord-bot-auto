import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import dotenv from "dotenv";
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
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
    return JSON.parse(data);
  } catch (error) {
    return { scheduled_messages: [] };
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

async function scheduleMessage(msgData: any) {
  const date = new Date(msgData.scheduledTime);
  if (!isAfter(date, new Date())) return;

  const job = schedule.scheduleJob(date, async () => {
    try {
      const channel = await client.channels.fetch(msgData.channelId);
      if (channel?.isTextBased()) {
        await (channel as any).send(msgData.message);
        // Update status in local DB
        const db = await readDB();
        const index = db.scheduled_messages.findIndex((m: any) => m.id === msgData.id);
        if (index !== -1) {
          db.scheduled_messages[index].status = "sent";
          await writeDB(db);
        }
      }
    } catch (err) {
      console.error("Failed to send scheduled message:", err);
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
  if (!interaction.isChatInputCommand()) return;

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
      channelId: targetChannel!.id,
      message,
      scheduledTime: scheduledTime.toISOString(),
      createdAt: new Date().toISOString(),
      status: "pending",
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
      channelId: channelId!,
      message,
      scheduledTime: scheduledTime.toISOString(),
      createdAt: new Date().toISOString(),
      status: "pending",
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
});

if (process.env.DISCORD_TOKEN) {
  client.login(process.env.DISCORD_TOKEN);
} else {
  console.warn("DISCORD_TOKEN not found. Bot will not start.");
}

// API for Frontend
app.get("/api/messages", async (req, res) => {
  const db = await readDB();
  res.json(db.scheduled_messages);
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
