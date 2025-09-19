const fs = require("fs");
const { Client, GatewayIntentBits, Collection } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// State do wyzwań i wyników
client.pendingChallenges = {};
client.pendingResults = {};
client.cooldowns = {};

// Komendy
client.commands = new Collection();
const commandFiles = fs
  .readdirSync("./commands")
  .filter((f) => f.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.name, command);
}

// Logowanie
client.once("clientReady", () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

// Obsługa wiadomości
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Jeśli DM i wpisanie wyniku
  if (!message.guild && client.commands.has("wynik")) {
    return client.commands.get("wynik").execute(message);
  }

  // Serwerowe komendy
  const args = message.content.split(" ");
  const cmd = args[0].slice(1).toLowerCase();

  if (!message.content.startsWith("!") || !client.commands.has(cmd)) return;

  try {
    await client.commands.get(cmd).execute(message, args);
  } catch (err) {
    console.error(err);
    message.channel.send("❌ Wystąpił błąd podczas wykonywania komendy.");
  }
});

// Obsługa przycisków
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, key] = interaction.customId.split("_");

  // Akceptacja wyzwania
  if (action === "accept") {
    if (
      !client.pendingChallenges[key] ||
      client.pendingChallenges[key].status !== "pending"
    ) {
      return interaction.reply({
        content: "❌ Wyzwanie już zaakceptowane lub nie istnieje.",
        ephemeral: true,
      });
    }
    if (interaction.user.id !== key.split("_")[1]) {
      return interaction.reply({
        content: "❌ Nie możesz akceptować tego wyzwania.",
        ephemeral: true,
      });
    }

    client.pendingChallenges[key].status = "accepted";
    interaction.update({
      content: "✅ Wyzwanie zaakceptowane! Gracz A wpisuje teraz wynik w DM.",
      components: [],
    });

    const playerA = await client.users.fetch(key.split("_")[0]);
    playerA.send("🎯 Wpisz wynik meczu w formacie bramkiA:bramkiB np. 3:1");
  }

  // Potwierdzenie wyniku
  if (action === "confirm") {
    if (!client.pendingResults[key])
      return interaction.reply({
        content: "❌ Brak wyniku do zatwierdzenia.",
        ephemeral: true,
      });

    const { scoreA, scoreB } = client.pendingResults[key];
    const [playerA, playerB] = key.split("_");

    if (interaction.user.id !== playerB) {
      return interaction.reply({
        content: "❌ Nie możesz zatwierdzać wyniku za kogoś innego!",
        ephemeral: true,
      });
    }

    // Zaktualizuj ELO
    const { updateElo } = require("./utils/elo");
    const diff = updateElo(playerA, playerB, scoreA, scoreB);

    // Zapisz mecz
    const { saveMatch } = require("./utils/matches");
    saveMatch(playerA, playerB, scoreA, scoreB);

    delete client.pendingChallenges[key];
    delete client.pendingResults[key];

    await interaction.update({
      content: `✅ Wynik zatwierdzony: <@${playerA}> ${scoreA}:${scoreB} <@${playerB}>`,
      components: [],
    });

    // Wyślij wynik na kanał
    const WYNIKI_CHANNEL_ID = "1418222553524211752";
    const wynikiChannel = await client.channels.fetch(WYNIKI_CHANNEL_ID);
    if (wynikiChannel) {
      wynikiChannel.send(`📢 <@${playerA}> ${scoreA}:${scoreB} <@${playerB}>`);
    }
  }
});

// Uruchomienie bota
client.login(process.env.DISCORD_TOKEN);
