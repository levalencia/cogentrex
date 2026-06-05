import { redirect } from 'next/navigation';

export default async function SkillDetailRedirectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/workflows/${encodeURIComponent(slug)}`);
}
