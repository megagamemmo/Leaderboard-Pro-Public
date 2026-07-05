import { permanentRedirect } from "next/navigation";

type SharePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function SharePage({ params }: SharePageProps) {
  const { slug } = await params;
  permanentRedirect(`/live/${encodeURIComponent(slug)}`);
}
