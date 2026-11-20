import { HomeHero } from "@/features/home";

// Home: fully static shell (CDN). Shared cached holes and streamed holes arrive in Phase 3.
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-content flex-col gap-12 px-6 pt-6 pb-16">
      <HomeHero />
    </main>
  );
}
