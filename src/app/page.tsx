// Placeholder home. The capture agent replaces this with the real Home screen.
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex h-full items-center justify-center">
      <Link href="/capture" className="rounded-full bg-neon px-8 py-4 font-semibold text-black">
        Record a swing
      </Link>
    </div>
  );
}
