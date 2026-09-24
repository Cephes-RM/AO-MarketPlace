import Link from "next/link";
import { Badge } from "./Badge";
import { ProfileHeader } from "./ProfileHeader";
import { StarRating } from "./StarRating";

export interface PlayerHeaderProps {
  name: string;
  region: string;
  guildName?: string | null;
  alliance?: string | null;
  rating: number;
  stars: number;
  /** When set, the guild name links to its page. */
  guildHref?: string;
  className?: string;
}

/** Identity block at the top of a player page. */
export function PlayerHeader({
  name,
  region,
  guildName,
  alliance,
  rating,
  stars,
  guildHref,
  className,
}: PlayerHeaderProps) {
  const guild =
    guildName && guildHref ? (
      <Link href={guildHref} className="hover:text-amber-600 hover:underline dark:hover:text-amber-400">
        {guildName}
      </Link>
    ) : (
      (guildName ?? "No guild")
    );

  return (
    <ProfileHeader
      className={className}
      title={name}
      shape="circle"
      badge={<Badge>{region.toUpperCase()}</Badge>}
      subtitle={
        <>
          {guild}
          {alliance ? <span> · [{alliance}]</span> : null}
        </>
      }
      aside={
        <>
          <StarRating value={stars} />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Rating{" "}
            <span className="font-semibold text-neutral-900 tabular-nums dark:text-neutral-100">
              {rating}
            </span>
          </p>
        </>
      }
    />
  );
}
