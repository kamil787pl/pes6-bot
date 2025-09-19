const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { pendingChallenges } = require("../state/pending");

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

module.exports = {
  name: "wyzwanie",
  description: "Rzuca wyzwanie innemu graczowi",
  cooldown: 5000,
  execute: async (message, args) => {
    if (message.mentions.users.size !== 1) return;
    const userB = message.mentions.users.first();
    const type = args[2] ? args[2].toLowerCase() : "mix";
    const key = `${message.author.id}_${userB.id}`;

    // Sprawdź cooldown
    message.client.cooldowns = message.client.cooldowns || {};
    const now = Date.now();
    if (
      message.client.cooldowns[message.author.id] &&
      now - message.client.cooldowns[message.author.id] < 5000
    ) {
      return message.channel.send(
        "⏳ Odczekaj chwilę zanim wyzwiesz kolejnego gracza."
      );
    }
    message.client.cooldowns[message.author.id] = now;

    // Dodaj wyzwanie
    pendingChallenges[key] = { status: "pending", type };

    // Losowanie drużyn
    let pool =
      type === "klub"
        ? CLUB_TEAMS
        : type === "repr"
        ? NATIONAL_TEAMS
        : [...CLUB_TEAMS, ...NATIONAL_TEAMS];
    const availableRatings = [...new Set(pool.map((t) => t.rating))];
    const chosenRating =
      availableRatings[Math.floor(Math.random() * availableRatings.length)];
    const sameLevelTeams = pool.filter((t) => t.rating === chosenRating);
    const team1 =
      sameLevelTeams[Math.floor(Math.random() * sameLevelTeams.length)];
    const team2 =
      sameLevelTeams[Math.floor(Math.random() * sameLevelTeams.length)];

    // Embed serwerowy
    const embed = new EmbedBuilder()
      .setTitle("🎲 Nowe wyzwanie!")
      .setDescription(
        `**${message.author.username}** (${team1.name}) vs **${userB.username}** (${team2.name})\n⭐ Poziom siły: ${chosenRating}`
      )
      .setColor(0x00aeff);
    message.channel.send({ embeds: [embed] });

    // DM do gracza B
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${key}`)
        .setLabel("✅ Akceptuj wyzwanie")
        .setStyle(ButtonStyle.Success)
    );

    try {
      await userB.send({
        content: `🎯 <@${message.author.id}> rzucił Ci wyzwanie! Kliknij aby zaakceptować.`,
        components: [row],
      });
      message.channel.send(`✅ Wyzwanie wysłane do <@${userB.id}>`);
    } catch {
      message.channel.send("❌ Nie udało się wysłać DM do gracza.");
    }
  },
};
