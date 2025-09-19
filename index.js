const { Client, GatewayIntentBits, Collection } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Kolekcje komend
client.commands = new Collection();
["wyzwanie", "ranking", "historia", "profil"].forEach((cmd) => {
  client.commands.set(cmd, require(`./commands/${cmd}.js`));
});

// Cooldowns
client.cooldowns = {};

// Eventy
client.on("messageCreate", require("./events/messageCreate"));
client.on("interactionCreate", require("./events/interactionCreate"));

// Logowanie
client.once("ready", () =>
  console.log(`✅ Zalogowano jako ${client.user.tag}`)
);

client.login(process.env.DISCORD_TOKEN);
