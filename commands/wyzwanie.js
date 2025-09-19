const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { CLUB_TEAMS, NATIONAL_TEAMS } = require("../state/data");
const { pendingChallenges } = require("../state/pending");

module.exports = {
  name: "wyzwanie",
  description: "Rzuca wyzwanie innemu graczowi",
  cooldown: 5000,
  execute: async (message, args) => {
    if (message.mentions.users.size !== 1) return;

    const now = Date.now();
    message.client.cooldowns[message.author.id] = now;

    const userB = message.mentions.users.first();
    const type = args[2] ? args[2].toLowerCase() : "mix";
    const key = `${message.author.id}_${userB.id}`;
    pendingChallenges[key] = { status: "pending", type };

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

    const embed = new EmbedBuilder()
      .setTitle("🎲 Nowe wyzwanie!")
      .setDescription(
        `**${message.author.username}** (${team1.name}) vs **${userB.username}** (${team2.name})\n⭐ Poziom siły: ${chosenRating}`
      )
      .setColor(0x00aeff);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${key}`)
        .setLabel("✅ Akceptuj")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`decline_${key}`)
        .setLabel("❌ Odrzuć")
        .setStyle(ButtonStyle.Danger)
    );

    message.channel.send({ embeds: [embed], components: [row] });
  },
};
