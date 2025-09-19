const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Pliki danych
const ELO_FILE = "elo.json";
const MATCH_FILE = "matches.json";

// Kanał z wynikami
const WYNIKI_CHANNEL_ID = "1418222553524211752";

// Drużyny
const CLUB_TEAMS = [
  { name: "Real Madrid", rating: 5 },
  { name: "Barcelona", rating: 5 },
  { name: "Manchester United", rating: 4 },
  { name: "Bayern Monachium", rating: 5 },
  { name: "Juventus", rating: 4 },
  { name: "Chelsea", rating: 4 },
  { name: "PSG", rating: 5 },
];

const NATIONAL_TEAMS = [
  { name: "Polska", rating: 3 },
  { name: "Niemcy", rating: 5 },
  { name: "Francja", rating: 5 },
  { name: "Brazylia", rating: 5 },
  { name: "Argentyna", rating: 5 },
  { name: "Hiszpania", rating: 5 },
  { name: "Włochy", rating: 4 },
];

// Wczytanie danych
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

// Cooldowns i pending
const cooldowns = {};
const pendingChallenges = {}; // key: playerA_playerB, value: {status: "pending"|"accepted", type}
const pendingResults = {}; // key: playerA_playerB, value: {scoreA, scoreB}

// Logowanie
client.once("ready", () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

// Komendy
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const args = message.content.split(" ");

  // !ping
  if (message.content === "!ping") return message.channel.send("🏓 Pong!");

  // !wyzwanie
  if (args[0] === "!wyzwanie" && message.mentions.users.size === 1) {
    const now = Date.now();
    const userId = message.author.id;
    if (cooldowns[userId] && now - cooldowns[userId] < 5000) {
      return message.channel.send(
        "⏳ Odczekaj chwilę zanim wyzwiesz kolejnego gracza."
      );
    }
    cooldowns[userId] = now;

    const userB = message.mentions.users.first();
    const type = args[2] ? args[2].toLowerCase() : "mix";
    const key = `${message.author.id}_${userB.id}`;
    pendingChallenges[key] = { status: "pending", type };

    // Powiadomienie gracza B
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${key}`)
        .setLabel("✅ Akceptuj wyzwanie")
        .setStyle(ButtonStyle.Success)
    );

    try {
      await userB.send({
        content: `🎯 <@${message.author.id}> rzucił Ci wyzwanie! Kliknij, aby zaakceptować.`,
        components: [row],
      });
      message.channel.send(`✅ Wyzwanie wysłane do <@${userB.id}>`);
    } catch (err) {
      message.channel.send("❌ Nie udało się wysłać DM do gracza.");
    }
  }

  // DM: wpisywanie wyniku
  if (!message.guild) {
    const pendingKey = Object.keys(pendingChallenges).find(
      (k) =>
        pendingChallenges[k].status === "accepted" &&
        k.startsWith(message.author.id)
    );
    if (!pendingKey) return;

    const match = message.content.match(/^(\d+):(\d+)$/);
    if (!match)
      return message.channel.send("⚠️ Użyj formatu bramkiA:bramkiB np. 2:1");

    const [scoreA, scoreB] = [parseInt(match[1]), parseInt(match[2])];
    pendingResults[pendingKey] = { scoreA, scoreB };

    const playerBId = pendingKey.split("_")[1];
    const playerBUser = await client.users.fetch(playerBId);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_${pendingKey}`)
        .setLabel("✅ Zatwierdź wynik")
        .setStyle(ButtonStyle.Success)
    );

    playerBUser.send({
      content: `📢 <@${message.author.id}> wpisał wynik: ${scoreA}:${scoreB}. Potwierdź wynik.`,
      components: [row],
    });
    return message.channel.send(
      "✅ Wynik wpisany. Czekaj na zatwierdzenie przez przeciwnika."
    );
  }
});

// InteractionCreate dla przycisków
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, ...rest] = interaction.customId.split("_");
  const key = rest.join("_");

  // Akceptacja wyzwania
  if (action === "accept") {
    const challenge = pendingChallenges[key];
    if (!challenge || challenge.status !== "pending") {
      return interaction.reply({
        content: "❌ Wyzwanie już zaakceptowane lub nie istnieje.",
        ephemeral: true,
      });
    }

    const playerBId = key.split("_")[1];
    if (interaction.user.id !== playerBId) {
      return interaction.reply({
        content: "❌ Tylko zaproszony gracz może zaakceptować wyzwanie.",
        ephemeral: true,
      });
    }

    challenge.status = "accepted";
    await interaction.update({
      content: "✅ Wyzwanie zaakceptowane! Gracz A wpisuje teraz wynik w DM.",
      components: [],
    });

    // Powiadom gracza A w DM
    const playerAId = key.split("_")[0];
    const playerA = await client.users.fetch(playerAId);
    playerA.send(
      `🎯 Twoje wyzwanie zostało zaakceptowane! Wpisz wynik meczu w formacie bramkiA:bramkiB np. 2:1`
    );
    return;
  }

  // Potwierdzenie wyniku
  if (action === "confirm") {
    const result = pendingResults[key];
    if (!result)
      return interaction.reply({
        content: "❌ Brak wyniku do zatwierdzenia.",
        ephemeral: true,
      });

    const [playerAId, playerBId] = key.split("_");
    if (interaction.user.id !== playerBId) {
      return interaction.reply({
        content: "❌ Tylko gracz B może zatwierdzić wynik.",
        ephemeral: true,
      });
    }

    const diff = updateElo(playerAId, playerBId, result.scoreA, result.scoreB);
    matches.push({
      playerA: playerAId,
      playerB: playerBId,
      scoreA: result.scoreA,
      scoreB: result.scoreB,
      date: new Date().toISOString(),
    });
    fs.writeFileSync(MATCH_FILE, JSON.stringify(matches, null, 2));

    delete pendingChallenges[key];
    delete pendingResults[key];

    await interaction.update({
      content: `✅ Wynik zatwierdzony: <@${playerAId}> ${result.scoreA}:${result.scoreB} <@${playerBId}>`,
      components: [],
    });

    const wynikiChannel = await client.channels.fetch(WYNIKI_CHANNEL_ID);
    if (wynikiChannel) {
      wynikiChannel.send(
        `📢 <@${playerAId}> ${result.scoreA}:${result.scoreB} <@${playerBId}> — (${elo[playerAId]} / ${elo[playerBId]})`
      );
    }
  }
});

// Uruchomienie bota
require("dotenv").config();
client.login(process.env.DISCORD_TOKEN);
