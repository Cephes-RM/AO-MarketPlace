import { PrismaClient } from "@prisma/client";
import { players } from "./players";
import { writeFileSync } from "fs";
import { join } from "path";
 
const prisma = new PrismaClient();

async function main() {
    console.log(`Starting to seed ${players.length} players...`);
    for(let player of players) {
        await prisma.player.upsert({
            where: { playerId: player.playerId },
            update: {},
            create: player,
        });
    }
    console.log("Seed completed successfully!");
    
    const allPlayers = await prisma.player.findMany();
    console.log(`Found ${allPlayers.length} players in database:`);
    allPlayers.forEach(player => {
        console.log(`- ${player.name} (playerId: ${player.playerId}, id: ${player.id})`);
    });
    
    // Generate documentation
    const header = "| ID | Name | Guild |\n|----|------|---------|";
    const rows = players
        .map((player) => `| ${player.playerId} | ${player.name} | ${player.guildName || "N/A"} |`)
        .join("\n");
    
    const content = `# Seeded Players

${header}
${rows}
`;
    
    const outputPath = join(__dirname, "../../../docs/seed_players.md");
    writeFileSync(outputPath, content);
    console.log(`Generated seeded players documentation at ${outputPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
