import Link from "next/link";
import { Badge } from "./Badge";
import { ProfileHeader } from "./ProfileHeader";

export interface GuildHeaderProps {
  name: string;
  memberCount: number;
  allianceName?: string | null;
  /** When set, the alliance name links to its page. */
  allianceHref?: string;
  className?: string;
}

/** Identity block at the top of a guild page. */
export function GuildHeader({
  name,
  memberCount,
  allianceName,
  allianceHref,
  className,
}: GuildHeaderProps) {
  const alliance =
    allianceName && allianceHref ? (
      <Link
        href={allianceHref}
        className="hover:text-amber-600 hover:underline dark:hover:text-amber-400"
      >
        {allianceName}
      </Link>
    ) : (
      (allianceName ?? "No alliance")
    );

  return (
    <ProfileHeader
      className={className}
      title={name}
      shape="square"
      badge={<Badge tone="gold">Guild</Badge>}
      subtitle={
        <>
          {alliance} · {memberCount} {memberCount === 1 ? "tracked member" : "tracked members"}
        </>
      }
    />
  );
}
