import { VERSION } from "@albion/rating-engine";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 font-sans">
      <h1 className="text-2xl font-semibold">albion-platform skeleton</h1>
      <p className="font-mono text-sm">@albion/rating-engine v{VERSION}</p>
    </main>
  );
}
