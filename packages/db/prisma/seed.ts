import { PrismaClient } from "@prisma/client";
import { players } from "./players";
import { writeFileSync } from "fs";
import { join } from "path";
 
const prisma = new PrismaClient();

async function main() {
    for(let player of players) {
        await prisma.player.upsert({
            where: { playerId: player.playerId },
            update: player ,
            create: player,
        });
    }
    
    // Generate documentation
    const rows = players
        .map((player) => `- ${player.playerId}`)
        .join("\n");
    const content = `# Seeded Players

${rows}
`;
    
    const outputPath = join(__dirname, "../../../docs/seed_players.md");
    writeFileSync(outputPath, content);
}

main()
  .catch((e) => {
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
