import { Badge } from "./Badge";
import { ProfileHeader } from "./ProfileHeader";

export interface AllianceHeaderProps {
  name: string;
  guildCount: number;
  memberCount: number;
  className?: string;
}

/** Identity block at the top of an alliance page. */
export function AllianceHeader({
  name,
  guildCount,
  memberCount,
  className,
}: AllianceHeaderProps) {
  return (
    <ProfileHeader
      className={className}
      title={name}
      shape="square"
      badge={<Badge tone="gold">Alliance</Badge>}
      subtitle={
        <>
          {guildCount} {guildCount === 1 ? "guild" : "guilds"} · {memberCount}{" "}
          {memberCount === 1 ? "tracked member" : "tracked members"}
        </>
      }
    />
  );
}
