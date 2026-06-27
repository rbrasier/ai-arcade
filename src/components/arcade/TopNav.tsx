import Link from "next/link";

export function TopNav({
  level,
  initial,
  active = "arcade",
}: {
  level: number;
  initial: string;
  active?: "arcade" | "leaderboard";
}) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-[#e2dcca] pb-[22px]">
      <div className="flex items-baseline gap-3">
        <Link
          href="/"
          className="font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] text-[#211f1a] no-underline"
        >
          AI Arcade<span className="text-[#ec5a3a]">.</span>
        </Link>
      </div>
      <div className="flex items-center gap-7">
        <div className="hidden gap-6 text-[15px] font-semibold sm:flex">
          <NavLink href="/" active={active === "arcade"}>
            Arcade
          </NavLink>
          <NavLink href="/leaderboard" active={active === "leaderboard"}>
            Leaderboard
          </NavLink>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-[#ec5a3a] px-[11px] py-[5px] font-arcade-mono text-[12px] font-bold tracking-[.04em] text-white">
            LVL {level}
          </div>
          <div
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full font-display text-[15px] font-bold text-[#f3efe4]"
            style={{ background: "linear-gradient(135deg,#2f2b22,#56503f)" }}
          >
            {initial}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`no-underline ${
        active
          ? "border-b-2 border-[#ec5a3a] pb-[3px] text-[#211f1a]"
          : "text-[#9a9488] hover:text-[#211f1a]"
      }`}
    >
      {children}
    </Link>
  );
}
