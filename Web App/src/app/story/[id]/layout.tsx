import { stories } from "@/lib/stories";

export function generateStaticParams() {
  return stories.map((story) => ({
    id: story.id,
  }));
}

export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
