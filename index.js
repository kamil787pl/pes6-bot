const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  Collection,
  InteractionType,
} = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Modularne komendy
client.commands = new Collection();
const wyzwanieCommand = require("./commands/wyzwanie");
const wynikCommand = require("./commands/wynik");
client.commands.set(wyzwanieCommand.name, wyzwanieCommand);
client.commands.set(wynikCommand.name, wynikCommand);

// Cooldowns
client.cooldowns = {};

// State globalny
const { pendingChallenges, pendingResults } = require("./state/pending");

// Kanał z wynikami
const WYNIKI_CHANNEL_ID = "1418222553524211752";

// Pliki ELO i mecze
const ELO_FILE = "elo.json";
const MATCH_FILE = "matches.json";

let elo = fs.existsSync(ELO_FILE) ? JSON.parse(fs.readFileSync(ELO_FILE)) : {};
let matches = fs.existsSync(MATCH_FILE)
  ? JSON.parse(fs.readFileSync(MATCH_FILE))
  : [];

// Funkcja ELO
function updateElo(playerA, playerB, scoreA, scoreB) {
  const K = 30;
  if (!elo[playerA]) elo[playerA] = 1000;
  if (!elo[playerB]) elo[playerB] = 1000;
  const expectedA = 1 / (1 + Math.pow(10, (elo[playerB] - elo[playerA]) / 400));
  const resultA = scoreA > scoreB ? 1 : scoreA === scoreB ? 0.5 : 0;
  const resultB = 1 - resultA;
  const oldA = elo[playerA];
  const oldB = elo[playerB];
  elo[playerA] = Math.round(elo[playerA] + K * (resultA - expectedA));
  elo[playerB] = Math.round(elo[playerB] + K * (resultB - expectedB));
  fs.writeFileSync(ELO_FILE, JSON.stringify(elo, null, 2));
  return { a: elo[playerA] - oldA, b: elo[playerB] - oldB };
}

// Logowanie
client.once("ready", () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

// Obsługa wiadomości
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");
  const commandName = args[0].substring(1).toLowerCase();

  // Komenda w DM do wpisywania wyniku
  if (!message.guild) {
    if (client.commands.has("wynik")) {
      await client.commands.get("wynik").execute(message, args);
    }
    return;
  }

  // Komendy serwerowe
  if (!message.content.startsWith("!")) return;
  if (client.commands.has(commandName)) {
    await client.commands.get(commandName).execute(message, args);
  }
});

// Obsługa przycisków
client.on("interactionCreate", async (interaction) => {
  if (interaction.type !== InteractionType.MessageComponent) return;

  const [action, key] = interaction.customId.split("_");

  // Akceptacja wyzwania
  if (action === "accept") {
    if (
      !pendingChallenges[key] ||
      pendingChallenges[key].status !== "pending"
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

    pendingChallenges[key].status = "accepted";
    await interaction.update({
      content: "✅ Wyzwanie zaakceptowane! Gracz A wpisuje teraz wynik w DM.",
      components: [],
    });

    const playerAId = key.split("_")[0];
    const playerA = await client.users.fetch(playerAId);
    playerA.send("🎯 Wpisz wynik meczu w formacie bramkiA:bramkiB np. 3:1");
    return;
  }

  // Potwierdzenie wyniku
  if (action === "confirm") {
    if (!pendingResults[key]) {
      return interaction.reply({
        content: "❌ Brak wyniku do zatwierdzenia.",
        ephemeral: true,
      });
    }

    const { scoreA, scoreB } = pendingResults[key];
    const [playerA, playerB] = key.split("_");

    if (interaction.user.id !== playerB) {
      return interaction.reply({
        content: "❌ Nie możesz zatwierdzać wyniku za kogoś innego!",
        ephemeral: true,
      });
    }

    const diff = updateElo(playerA, playerB, scoreA, scoreB);
    matches.push({
      playerA,
      playerB,
      scoreA,
      scoreB,
      date: new Date().toISOString(),
    });
    fs.writeFileSync(MATCH_FILE, JSON.stringify(matches, null, 2));

    delete pendingChallenges[key];
    delete pendingResults[key];

    await interaction.update({
      content: `✅ Wynik zatwierdzony: <@${playerA}> ${scoreA}:${scoreB} <@${playerB}>`,
      components: [],
    });

    const wynikiChannel = await client.channels.fetch(WYNIKI_CHANNEL_ID);
    if (wynikiChannel) {
      wynikiChannel.send(
        `📢 <@${playerA}> ${scoreA}:${scoreB} <@${playerB}> — (${elo[playerA]} / ${elo[playerB]})`
      );
    }
  }
});

// Uruchomienie bota
client.login(process.env.DISCORD_TOKEN);
